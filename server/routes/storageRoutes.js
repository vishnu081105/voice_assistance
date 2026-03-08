import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import {
  buildAuthenticatedAudioUrl,
  buildPrivateReportAudioPath,
  ensurePrivateStorageDirectories,
  inferAudioMimeType,
  writeEncryptedFile,
} from "../services/privateFileService.js";
import { auditLogService } from "../services/auditLogService.js";
import { config } from "../config.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.medicalAudioMaxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mimeType = inferAudioMimeType(file.originalname, file.mimetype);
    if (!config.allowedAudioMimeTypes.has(mimeType)) {
      cb(new Error("Only audio files are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post(
  "/recordings",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ data: null, error: { message: "No file uploaded" } });
    }

    const reportId = String(req.body.reportId || "").trim();
    if (!reportId) {
      return res.status(400).json({ data: null, error: { message: "reportId is required" } });
    }

    const report = await reportsRepository.getReportByIdForUser(reportId, req.auth.userId);
    if (!report) {
      return res.status(404).json({ data: null, error: { message: "Report not found" } });
    }

    ensurePrivateStorageDirectories();
    const storagePath = buildPrivateReportAudioPath(req.auth.userId, reportId, req.file.originalname);
    await writeEncryptedFile(storagePath, req.file.buffer);

    const mimeType = inferAudioMimeType(req.file.originalname, req.file.mimetype);
    const publicUrl = buildAuthenticatedAudioUrl(req, reportId);

    await reportsRepository.updateReportForUser(reportId, req.auth.userId, {
      audio_url: publicUrl,
      audio_storage_path: storagePath,
      audio_mime_type: mimeType,
    });
    await auditLogService.log(req, {
      action: "upload_report_audio",
      resourceType: "report",
      resourceId: reportId,
    });

    return res.json({
      data: {
        path: storagePath,
        publicUrl,
      },
      error: null,
    });
  })
);

export default router;
