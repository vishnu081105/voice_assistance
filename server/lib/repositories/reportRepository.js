import { prisma } from "../db.js";
import { decryptData, encryptData, encryptionService } from "../../services/encryptionService.js";
import { buildReportContent } from "../../services/medicalReportGenerator.js";

function toPlainReportContent(generatedReport) {
  if (!generatedReport || typeof generatedReport !== "object") return "";

  if (typeof generatedReport.report_content === "string" && generatedReport.report_content.trim()) {
    return generatedReport.report_content.trim();
  }

  if (
    generatedReport.patient_information ||
    generatedReport.chief_complaint ||
    generatedReport.history_of_present_illness ||
    generatedReport.medical_assessment ||
    generatedReport.follow_up_instructions ||
    generatedReport.medications
  ) {
    return buildReportContent(generatedReport);
  }

  const summary = typeof generatedReport.summary === "string" ? generatedReport.summary : "";
  const symptoms = Array.isArray(generatedReport.symptoms)
    ? generatedReport.symptoms.filter((item) => typeof item === "string")
    : [];
  const diagnosis = typeof generatedReport.diagnosis === "string" ? generatedReport.diagnosis : "";
  const treatmentPlan =
    typeof generatedReport.treatment_plan === "string" ? generatedReport.treatment_plan : "";
  const recommendations = Array.isArray(generatedReport.recommendations)
    ? generatedReport.recommendations.filter((item) => typeof item === "string")
    : [];

  return [
    "Patient Information",
    "No patient identifiers were provided.",
    "",
    "Chief Complaint",
    summary || "Not documented.",
    "",
    "History of Present Illness",
    summary || "Not documented.",
    "",
    "Symptoms",
    symptoms.length ? symptoms.map((item) => `- ${item}`).join("\n") : "- None documented",
    "",
    "Medical Assessment",
    summary || "Not documented.",
    "",
    "Diagnosis",
    diagnosis || "Not documented.",
    "",
    "Treatment Plan",
    treatmentPlan || "Not documented.",
    "",
    "Medications",
    "- None documented",
    "",
    "Follow-up Instructions",
    recommendations.length ? recommendations.map((item) => `- ${item}`).join("\n") : "- None documented",
  ].join("\n");
}

function parseGeneratedReportValue(value) {
  if (!value) return null;

  const decrypted = decryptData(value);
  if (decrypted && typeof decrypted === "object" && !Buffer.isBuffer(decrypted)) {
    return JSON.stringify(decrypted);
  }

  const text = String(decrypted || "").trim();
  if (!text) return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

function decryptReportRow(row) {
  if (!row) return row;
  return {
    ...row,
    transcription: String(decryptData(row.transcription) || ""),
    report_content: String(decryptData(row.report_content) || ""),
    generated_report: parseGeneratedReportValue(row.generated_report),
  };
}

function normalizeGeneratedReportForWrite(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (encryptionService.isEncryptedValue(value)) return value;

  if (typeof value === "string") {
    return encryptData(value);
  }

  return encryptData(value);
}

function normalizeEncryptedText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (encryptionService.isEncryptedValue(value)) return value;
  return encryptData(String(value));
}

