import { Router } from "express";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { auditLogService } from "../services/auditLogService.js";
import { buildAuthenticatedAudioUrl } from "../services/privateFileService.js";
import {
  createReportSchema,
  reportIdParamSchema,
  reportPatientParamSchema,
  reportSearchQuerySchema,
  updateReportSchema,
} from "../validators/reportValidators.js";

const router = Router();

router.use(requireAuth);

function toResponseRow(req, report) {
  if (!report) return report;
  const hasAudio = Boolean(report.audio_storage_path || report.audio_url);
  return {
    ...report,
    audio_url: hasAudio ? buildAuthenticatedAudioUrl(req, report.id) : null,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const reports = await reportsRepository.getAllReportsForUser(req.auth.userId);
    return res.json({
      data: reports.map((report) => toResponseRow(req, report)),
      error: null,
    });
  })
);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await reportsRepository.getPatientStatsForUser(req.auth.userId);
    return res.json({ data: stats, error: null });
  })
);

router.get(
  "/search",
  validateRequest({ query: reportSearchQuerySchema }),
  asyncHandler(async (req, res) => {
    const { q: query } = req.validatedQuery;
    if (!query) {
      return res.json({ data: [], error: null });
    }
    const reports = await reportsRepository.searchReportsForUser(req.auth.userId, query);
    return res.json({
      data: reports.map((report) => toResponseRow(req, report)),
      error: null,
    });
  })
);

router.get(
  "/patient/:patientId",
  validateRequest({ params: reportPatientParamSchema }),
  asyncHandler(async (req, res) => {
    const { patientId } = req.validatedParams;
    const reports = await reportsRepository.searchByPatientForUser(req.auth.userId, patientId);
    return res.json({
      data: reports.map((report) => toResponseRow(req, report)),
      error: null,
    });
  })
);

router.get(
  "/:id/download",
  validateRequest({ params: reportIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.validatedParams;
    const report = await reportsRepository.getReportByIdForUser(id, req.auth.userId);
    if (!report) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }

    await auditLogService.log(req, {
      action: "download_report",
      resourceType: "report",
      resourceId: report.id,
    });

    const payload = [
      `Report ID: ${report.id}`,
      `Created At: ${report.created_at}`,
      `Report Type: ${report.report_type}`,
      "",
      "Transcription:",
      report.transcription,
      "",
      "Report:",
      report.report_content,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.id}.txt"`);
    return res.send(payload);
  })
);

router.get(
  "/:id",
  validateRequest({ params: reportIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.validatedParams;
    const report = await reportsRepository.getReportByIdForUser(id, req.auth.userId);
    if (!report) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }

    await auditLogService.log(req, {
      action: "view_report",
      resourceType: "report",
      resourceId: report.id,
    });

    return res.json({ data: toResponseRow(req, report), error: null });
  })
);

router.post(
  "/",
  validateRequest({ body: createReportSchema }),
  asyncHandler(async (req, res) => {
    const body = req.validatedBody;
    const transcription = String(body.transcription ?? body.transcript ?? "").trim();
    const reportContent = String(body.report_content ?? "").trim();
    if (!transcription || !reportContent) {
      return res.status(400).json({
        data: null,
        error: { message: "transcription and report_content are required" },
      });
    }

    const created = await reportsRepository.insertReport({
      user_id: req.auth.userId,
      transcription,
      report_content: reportContent,
      report_type: String(body.report_type || "general"),
      duration: Number(body.duration || 0),
      word_count: Number(body.word_count || 0),
      patient_id: body.patient_id ? String(body.patient_id) : null,
      doctor_id: body.doctor_id ? String(body.doctor_id) : null,
      doctor_name: body.doctor_name ? String(body.doctor_name) : null,
      audio_url: body.audio_url ? String(body.audio_url) : null,
      generated_report: body.generated_report ?? null,
    });

    await auditLogService.log(req, {
      action: "create_report",
      resourceType: "report",
      resourceId: created.id,
    });

    return res.status(201).json({ data: toResponseRow(req, created), error: null });
  })
);

router.patch(
  "/:id",
  validateRequest({ params: reportIdParamSchema, body: updateReportSchema }),
  asyncHandler(async (req, res) => {
    const updateData = {};
    const keys = [
      "transcription",
      "report_content",
      "report_type",
      "duration",
      "word_count",
      "patient_id",
      "doctor_id",
      "doctor_name",
      "audio_url",
      "audio_storage_path",
      "audio_mime_type",
      "generated_report",
    ];

    for (const key of keys) {
      if (key in req.validatedBody) {
        updateData[key] = req.validatedBody[key];
      }
    }

    const updated = await reportsRepository.updateReportForUser(
      req.validatedParams.id,
      req.auth.userId,
      updateData
    );

    if (!updated) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }

    return res.json({ data: toResponseRow(req, updated), error: null });
  })
);

router.delete(
  "/:id",
  validateRequest({ params: reportIdParamSchema }),
  asyncHandler(async (req, res) => {
    await reportsRepository.deleteReportForUser(req.validatedParams.id, req.auth.userId);
    await auditLogService.log(req, {
      action: "delete_report",
      resourceType: "report",
      resourceId: req.validatedParams.id,
    });
    return res.json({ data: null, error: null });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await reportsRepository.deleteAllReportsForUser(req.auth.userId);
    return res.json({ data: null, error: null });
  })
);

export default router;
