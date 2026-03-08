import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { decryptData, encryptData, encryptionService } from "./encryptionService.js";

const AUDIO_MIME_BY_EXTENSION = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "utf8");
  return Buffer.from(JSON.stringify(data ?? {}), "utf8");
}

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .trim();
}

export function inferAudioMimeType(fileName, explicitMimeType = "") {
  const normalized = String(explicitMimeType || "").trim().toLowerCase();
  if (normalized === "video/webm") return "audio/webm";
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized) return normalized;
  const extension = path.extname(String(fileName || "")).toLowerCase();
  const inferred = AUDIO_MIME_BY_EXTENSION[extension] || "application/octet-stream";
  return inferred === "audio/mp3" ? "audio/mpeg" : inferred;
}

export function ensurePrivateStorageDirectories() {
  [
    config.privateRootDir,
    config.privateAudioDir,
    path.join(config.privateRootDir, "medical_audio"),
    path.join(config.privateRootDir, "medical_transcripts"),
    path.join(config.privateRootDir, "medical_reports"),
  ].forEach((directory) => ensureDirectory(directory));
}

export async function writeEncryptedFile(filePath, data) {
  ensureDirectory(path.dirname(filePath));
  const encrypted = encryptData(Buffer.isBuffer(data) ? data : toBuffer(data));
  await fs.promises.writeFile(filePath, encrypted, "utf8");
  return filePath;
}

export async function readEncryptedFile(filePath) {
  const encrypted = await fs.promises.readFile(filePath, "utf8");
  return decryptData(encrypted);
}

export async function readStoredFile(filePath) {
  const raw = await fs.promises.readFile(filePath);
  const rawString = raw.toString("utf8");
  if (encryptionService.isEncryptedValue(rawString)) {
    return readEncryptedFile(filePath);
  }
  return raw;
}

export function buildAuthenticatedAudioUrl(req, resourceId) {
  return `${req.protocol}://${req.get("host")}/api/audio/${encodeURIComponent(resourceId)}`;
}

export function buildPrivateReportAudioPath(userId, reportId, originalName = "recording.webm") {
  const extension = path.extname(String(originalName || "")).toLowerCase() || ".webm";
  const safeUserId = sanitizeSegment(userId);
  const safeReportId = sanitizeSegment(reportId);
  return path.join(config.privateAudioDir, safeUserId, `${safeReportId}${extension}.enc`);
}

export function buildPrivateMedicalAudioPath(userId, uploadId, originalName = "medical-audio.webm") {
  const extension = path.extname(String(originalName || "")).toLowerCase() || ".webm";
  const safeUserId = sanitizeSegment(userId);
  const safeUploadId = sanitizeSegment(uploadId);
  return path.join(config.privateRootDir, "medical_audio", safeUserId, `${safeUploadId}${extension}.enc`);
}

export function buildPrivateMedicalTranscriptPath(uploadId) {
  const safeUploadId = sanitizeSegment(uploadId);
  return path.join(config.privateRootDir, "medical_transcripts", `${safeUploadId}.json.enc`);
}

export function buildPrivateMedicalReportPath(uploadId, extension = "json") {
  const safeUploadId = sanitizeSegment(uploadId);
  const safeExtension = sanitizeSegment(extension).replace(/^\.+/, "") || "json";
  return path.join(config.privateRootDir, "medical_reports", `${safeUploadId}.${safeExtension}.enc`);
}

export function resolveLegacyAudioPath(audioUrl) {
  const value = String(audioUrl || "").trim();
  if (!value) return null;

  const marker = "/uploads/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;

  const relativePath = value.slice(markerIndex + marker.length);
  const candidatePath = path.join(config.uploadsDir, relativePath);
  return fs.existsSync(candidatePath) ? candidatePath : null;
}
