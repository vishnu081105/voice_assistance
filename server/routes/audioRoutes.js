import fs from "node:fs/promises";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { medicalAudioSessionRepository } from "../lib/repositories/medicalAudioSessionRepository.js";
import { auditLogService } from "../services/auditLogService.js";
import {
  inferAudioMimeType,
  readStoredFile,
  resolveLegacyAudioPath,
} from "../services/privateFileService.js";
import { reportIdParamSchema } from "../validators/reportValidators.js";

const router = Router();

async function sendAudioResponse(res, { filePath, mimeType, downloadName = null }) {
  const payload = await readStoredFile(filePath);
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload || ""), "utf8");

  if (downloadName) {
    res.setHeader("Content-Disposition", `inline; filename="${downloadName}"`);
  }
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Length", buffer.length);
  return res.send(buffer);
}

router.get(
  "/:id",
  requireAuth,
  validateRequest({ params: reportIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.validatedParams;

    const report = await reportsRepository.getReportByIdForUser(id, req.auth.userId);
    if (report) {
      if (report.audio_storage_path) {
        await auditLogService.log(req, {
          action: "view_report_audio",
          resourceType: "report",
          resourceId: report.id,
        });
        return sendAudioResponse(res, {
          filePath: report.audio_storage_path,
          mimeType: report.audio_mime_type || inferAudioMimeType(report.audio_storage_path),
          downloadName: `${report.id}.audio`,
        });
      }

      const legacyPath = resolveLegacyAudioPath(report.audio_url);
      if (legacyPath) {
        await auditLogService.log(req, {
          action: "view_report_audio",
          resourceType: "report",
          resourceId: report.id,
        });
        const buffer = await fs.readFile(legacyPath);
        res.setHeader("Content-Type", report.audio_mime_type || inferAudioMimeType(legacyPath));
        res.setHeader("Content-Length", buffer.length);
        return res.send(buffer);
      }

      return res.status(404).json({ error: { message: "Audio not found" } });
    }

    const medicalSession = await medicalAudioSessionRepository.getSessionByIdForUser(id, req.auth.userId);
    if (!medicalSession?.audio_path) {
      return res.status(404).json({ error: { message: "Audio not found" } });
    }

    await auditLogService.log(req, {
      action: "view_medical_audio",
      resourceType: "medical_audio_session",
      resourceId: medicalSession.id,
    });

    return sendAudioResponse(res, {
      filePath: medicalSession.audio_path,
      mimeType: medicalSession.audio_mime_type || inferAudioMimeType(medicalSession.filename),
      downloadName: medicalSession.filename || `${medicalSession.id}.audio`,
    });
  })
);

export default router;
