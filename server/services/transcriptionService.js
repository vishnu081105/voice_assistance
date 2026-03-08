import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { audioProcessingService } from "./audioProcessingService.js";
import { transcriptionQueue } from "./transcriptionQueue.js";
import { transcriptCleaningService } from "./transcriptCleaningService.js";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeConfidence(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function formatTimestamp(totalSeconds) {
  const safe = Math.max(0, Math.floor(toNumber(totalSeconds, 0)));
  const hours = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function inferDurationFromText(text, fallback = 0) {
  const normalized = normalizeText(text);
  if (!normalized) return Math.max(0, fallback);
  return Math.max(1, normalized.split(/\s+/).filter(Boolean).length / 2.7, fallback);
}

function normalizeSegments(payload, { offsetSeconds = 0 } = {}) {
  const rawText = transcriptCleaningService.cleanTranscript(
    normalizeText(payload?.text || payload?.transcript)
  );
  const rawSegments = Array.isArray(payload?.segments) ? payload.segments : [];
  const segments = rawSegments
    .map((segment) => {
      const start = Math.max(0, toNumber(segment?.start, 0) + offsetSeconds);
      const end = Math.max(start + 0.1, toNumber(segment?.end, start + 0.1) + offsetSeconds);
      const text = transcriptCleaningService.cleanTranscript(normalizeText(segment?.text));
      const confidence = normalizeConfidence(segment?.confidence, 1);
      return {
        start,
        end,
        text,
        confidence,
      };
    })
    .filter((segment) => segment.text.length > 0);

  if (segments.length === 0 && rawText) {
    segments.push({
      start: offsetSeconds,
      end: offsetSeconds + inferDurationFromText(rawText, toNumber(payload?.duration, 0)),
      text: rawText,
      confidence: normalizeConfidence(payload?.confidence, 1),
    });
  }

  return segments;
}

function buildEntriesFromSegments(segments) {
  return transcriptCleaningService.cleanTranscriptEntries(
    segments.map((segment) => ({
      speaker: "Unknown",
      text: segment.text,
      start_time: formatTimestamp(segment.start),
      end_time: formatTimestamp(segment.end),
    }))
  );
}

function createTranscriptionError(message, { statusCode = 502, code = "TRANSCRIPTION_FAILURE", details } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function inferChunkConfidence(payload, segments = []) {
  if (Array.isArray(segments) && segments.length > 0) {
    return normalizeConfidence(
      segments.reduce((sum, segment) => sum + normalizeConfidence(segment.confidence, 1), 0) / segments.length,
      1
    );
  }

  return normalizeConfidence(payload?.confidence, 1);
}

export const transcriptionService = {
  model: config.whisperModel,

  isConfigured() {
    return Boolean(config.sttServiceUrl);
  },

  async transcribeWavFile({ wavPath, language = "auto", onChunkResult } = {}) {
    if (!wavPath || typeof wavPath !== "string") {
      throw createTranscriptionError("Audio file path is required.", {
        statusCode: 422,
        code: "MISSING_AUDIO_FILE",
      });
    }

    const audioStat = await fs.stat(wavPath).catch(() => null);
    if (!audioStat?.isFile()) {
      throw createTranscriptionError("Audio file is missing or invalid.", {
        statusCode: 422,
        code: "INVALID_AUDIO_FILE",
        details: {
          wav_path: wavPath,
        },
      });
    }
    if (Number(audioStat.size || 0) <= 0) {
      throw createTranscriptionError("Audio file is empty.", {
        statusCode: 422,
        code: "EMPTY_AUDIO_FILE",
      });
    }

    const workingDir = path.dirname(wavPath);
    let chunkFiles = [];
    try {
      chunkFiles = await audioProcessingService.splitWavIntoChunks({
        wavPath,
        workingDir,
        chunkDurationSeconds: config.sttChunkDurationSeconds,
      });
    } catch (error) {
      logger.warn("stt.chunking_fallback", {
        wav_path: wavPath,
        error_message: error instanceof Error ? error.message : String(error),
      });
      chunkFiles = [
        {
          path: wavPath,
          index: 0,
          offsetSeconds: 0,
        },
      ];
    }

    const combinedSegments = [];
    const combinedEntries = [];
    const combinedConfidence = [];
    let detectedLanguage = language && language !== "auto" ? language : "en";
    let partial = false;
    let lowConfidenceDetected = false;

    for (const chunk of chunkFiles) {
      try {
        const chunkBuffer = await fs.readFile(chunk.path);
        let payload = null;
        let normalizedSegments = [];
        let chunkConfidence = 1;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          payload = await transcriptionQueue.transcribeAudio({
            audioBuffer: chunkBuffer,
            fileName: path.basename(chunk.path),
            mimeType: "audio/wav",
            language,
            metadata: {
              wav_path: wavPath,
              chunk_index: chunk.index + 1,
              total_chunks: chunkFiles.length,
              low_confidence_retry: attempt > 1,
            },
          });

          normalizedSegments = normalizeSegments(payload, {
            offsetSeconds: chunk.offsetSeconds,
          });
          chunkConfidence = inferChunkConfidence(payload, normalizedSegments);

          if (chunkConfidence >= config.transcriptConfidenceThreshold || attempt === 2) {
            break;
          }

          logger.warn("stt.low_confidence_retry", {
            wav_path: wavPath,
            chunk_index: chunk.index + 1,
            total_chunks: chunkFiles.length,
            confidence: chunkConfidence,
            threshold: config.transcriptConfidenceThreshold,
          });
        }

        const chunkEntries = buildEntriesFromSegments(normalizedSegments);

        if (normalizedSegments.length === 0 && chunkEntries.length === 0) {
          continue;
        }

        combinedSegments.push(...normalizedSegments);
        combinedEntries.push(...chunkEntries);
        combinedConfidence.push(chunkConfidence);
        if (chunkConfidence < config.transcriptConfidenceThreshold) {
          lowConfidenceDetected = true;
        }

        if (typeof payload?.language === "string" && payload.language.trim()) {
          detectedLanguage = payload.language.trim();
        }

        if (typeof onChunkResult === "function") {
          await onChunkResult({
            chunkIndex: chunk.index,
            totalChunks: chunkFiles.length,
            progress: Number((((chunk.index + 1) / chunkFiles.length) * 100).toFixed(2)),
            chunkEntries,
            transcriptEntries: [...combinedEntries],
            text: transcriptCleaningService.cleanTranscript(chunkEntries.map((entry) => entry.text).join(" ")),
          });
        }
      } catch (error) {
        logger.error("stt.chunk_failed", {
          wav_path: wavPath,
          chunk_index: chunk.index + 1,
          total_chunks: chunkFiles.length,
          partial_transcript_available: combinedEntries.length > 0,
          error_code: error?.code || "TRANSCRIPTION_FAILURE",
          error_message: error instanceof Error ? error.message : String(error),
        });

        if (combinedEntries.length === 0) {
          throw createTranscriptionError(error instanceof Error ? error.message : "Local transcription failed.", {
            statusCode: Number(error?.statusCode || 502),
            code: error?.code || "TRANSCRIPTION_FAILURE",
            details: error?.details,
          });
        }

        partial = true;
        break;
      }
    }

    const text = transcriptCleaningService.cleanTranscript(combinedEntries.map((entry) => entry.text).join(" "));
    if (!text) {
      throw createTranscriptionError("Unable to transcribe audio content.", {
        statusCode: 502,
        code: "TRANSCRIPTION_FAILURE",
      });
    }

    const duration =
      combinedSegments.length > 0
        ? Math.max(...combinedSegments.map((segment) => Math.max(segment.end, segment.start)))
        : inferDurationFromText(text, 0);

    return {
      text,
      duration,
      language: detectedLanguage || "en",
      segments: combinedSegments,
      entries: combinedEntries,
      partial,
      confidence:
        combinedConfidence.length > 0
          ? normalizeConfidence(
              combinedConfidence.reduce((sum, value) => sum + normalizeConfidence(value, 1), 0) /
                combinedConfidence.length,
              1
            )
          : 1,
      lowConfidenceDetected,
    };
  },
};
