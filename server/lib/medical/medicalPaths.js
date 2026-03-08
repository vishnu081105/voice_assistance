import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";

function parsePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

const maxAudioSizeMb = parsePositiveNumber(process.env.MEDICAL_AUDIO_MAX_SIZE_MB, 50);

export const medicalConfig = {
  maxAudioSizeBytes: Math.floor(maxAudioSizeMb * 1024 * 1024),
  transcriptionTimeoutMs: parsePositiveNumber(process.env.MEDICAL_STT_TIMEOUT_MS, 300000),
  chunkDelayMs: parsePositiveNumber(process.env.MEDICAL_TRANSCRIPTION_CHUNK_DELAY_MS, 120),
  pauseThresholdSeconds: parsePositiveNumber(process.env.MEDICAL_PAUSE_THRESHOLD_SECONDS, 1.2),
  channelName: "medical-transcription",
};

export const medicalPaths = {
  audioUploadsDir: path.join(config.privateRootDir, "medical_audio"),
  privateRootDir: path.join(config.projectRoot, "server", "private", "medical_processing"),
};

medicalPaths.transcriptDir = path.join(medicalPaths.privateRootDir, "transcripts");
medicalPaths.reportDir = path.join(medicalPaths.privateRootDir, "reports");

export function ensureMedicalDirectories() {
  const dirs = [
    medicalPaths.audioUploadsDir,
    medicalPaths.privateRootDir,
    medicalPaths.transcriptDir,
    medicalPaths.reportDir,
  ];
  for (const directory of dirs) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }
}
