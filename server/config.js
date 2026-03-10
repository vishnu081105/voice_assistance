import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePythonBin } from "./utils/pythonRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function readRequiredSecret(name, { allowDevFallback = false, fallback = "" } = {}) {
  const value = String(process.env[name] || "").trim();
  if (value) return value;

  const isDev = String(process.env.NODE_ENV || "development").trim() !== "production";
  if (isDev && allowDevFallback && fallback) {
    return fallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumberList(value, fallback) {
  if (!value) return fallback;
  const values = String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);

  return values.length > 0 ? values : fallback;
}

function toUnitInterval(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeEncryptionKey(secretSeed) {
  return crypto.createHash("sha256").update(String(secretSeed)).digest();
}

const nodeEnv = String(process.env.NODE_ENV || "development").trim();
const isProduction = nodeEnv === "production";
const clientOrigin = String(process.env.CLIENT_ORIGIN || "http://localhost:8080").trim();
const jwtSecret = readRequiredSecret("JWT_SECRET", {
  allowDevFallback: true,
  fallback: "dev-secret-change-me",
});
const sessionSecret = readRequiredSecret("SESSION_SECRET", {
  allowDevFallback: true,
  fallback: "dev-session-secret-change-me",
});
const encryptionSeed = readRequiredSecret("ENCRYPTION_KEY", {
  allowDevFallback: true,
  fallback: `${jwtSecret}:development-encryption-key`,
});

const privateRootDir = path.join(projectRoot, "server", "private");

export const config = {
  projectRoot,
  nodeEnv,
  isProduction,
  port: toPositiveNumber(process.env.PORT, 4000),
  clientOrigin,
  trustedProxy: parseBoolean(process.env.TRUST_PROXY, false),
  jwtSecret,
  sessionSecret,
  encryptionKey: normalizeEncryptionKey(encryptionSeed),
  authCookieName: "medivoice.auth",
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, isProduction),
  cookieSameSite: "strict",
  cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  uploadsDir: path.join(projectRoot, "server", "uploads"),
  privateRootDir,
  privateAudioDir: path.join(privateRootDir, "audio_recordings"),
  ffmpegBin: String(process.env.FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg",
  ffprobeBin: String(process.env.FFPROBE_PATH || "ffprobe").trim() || "ffprobe",
  sttServiceUrl: String(process.env.STT_SERVICE_URL || "http://127.0.0.1:9000").trim(),
  sttAutoStart: parseBoolean(process.env.STT_AUTO_START, true),
  sttStartupTimeoutMs: toPositiveNumber(process.env.STT_STARTUP_TIMEOUT_MS, 45000),
  pythonBin: resolvePythonBin(projectRoot),
  whisperModel: String(process.env.WHISPER_MODEL || "small").trim(),
  whisperDevice: String(process.env.WHISPER_DEVICE || "cpu").trim(),
  whisperComputeType: String(process.env.WHISPER_COMPUTE_TYPE || "int8").trim(),
  sttTimeoutMs: toPositiveNumber(process.env.STT_TIMEOUT_MS, 300000),
  sttHealthTimeoutMs: toPositiveNumber(process.env.STT_HEALTH_TIMEOUT_MS, 3000),
  sttHealthCacheMs: toPositiveNumber(process.env.STT_HEALTH_CACHE_MS, 5000),
  sttHealthPollMs: toPositiveNumber(process.env.STT_HEALTH_POLL_MS, 15000),
  sttMaxConcurrentJobs: toPositiveNumber(process.env.STT_MAX_CONCURRENT_JOBS, 1),
  sttMaxQueueSize: toPositiveNumber(process.env.STT_MAX_QUEUE_SIZE, 16),
  sttRetryDelaysMs: parseNumberList(process.env.STT_RETRY_DELAYS_MS, [1000, 3000, 5000]),
  sttChunkDurationSeconds: toPositiveNumber(process.env.STT_CHUNK_DURATION_SECONDS, 40),
  sttDebugMetrics: parseBoolean(process.env.STT_DEBUG_METRICS, false),
  geminiApiKey: String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim(),
  geminiModel: String(process.env.GEMINI_MODEL || "gemini-1.5-flash").trim(),
  geminiTimeoutMs: toPositiveNumber(process.env.GEMINI_TIMEOUT_MS, 45000),
  geminiRetryDelaysMs: parseNumberList(process.env.GEMINI_RETRY_DELAYS_MS, [1000, 3000]),
  rateLimitWindowMs: 60 * 1000,
  rateLimitMaxRequests: toPositiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  medicalAudioMaxSizeMb: toPositiveNumber(process.env.MEDICAL_AUDIO_MAX_SIZE_MB, 50),
  audioMinDurationSeconds: toPositiveNumber(process.env.AUDIO_MIN_DURATION_SECONDS, 1),
  audioMaxDurationSeconds: toPositiveNumber(process.env.AUDIO_MAX_DURATION_SECONDS, 7200),
  audioNoiseReductionEnabled: parseBoolean(process.env.AUDIO_NOISE_REDUCTION_ENABLED, true),
  audioNoiseReductionFilter: String(
    process.env.AUDIO_NOISE_REDUCTION_FILTER || "highpass=f=120,lowpass=f=3800,afftdn=nf=-20"
  ).trim(),
  audioVolumeNormalizationEnabled: parseBoolean(process.env.AUDIO_VOLUME_NORMALIZATION_ENABLED, true),
  audioVolumeNormalizationFilter: String(
    process.env.AUDIO_VOLUME_NORMALIZATION_FILTER || "dynaudnorm=f=150:g=15:p=0.9:m=100:s=12"
  ).trim(),
  transcriptConfidenceThreshold: toUnitInterval(process.env.TRANSCRIPT_CONFIDENCE_THRESHOLD, 0.45),
  enableGeminiContextValidation: parseBoolean(process.env.ENABLE_GEMINI_CONTEXT_VALIDATION, true),
  allowedAudioMimeTypes: new Set([
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/mp3",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/webm",
  ]),
};
