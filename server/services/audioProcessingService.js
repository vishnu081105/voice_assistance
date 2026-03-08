import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { medicalPaths } from "../lib/medical/medicalPaths.js";
import { audioEnhancementService } from "./audioEnhancementService.js";
import { audioValidationService } from "./audioValidationService.js";
import { readStoredFile } from "./privateFileService.js";

const FFMPEG_BIN = config.ffmpegBin;
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".mpeg", ".m4a", ".webm"]);
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

export const UNSUPPORTED_AUDIO_FORMAT_MESSAGE =
  "Unsupported audio format. Please upload MP3, WAV, M4A, or WEBM.";

function createProcessingError(message, { statusCode = 422, code = "AUDIO_PROCESSING_FAILED", details } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function normalizeMimeType(value) {
  return String(value || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
}

function getFileExtension(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase().trim();
  return ext;
}

function fallbackExtensionForMime(mimeType) {
  const mime = normalizeMimeType(mimeType);
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mp3") || mime.includes("mpeg")) return ".mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return ".m4a";
  return ".webm";
}

function sanitizeWorkPrefix(value) {
  const safe = String(value || "audio")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  return safe || "audio";
}

function assertSupportedAudioInput({ fileName, mimeType }) {
  const extension = getFileExtension(fileName);
  const normalizedMime = normalizeMimeType(mimeType);

  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    throw createProcessingError(UNSUPPORTED_AUDIO_FORMAT_MESSAGE, {
      statusCode: 415,
      code: "UNSUPPORTED_FORMAT",
      details: { extension, mime_type: normalizedMime || null },
    });
  }

  if (normalizedMime && !SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMime)) {
    throw createProcessingError(UNSUPPORTED_AUDIO_FORMAT_MESSAGE, {
      statusCode: 415,
      code: "UNSUPPORTED_FORMAT",
      details: { extension, mime_type: normalizedMime },
    });
  }
}

async function ensureReadableFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw createProcessingError("Audio file is missing or invalid.", {
      statusCode: 422,
      code: "INVALID_AUDIO_FILE",
      details: { path: filePath },
    });
  }
  if (Number(stat.size || 0) <= 0) {
    throw createProcessingError("Audio file is empty.", {
      statusCode: 422,
      code: "EMPTY_AUDIO_FILE",
      details: { path: filePath },
    });
  }
}

async function runFfmpeg(args, actionName) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, {
      windowsHide: true,
    });

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
        createProcessingError(`Failed to start ffmpeg during ${actionName}.`, {
          statusCode: 500,
          code: "FFMPEG_NOT_AVAILABLE",
          details: { reason: error.message },
        })
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        createProcessingError(`Audio conversion failed during ${actionName}.`, {
          statusCode: 422,
          code: "AUDIO_CONVERSION_FAILED",
          details: {
            exit_code: code,
            stderr: stderr || stdout || "",
          },
        })
      );
    });
  });
}

async function createWorkingDirectory(workIdPrefix) {
  const tempRoot = path.join(medicalPaths.privateRootDir, "audio_processing");
  const safePrefix = sanitizeWorkPrefix(workIdPrefix);
  const workingDir = path.join(tempRoot, `${safePrefix}-${Date.now()}-${randomUUID()}`);
  await fs.mkdir(workingDir, { recursive: true });
  return workingDir;
}

async function convertToWavPcm16Mono({ inputPath, outputPath }) {
  const audioFilter = audioEnhancementService.getNoiseReductionFilter();
  const args = [
    "-y",
    "-i",
    inputPath,
  ];

  if (audioFilter) {
    args.push("-af", audioFilter);
  }

  args.push(
    "-ac",
    "1",
    "-ar",
    "16000",
    "-acodec",
    "pcm_s16le",
    outputPath
  );

  await runFfmpeg(
    args,
    "normalization"
  );
  await ensureReadableFile(outputPath);
}

function getChunkDurationSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 45;
  return Math.min(60, Math.max(30, Math.floor(numeric)));
}

export const audioProcessingService = {
  supportedAudioExtensions: SUPPORTED_AUDIO_EXTENSIONS,
  supportedAudioMimeTypes: SUPPORTED_AUDIO_MIME_TYPES,

  assertSupportedAudioInput,

  normalizeMimeType,

  async prepareAudioFromPath({ sourcePath, workIdPrefix = "upload" }) {
    if (!sourcePath || typeof sourcePath !== "string") {
      throw createProcessingError("Audio file path is required.", {
        statusCode: 422,
        code: "MISSING_AUDIO_PATH",
      });
    }

    await ensureReadableFile(sourcePath);
    const workingDir = await createWorkingDirectory(workIdPrefix);
    const sourceExtension = path.extname(sourcePath.replace(/\.enc$/i, "")) || ".webm";
    const inputPath = path.join(workingDir, `input${sourceExtension}`);
    const wavPath = path.join(workingDir, "normalized-16k-mono.wav");
    const inputBuffer = await readStoredFile(sourcePath);

    await fs.writeFile(inputPath, inputBuffer);
    await audioValidationService.validateStoredAudio({
      filePath: inputPath,
      fileName: path.basename(inputPath),
    });
    await convertToWavPcm16Mono({
      inputPath,
      outputPath: wavPath,
    });

    return {
      inputPath,
      wavPath,
      workingDir,
    };
  },

  async splitWavIntoChunks({ wavPath, workingDir, chunkDurationSeconds = 45 }) {
    await ensureReadableFile(wavPath);

    const chunkDir = path.join(workingDir, "chunks");
    const safeChunkDurationSeconds = getChunkDurationSeconds(chunkDurationSeconds);
    await fs.mkdir(chunkDir, { recursive: true });

    await runFfmpeg(
      [
        "-y",
        "-i",
        wavPath,
        "-f",
        "segment",
        "-segment_time",
        String(safeChunkDurationSeconds),
        "-reset_timestamps",
        "1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-acodec",
        "pcm_s16le",
        path.join(chunkDir, "chunk-%03d.wav"),
      ],
      "chunking"
    );

    const chunkFiles = (await fs.readdir(chunkDir))
      .filter((fileName) => fileName.toLowerCase().endsWith(".wav"))
      .sort((left, right) => left.localeCompare(right));

    if (chunkFiles.length === 0) {
      return [
        {
          path: wavPath,
          index: 0,
          offsetSeconds: 0,
        },
      ];
    }

    return chunkFiles.map((fileName, index) => ({
      path: path.join(chunkDir, fileName),
      index,
      offsetSeconds: index * safeChunkDurationSeconds,
    }));
  },

  async prepareAudioFromBuffer({
    buffer,
    originalName = "audio.webm",
    mimeType = "",
    workIdPrefix = "microphone",
  }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw createProcessingError("Audio payload is empty.", {
        statusCode: 422,
        code: "EMPTY_AUDIO_FILE",
      });
    }

    assertSupportedAudioInput({
      fileName: originalName,
      mimeType,
    });

    const extension = getFileExtension(originalName) || fallbackExtensionForMime(mimeType);
    const workingDir = await createWorkingDirectory(workIdPrefix);
    const inputPath = path.join(workingDir, `input${extension}`);
    const wavPath = path.join(workingDir, "normalized-16k-mono.wav");

    await fs.writeFile(inputPath, buffer);
    await audioValidationService.validateStoredAudio({
      filePath: inputPath,
      fileName: originalName,
      mimeType,
    });
    await convertToWavPcm16Mono({
      inputPath,
      outputPath: wavPath,
    });

    return {
      inputPath,
      wavPath,
      workingDir,
    };
  },

  async cleanupWorkingAudio(prepared) {
    const workingDir = prepared?.workingDir;
    if (!workingDir) return;
    await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {});
  },
};
