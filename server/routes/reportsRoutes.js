import { Router } from "express";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const reports = await reportsRepository.getAllReportsForUser(req.auth.userId);
    return res.json({ data: reports, error: null });
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
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) {
      return res.json({ data: [], error: null });
    }
    const reports = await reportsRepository.searchReportsForUser(req.auth.userId, query);
    return res.json({ data: reports, error: null });
  })
);

router.get(
  "/patient/:patientId",
  asyncHandler(async (req, res) => {
    const patientId = String(req.params.patientId || "");
    const reports = await reportsRepository.searchByPatientForUser(req.auth.userId, patientId);
    return res.json({ data: reports, error: null });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const report = await reportsRepository.getReportByIdForUser(req.params.id, req.auth.userId);
    if (!report) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    return res.json({ data: report, error: null });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const transcription = String(req.body.transcription ?? req.body.transcript ?? "").trim();
    const reportContent = String(req.body.report_content ?? "").trim();
    if (!transcription || !reportContent) {
      return res.status(400).json({
        data: null,
        error: { message: "transcription and report_content are required" },
      });
    }

    const generatedReport =
      req.body.generated_report === undefined || req.body.generated_report === null
        ? null
        : typeof req.body.generated_report === "string"
          ? req.body.generated_report
          : JSON.stringify(req.body.generated_report);

    const created = await reportsRepository.insertReport({
      user_id: req.auth.userId,
      transcription,
      report_content: reportContent,
      report_type: String(req.body.report_type || "general"),
      duration: Number(req.body.duration || 0),
      word_count: Number(req.body.word_count || 0),
      patient_id: req.body.patient_id ? String(req.body.patient_id) : null,
      doctor_id: req.body.doctor_id ? String(req.body.doctor_id) : null,
      doctor_name: req.body.doctor_name ? String(req.body.doctor_name) : null,
      audio_url: req.body.audio_url ? String(req.body.audio_url) : null,
      generated_report: generatedReport,
    });
    return res.status(201).json({ data: created, error: null });
  })
);

router.patch(
  "/:id",
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
      "generated_report",
    ];
    for (const key of keys) {
      if (key in req.body) {
        updateData[key] = req.body[key];
      }
    }
    const updated = await reportsRepository.updateReportForUser(req.params.id, req.auth.userId, updateData);
    if (!updated) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    return res.json({ data: updated, error: null });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await reportsRepository.deleteReportForUser(req.params.id, req.auth.userId);
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
