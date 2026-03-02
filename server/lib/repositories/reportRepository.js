import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";

function toPlainReportContent(generatedReport) {
  if (!generatedReport || typeof generatedReport !== "object") return "";

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
    `Summary:\n${summary || "N/A"}`,
    `Symptoms:\n${symptoms.length ? symptoms.map((item) => `- ${item}`).join("\n") : "- N/A"}`,
    `Diagnosis:\n${diagnosis || "N/A"}`,
    `Treatment Plan:\n${treatmentPlan || "N/A"}`,
    `Recommendations:\n${
      recommendations.length ? recommendations.map((item) => `- ${item}`).join("\n") : "- N/A"
    }`,
  ].join("\n\n");
}

export const reportRepository = {
  async insertReport(data) {
    return prisma.report.create({ data });
  },

  async createStructuredReport({
    userId,
    patientId = null,
    doctorId = null,
    doctorName = null,
    transcription,
    reportType = "general",
    generatedReport,
  }) {
    const text = String(transcription || "");
    const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

    return prisma.report.create({
      data: {
        user_id: userId,
        patient_id: patientId,
        doctor_id: doctorId,
        doctor_name: doctorName,
        transcription: text,
        report_content: toPlainReportContent(generatedReport),
        generated_report: JSON.stringify(generatedReport ?? {}),
        report_type: reportType || "general",
        duration: 0,
        word_count: wordCount,
      },
    });
  },

  async getReportByIdForUser(id, userId) {
    return prisma.report.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });
  },

  async getAllReportsForUser(userId) {
    return prisma.report.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
  },

  async updateReportForUser(id, userId, updateData) {
    const report = await prisma.report.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!report) return null;
    return prisma.report.update({
      where: { id: report.id },
      data: updateData,
    });
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
    const pattern = `%${query.toLowerCase()}%`;
    return prisma.$queryRaw(
      Prisma.sql`
        SELECT *
        FROM "Report"
        WHERE "user_id" = ${userId}
          AND (
            LOWER("transcription") LIKE ${pattern}
            OR LOWER("report_content") LIKE ${pattern}
            OR LOWER(COALESCE("generated_report", '')) LIKE ${pattern}
          )
        ORDER BY "created_at" DESC
      `
    );
  },

  async searchByPatientForUser(userId, patientId) {
    return prisma.report.findMany({
      where: {
        user_id: userId,
        patient_id: patientId,
      },
      orderBy: {
        created_at: "desc",
      },
    });
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
