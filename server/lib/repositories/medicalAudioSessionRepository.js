import { prisma } from "../db.js";
import { decryptData, encryptData, encryptionService } from "../../services/encryptionService.js";

const SELECT_COLUMNS = [
  "id",
  "user_id",
  "filename",
  "upload_time",
  "processing_status",
  "audio_path",
  "audio_file_path",
  "audio_mime_type",
  "transcription_text",
  "raw_transcription_text",
  "corrected_transcription_text",
  "transcript_confidence",
  "transcript_review_required",
  "transcript_validation_status",
  "transcript_validation_issues",
  "structured_medical_data",
  "transcript_path",
  "report_path",
  "report_html_path",
  "error_message",
  "created_at",
  "updated_at",
];

const updatableColumns = new Set([
  "processing_status",
  "audio_path",
  "audio_file_path",
  "audio_mime_type",
  "transcription_text",
  "raw_transcription_text",
  "corrected_transcription_text",
  "transcript_confidence",
  "transcript_review_required",
  "transcript_validation_status",
  "transcript_validation_issues",
  "structured_medical_data",
  "transcript_path",
  "report_path",
  "report_html_path",
  "error_message",
]);

const encryptedTextColumns = new Set([
  "transcription_text",
  "raw_transcription_text",
  "corrected_transcription_text",
]);

const encryptedJsonColumns = new Set([
  "transcript_validation_issues",
  "structured_medical_data",
]);

function decryptText(value) {
  if (value === null || value === undefined) return null;
  return String(decryptData(value) || "");
}

function decryptJson(value) {
  if (value === null || value === undefined) return null;
  const decrypted = decryptData(value);
  if (decrypted && typeof decrypted === "object" && !Buffer.isBuffer(decrypted)) {
    return decrypted;
  }

  const text = String(decrypted || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    filename: row.filename,
    upload_time: row.upload_time,
    processing_status: row.processing_status,
    audio_path: row.audio_path,
    audio_file_path: row.audio_file_path || row.audio_path,
    audio_mime_type: row.audio_mime_type,
    transcription_text: decryptText(row.transcription_text),
    raw_transcription_text: decryptText(row.raw_transcription_text),
    corrected_transcription_text: decryptText(row.corrected_transcription_text),
    transcript_confidence:
      row.transcript_confidence === null || row.transcript_confidence === undefined
        ? null
        : Number(row.transcript_confidence),
    transcript_review_required: Boolean(Number(row.transcript_review_required || 0)),
    transcript_validation_status: row.transcript_validation_status,
    transcript_validation_issues: decryptJson(row.transcript_validation_issues) || [],
    structured_medical_data: decryptJson(row.structured_medical_data) || {},
    transcript_path: row.transcript_path,
    report_path: row.report_path,
    report_html_path: row.report_html_path,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function pickUpdateData(updateData = {}) {
  const data = {};

  for (const [key, value] of Object.entries(updateData)) {
    if (!updatableColumns.has(key)) continue;
    data[key] = value ?? null;
  }

  return data;
}

function normalizeValueForWrite(column, value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (encryptedTextColumns.has(column)) {
    if (encryptionService.isEncryptedValue(value)) return value;
    return encryptData(String(value));
  }

  if (encryptedJsonColumns.has(column)) {
    if (typeof value === "string" && encryptionService.isEncryptedValue(value)) return value;
    return encryptData(value);
  }

  if (column === "transcript_review_required") {
    return value ? 1 : 0;
  }

  if (column === "transcript_confidence") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return value;
}

async function selectOne(query, values = []) {
  const rows = await prisma.$queryRawUnsafe(query, ...values);
  return mapRow(Array.isArray(rows) ? rows[0] : null);
}

export const medicalAudioSessionRepository = {
  async createSession({
    id,
    userId,
    filename,
    uploadTime,
    processingStatus,
    audioPath,
    audioFilePath = null,
    audioMimeType = null,
    transcriptionText = null,
  }) {
    const createdAt = new Date().toISOString();
    const uploadTimestamp =
      uploadTime instanceof Date ? uploadTime.toISOString() : new Date(uploadTime || Date.now()).toISOString();

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "MedicalAudioSession" (
          "id",
          "user_id",
          "filename",
          "upload_time",
          "processing_status",
          "audio_path",
          "audio_file_path",
          "audio_mime_type",
          "transcription_text",
          "transcript_review_required",
          "created_at",
          "updated_at"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      id,
      userId,
      filename,
      uploadTimestamp,
      processingStatus,
      audioPath,
      audioFilePath ?? audioPath,
      audioMimeType,
      normalizeValueForWrite("transcription_text", transcriptionText),
      0,
      createdAt,
      createdAt
    );

    return this.getSessionById(id);
  },

  async getSessionByIdForUser(id, userId) {
    return selectOne(
      `SELECT ${SELECT_COLUMNS.map((column) => `"${column}"`).join(", ")} FROM "MedicalAudioSession" WHERE "id" = ? AND "user_id" = ? LIMIT 1`,
      [id, userId]
    );
  },

  async getSessionById(id) {
    return selectOne(
      `SELECT ${SELECT_COLUMNS.map((column) => `"${column}"`).join(", ")} FROM "MedicalAudioSession" WHERE "id" = ? LIMIT 1`,
      [id]
    );
  },

  async updateSessionById(id, updateData) {
    const data = pickUpdateData(updateData);
    const columns = Object.keys(data);
    if (columns.length === 0) {
      return this.getSessionById(id);
    }

    const existing = await this.getSessionById(id);
    if (!existing) {
      return null;
    }

    const assignments = columns.map((column) => `"${column}" = ?`);
    const values = columns.map((column) => normalizeValueForWrite(column, data[column]));

    await prisma.$executeRawUnsafe(
      `UPDATE "MedicalAudioSession" SET ${assignments.join(", ")}, "updated_at" = ? WHERE "id" = ?`,
      ...values,
      new Date().toISOString(),
      id
    );

    return this.getSessionById(id);
  },
};