export const reportRepository = {
  async insertReport(data) {
    const created = await prisma.report.create({
      data: {
        ...data,
        transcription: normalizeEncryptedText(data.transcription),
        report_content: normalizeEncryptedText(data.report_content),
        generated_report: normalizeGeneratedReportForWrite(data.generated_report),
      },
    });
    return decryptReportRow(created);
  },

  async createStructuredReport({
    userId,
    patientId = null,
    doctorId = null,
    doctorName = null,
    transcription,
    reportType = "general",
    generatedReport,
    reportContent = "",
    duration = 0,
    audioUrl = null,
    audioStoragePath = null,
    audioMimeType = null,
  }) {
    const text = String(transcription || "");
    const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const normalizedContent =
      typeof reportContent === "string" && reportContent.trim()
        ? reportContent.trim()
        : toPlainReportContent(generatedReport);

    const created = await prisma.report.create({
      data: {
        user_id: userId,
        patient_id: patientId,
        doctor_id: doctorId,
        doctor_name: doctorName,
        transcription: normalizeEncryptedText(text),
        report_content: normalizeEncryptedText(normalizedContent),
        generated_report: normalizeGeneratedReportForWrite(generatedReport ?? {}),
        report_type: reportType || "general",
        duration: Number.isFinite(Number(duration)) ? Number(duration) : 0,
        word_count: wordCount,
        audio_url: audioUrl,
        audio_storage_path: audioStoragePath,
        audio_mime_type: audioMimeType,
      },
    });
    return decryptReportRow(created);
  },

  async findReportByAudioStoragePathForUser(userId, audioStoragePath) {
    if (!userId || !audioStoragePath) return null;
    const row = await prisma.report.findFirst({
      where: {
        user_id: userId,
        audio_storage_path: audioStoragePath,
      },
    });
    return decryptReportRow(row);
  },

  async upsertStructuredReportForAudio({
    userId,
    patientId = null,
    doctorId = null,
    doctorName = null,
    transcription,
    reportType = "general",
    generatedReport,
    reportContent = "",
    duration = 0,
    audioUrl = null,
    audioStoragePath = null,
    audioMimeType = null,
  }) {
    if (!audioStoragePath) {
      return this.createStructuredReport({
        userId,
        patientId,
        doctorId,
        doctorName,
        transcription,
        reportType,
        generatedReport,
        reportContent,
        duration,
        audioUrl,
        audioStoragePath,
        audioMimeType,
      });
    }

    const existing = await prisma.report.findFirst({
      where: {
        user_id: userId,
        audio_storage_path: audioStoragePath,
      },
      select: {
        id: true,
      },
    });

    const normalizedTranscription = String(transcription || "");
    const wordCount = normalizedTranscription.trim()
      ? normalizedTranscription.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const normalizedContent =
      typeof reportContent === "string" && reportContent.trim()
        ? reportContent.trim()
        : toPlainReportContent(generatedReport);

    if (!existing) {
      return this.createStructuredReport({
        userId,
        patientId,
        doctorId,
        doctorName,
        transcription: normalizedTranscription,
        reportType,
        generatedReport,
        reportContent: normalizedContent,
        duration,
        audioUrl,
        audioStoragePath,
        audioMimeType,
      });
    }

    const updated = await prisma.report.update({
      where: { id: existing.id },
      data: {
        patient_id: patientId,
        doctor_id: doctorId,
        doctor_name: doctorName,
        transcription: normalizeEncryptedText(normalizedTranscription),
        report_content: normalizeEncryptedText(normalizedContent),
        generated_report: normalizeGeneratedReportForWrite(generatedReport ?? {}),
        report_type: reportType || "general",
        duration: Number.isFinite(Number(duration)) ? Number(duration) : 0,
        word_count: wordCount,
        audio_url: audioUrl,
        audio_storage_path: audioStoragePath,
        audio_mime_type: audioMimeType,
      },
    });

    return decryptReportRow(updated);
  },

  async getReportByIdForUser(id, userId) {
    const row = await prisma.report.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });
    return decryptReportRow(row);
  },

  async getAllReportsForUser(userId) {
    const rows = await prisma.report.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
    return rows.map(decryptReportRow);
  },

  async updateReportForUser(id, userId, updateData) {
    const report = await prisma.report.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!report) return null;
    const payload = { ...updateData };
    if ("transcription" in payload) {
      payload.transcription = normalizeEncryptedText(payload.transcription);
    }
    if ("report_content" in payload) {
      payload.report_content = normalizeEncryptedText(payload.report_content);
    }
    if ("generated_report" in payload) {
      payload.generated_report = normalizeGeneratedReportForWrite(payload.generated_report);
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: payload,
    });
    return decryptReportRow(updated);
  },

  async deleteReportForUser(id, userId) {
    const report = await prisma.report.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!report) return 0;
    await prisma.report.delete({ where: { id: report.id } });
    return 1;
  },

  async deleteAllReportsForUser(userId) {
    const result = await prisma.report.deleteMany({ where: { user_id: userId } });
    return result.count;
  },

  async searchReportsForUser(userId, query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return [];

    const rows = await this.getAllReportsForUser(userId);
    return rows.filter((row) => {
      const haystack = [
        row.transcription,
        row.report_content,
        row.generated_report || "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  },

  async searchByPatientForUser(userId, patientId) {
    const rows = await prisma.report.findMany({
      where: {
        user_id: userId,
        patient_id: patientId,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    return rows.map(decryptReportRow);
  },

  async getPatientStatsForUser(userId) {
    const [reportRows, patientRows] = await Promise.all([
      prisma.report.findMany({
        where: { user_id: userId },
        select: { patient_id: true },
      }),
      prisma.patient.findMany({
        where: { user_id: userId },
        select: { patient_id: true },
      }),
    ]);

    const reportPatientIds = reportRows.map((row) => row.patient_id).filter(Boolean);
    const patientIds = patientRows.map((row) => row.patient_id).filter(Boolean);
    const uniquePatients = [...new Set([...patientIds, ...reportPatientIds])];

    return {
      totalRecords: reportRows.length,
      totalPatients: uniquePatients.length,
      allPatientIds: uniquePatients,
    };
  },
};
