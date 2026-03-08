import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "../config.js";

const SUPPORTED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".webm", ".mpeg"]);
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "video/webm",
  "application/octet-stream",
]);

function createValidationError(
  message,
  { statusCode = 422, code = "AUDIO_VALIDATION_FAILED", details } = {}
) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function normalizeMimeType(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  if (normalized === "video/webm") return "audio/webm";
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/m4a";
  return normalized;
}

function getExtension(fileName) {
  return path.extname(String(fileName || "")).toLowerCase().trim();
}

function fallbackExtensionForMime(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (normalized.includes("wav")) return ".wav";
  if (normalized.includes("mp3") || normalized.includes("mpeg")) return ".mp3";
  if (normalized.includes("m4a") || normalized.includes("mp4")) return ".m4a";
  return ".webm";
}

function assertSupportedAudio({ fileName, mimeType }) {
  const extension = getExtension(fileName);
  const normalizedMime = normalizeMimeType(mimeType);

  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    throw createValidationError(
      "Unsupported audio format. Please upload WAV, MP3, M4A, or WEBM audio.",
      {
        statusCode: 415,
        code: "UNSUPPORTED_FORMAT",
        details: {
          extension,
          mime_type: normalizedMime || null,
        },
      }
    );
  }

  if (normalizedMime && !SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMime)) {
    throw createValidationError(
      "Unsupported audio format. Please upload WAV, MP3, M4A, or WEBM audio.",
      {
        statusCode: 415,
        code: "UNSUPPORTED_FORMAT",
        details: {
          extension,
          mime_type: normalizedMime,
        },
      }
    );
  }
}

function runFfprobe(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.ffprobeBin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size,bit_rate",
        "-show_streams",
        "-of",
        "json",
        filePath,
      ],
      {
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        createValidationError("Audio validation tools are unavailable on the server.", {
          statusCode: 500,
          code: "AUDIO_VALIDATION_UNAVAILABLE",
          details: {
            reason: error.message,
          },
        })
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          createValidationError("Audio file appears to be corrupted or unreadable.", {
            statusCode: 422,
            code: "CORRUPTED_AUDIO_FILE",
            details: {
              stderr: stderr || stdout || "",
            },
          })
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(
          createValidationError("Audio metadata could not be parsed.", {
            statusCode: 422,
            code: "INVALID_AUDIO_METADATA",
            details: {
              reason: error instanceof Error ? error.message : String(error),
            },
          })
        );
      }
    });
  });
}

function parseProbeMetadata(payload) {
  const format = payload?.format && typeof payload.format === "object" ? payload.format : {};
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const audioStreams = streams.filter((stream) => stream?.codec_type === "audio");
  const durationSeconds = Number(format.duration || audioStreams[0]?.duration || 0);

  return {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    codecName: String(audioStreams[0]?.codec_name || "").trim(),
    sampleRate: Number(audioStreams[0]?.sample_rate || 0) || null,
    channels: Number(audioStreams[0]?.channels || 0) || null,
    hasAudioStream: audioStreams.length > 0,
  };
}

async function ensureFileSize(filePath, maxSizeBytes) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw createValidationError("Audio file is missing or invalid.", {
      statusCode: 422,
      code: "INVALID_AUDIO_FILE",
      details: {
        path: filePath,
      },
    });
  }

  if (Number(stat.size || 0) <= 0) {
    throw createValidationError("Audio file is empty.", {
      statusCode: 422,
      code: "EMPTY_AUDIO_FILE",
      details: {
        path: filePath,
      },
    });
  }

  if (Number(stat.size || 0) > maxSizeBytes) {
    throw createValidationError("Audio file exceeds the configured upload limit.", {
      statusCode: 413,
      code: "FILE_TOO_LARGE",
      details: {
        size_bytes: Number(stat.size || 0),
        max_size_bytes: maxSizeBytes,
      },
    });
  }

  return stat;
}

export const audioValidationService = {
  supportedAudioExtensions: SUPPORTED_AUDIO_EXTENSIONS,
  supportedAudioMimeTypes: SUPPORTED_AUDIO_MIME_TYPES,
  normalizeMimeType,

  async validateStoredAudio({
    filePath,
    fileName,
    mimeType = "",
    maxSizeBytes = config.medicalAudioMaxSizeMb * 1024 * 1024,
  }) {
    if (!filePath || typeof filePath !== "string") {
      throw createValidationError("Audio file is missing or invalid.", {
        statusCode: 422,
        code: "INVALID_AUDIO_FILE",
      });
    }

    assertSupportedAudio({
      fileName,
      mimeType,
    });

    const stat = await ensureFileSize(filePath, maxSizeBytes);
    const probePayload = await runFfprobe(filePath);
    const metadata = parseProbeMetadata(probePayload);

    if (!metadata.hasAudioStream) {
      throw createValidationError("Uploaded file does not contain a readable audio stream.", {
        statusCode: 422,
        code: "INVALID_AUDIO_FILE",
      });
    }

    if (
      Number.isFinite(config.audioMinDurationSeconds) &&
      metadata.durationSeconds > 0 &&
      metadata.durationSeconds < config.audioMinDurationSeconds
    ) {
      throw createValidationError("Audio recording is too short to process reliably.", {
        statusCode: 422,
        code: "AUDIO_TOO_SHORT",
        details: {
          duration_seconds: metadata.durationSeconds,
          min_duration_seconds: config.audioMinDurationSeconds,
        },
      });
    }

    if (
      Number.isFinite(config.audioMaxDurationSeconds) &&
      metadata.durationSeconds > config.audioMaxDurationSeconds
    ) {
      throw createValidationError("Audio recording exceeds the supported duration limit.", {
        statusCode: 413,
        code: "AUDIO_TOO_LONG",
        details: {
          duration_seconds: metadata.durationSeconds,
          max_duration_seconds: config.audioMaxDurationSeconds,
        },
      });
    }

    return {
      fileName: String(fileName || path.basename(filePath)),
      mimeType: normalizeMimeType(mimeType),
      sizeBytes: Number(stat.size || 0),
      durationSeconds: metadata.durationSeconds,
      codecName: metadata.codecName,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
    };
  },

  async validateAudioBuffer({
    buffer,
    fileName = "audio.webm",
    mimeType = "",
    maxSizeBytes = config.medicalAudioMaxSizeMb * 1024 * 1024,
  }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw createValidationError("Audio payload is empty.", {
        statusCode: 422,
        code: "EMPTY_AUDIO_FILE",
      });
    }

    const extension = getExtension(fileName) || fallbackExtensionForMime(mimeType);
    const workingDir = path.join(os.tmpdir(), `medivoice-audio-validate-${randomUUID()}`);
    const inputPath = path.join(workingDir, `input${extension}`);

    await fs.mkdir(workingDir, { recursive: true });
    try {
      await fs.writeFile(inputPath, buffer);
      return await this.validateStoredAudio({
        filePath: inputPath,
        fileName,
        mimeType,
        maxSizeBytes,
      });
    } finally {
      await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
