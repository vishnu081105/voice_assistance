import { Blob } from "node:buffer";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { sttServiceManager } from "./sttServiceManager.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildError(message, { statusCode = 500, code = "STT_REQUEST_FAILED", details, retriable = false } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.retriable = retriable;
  return error;
}

async function parseJsonResponse(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {
      error: {
        message: raw,
      },
    };
  }
}

function shouldRetryStatus(statusCode) {
  return statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
}

function shouldRetryError(error) {
  if (error?.retriable) return true;
  if (error?.name === "AbortError") return true;

  const statusCode = Number(error?.statusCode || 0);
  if (shouldRetryStatus(statusCode)) return true;

  const message = String(error?.message || "").toLowerCase();
  return [
    "timeout",
    "timed out",
    "temporarily unavailable",
    "connection refused",
    "econnrefused",
    "socket hang up",
    "gpu",
    "cuda",
    "memory",
    "out of memory",
    "service unavailable",
    "overload",
    "unhealthy",
  ].some((token) => message.includes(token));
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

class TranscriptionQueue {
  constructor({
    concurrency = config.sttMaxConcurrentJobs,
    maxQueueSize = config.sttMaxQueueSize,
    retryDelaysMs = config.sttRetryDelaysMs,
  } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.maxQueueSize = Math.max(1, maxQueueSize);
    this.retryDelaysMs = Array.isArray(retryDelaysMs) && retryDelaysMs.length > 0 ? retryDelaysMs : [1000, 3000, 5000];
    this.pending = [];
    this.activeCount = 0;
    this.healthSnapshot = {
      ok: false,
      status: "unknown",
      checked_at: null,
      service_url: config.sttServiceUrl,
      details: null,
    };
    this.healthPromise = null;
    this.healthMonitor = setInterval(() => {
      void this.checkHealth({ force: true }).catch(() => {});
    }, config.sttHealthPollMs);
    this.healthMonitor.unref?.();
  }

  getSnapshot() {
    return {
      ...this.healthSnapshot,
      queue_depth: this.pending.length,
      active_jobs: this.activeCount,
      concurrency: this.concurrency,
      max_queue_size: this.maxQueueSize,
      retry_delays_ms: [...this.retryDelaysMs],
    };
  }

  enqueue({ jobName = "transcription", metadata = {}, execute }) {
    if (typeof execute !== "function") {
      return Promise.reject(
        buildError("Transcription queue received an invalid job.", {
          statusCode: 500,
          code: "INVALID_STT_JOB",
        })
      );
    }

    if (this.pending.length + this.activeCount >= this.maxQueueSize) {
      return Promise.reject(
        buildError("Transcription service is busy. Please retry shortly.", {
          statusCode: 503,
          code: "STT_QUEUE_OVERLOADED",
          retriable: true,
          details: {
            queue_depth: this.pending.length,
            active_jobs: this.activeCount,
            max_queue_size: this.maxQueueSize,
          },
        })
      );
    }

    return new Promise((resolve, reject) => {
      this.pending.push({
        jobName,
        metadata,
        execute,
        resolve,
        reject,
      });
      this.drain();
    });
  }

  drain() {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) return;
      this.activeCount += 1;
      void this.runJob(job).finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.drain();
      });
    }
  }

  async runJob(job) {
    const maxAttempts = this.retryDelaysMs.length + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await job.execute({ attempt });
        job.resolve(result);
        return;
      } catch (error) {
        const retriable = shouldRetryError(error);
        const hasRetryRemaining = attempt < maxAttempts;

        logger.warn("stt.job_failed", {
          job_name: job.jobName,
          attempt,
          max_attempts: maxAttempts,
          retriable,
          queue_depth: this.pending.length,
          active_jobs: this.activeCount,
          error_code: error?.code || "STT_REQUEST_FAILED",
          error_message: error instanceof Error ? error.message : String(error),
          ...job.metadata,
        });

        if (!retriable || !hasRetryRemaining) {
          job.reject(error);
          return;
        }

        const delayMs = this.retryDelaysMs[attempt - 1] ?? this.retryDelaysMs[this.retryDelaysMs.length - 1];
        await sleep(delayMs);
      }
    }
  }

  async checkHealth({ force = false } = {}) {
    const now = Date.now();
    if (
      !force &&
      this.healthSnapshot.checked_at &&
      now - this.healthSnapshot.checked_at < config.sttHealthCacheMs
    ) {
      return this.healthSnapshot;
    }

    if (this.healthPromise && !force) {
      return this.healthPromise;
    }

    this.healthPromise = this.fetchHealth()
      .then((snapshot) => {
        const previousOk = this.healthSnapshot.ok;
        this.healthSnapshot = snapshot;

        if (snapshot.ok !== previousOk) {
          logger.info("stt.health_changed", {
            ok: snapshot.ok,
            status: snapshot.status,
            service_url: snapshot.service_url,
            details: snapshot.details,
          });
        }

        return snapshot;
      })
      .finally(() => {
        this.healthPromise = null;
      });

    return this.healthPromise;
  }

  async fetchHealth() {
    const controller = createTimeoutController(config.sttHealthTimeoutMs);

    try {
      const response = await fetch(`${config.sttServiceUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      const payload = await parseJsonResponse(response);
      const ok = response.ok && payload?.ok !== false;

      return {
        ok,
        status: ok ? "available" : "unavailable",
        checked_at: Date.now(),
        service_url: config.sttServiceUrl,
        details: payload,
      };
    } catch (error) {
      return {
        ok: false,
        status: "unreachable",
        checked_at: Date.now(),
        service_url: config.sttServiceUrl,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      controller.clear();
    }
  }

  async transcribeAudio({
    audioBuffer,
    fileName = "audio.wav",
    mimeType = "audio/wav",
    language = "auto",
    timeoutMs = config.sttTimeoutMs,
    metadata = {},
  }) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw buildError("Audio payload is empty.", {
        statusCode: 422,
        code: "EMPTY_AUDIO_FILE",
      });
    }

    return this.enqueue({
      jobName: "stt-transcription",
      metadata,
      execute: async ({ attempt }) => {
        const health = await this.checkHealth({ force: attempt > 1 });
        if (!health.ok) {
          const started = await sttServiceManager.ensureRunning();
          if (started) {
            const restartedHealth = await this.checkHealth({ force: true });
            if (restartedHealth.ok) {
              return this.requestTranscription({
                audioBuffer,
                fileName,
                mimeType,
                language,
                timeoutMs,
                metadata: {
                  ...metadata,
                  attempt,
                },
              });
            }
          }

          throw buildError("Local STT service is unhealthy.", {
            statusCode: 503,
            code: "STT_SERVICE_UNAVAILABLE",
            retriable: true,
            details: health.details,
          });
        }

        return this.requestTranscription({
          audioBuffer,
          fileName,
          mimeType,
          language,
          timeoutMs,
          metadata: {
            ...metadata,
            attempt,
          },
        });
      },
    });
  }

  async requestTranscription({ audioBuffer, fileName, mimeType, language, timeoutMs, metadata = {} }) {
    const controller = createTimeoutController(timeoutMs);

    try {
      const formData = new FormData();
      formData.append("audio", new Blob([audioBuffer], { type: mimeType }), fileName);
      formData.append("language", language || "auto");

      const response = await fetch(`${config.sttServiceUrl}/transcribe`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        const message =
          payload?.detail?.message ||
          payload?.detail ||
          payload?.error?.message ||
          payload?.error ||
          response.statusText ||
          "Local transcription failed.";

        throw buildError(String(message), {
          statusCode: response.status,
          code: payload?.detail?.code || payload?.error?.code || "STT_REQUEST_FAILED",
          retriable: shouldRetryStatus(response.status),
          details: {
            payload,
            ...metadata,
          },
        });
      }

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw buildError("Local transcription timed out.", {
          statusCode: 504,
          code: "STT_TIMEOUT",
          retriable: true,
          details: metadata,
        });
      }

      if (error instanceof Error && error.code) {
        throw error;
      }

      throw buildError(error instanceof Error ? error.message : "Local transcription failed.", {
        statusCode: 503,
        code: "STT_REQUEST_FAILED",
        retriable: true,
        details: metadata,
      });
    } finally {
      controller.clear();
    }
  }
}

const globalForTranscriptionQueue = globalThis;

export const transcriptionQueue =
  globalForTranscriptionQueue.__transcriptionQueue || new TranscriptionQueue();

if (process.env.NODE_ENV !== "production") {
  globalForTranscriptionQueue.__transcriptionQueue = transcriptionQueue;
}
