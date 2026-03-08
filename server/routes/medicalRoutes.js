import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { medicalUploadRateLimiter } from "../middleware/rateLimit.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { ensureMedicalDirectories, medicalConfig } from "../lib/medical/medicalPaths.js";
import { ensureMedicalAudioSchema } from "../lib/medical/medicalSchema.js";
import { formatMedicalError, MedicalProcessingError } from "../lib/medical/medicalErrors.js";
import { medicalAudioSessionRepository } from "../lib/repositories/medicalAudioSessionRepository.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { medicalQueueService } from "../services/medicalQueueService.js";
import { medicalReportGenerator } from "../services/medicalReportGenerator.js";
import { medicalRuntimeStore } from "../services/medicalRuntimeStore.js";
import { medicalTranscriptionChannel } from "../services/medicalTranscriptionChannel.js";
import { auditLogService } from "../services/auditLogService.js";
import { audioValidationService } from "../services/audioValidationService.js";
import { reportService } from "../services/reportService.js";
import {
  buildAuthenticatedAudioUrl,
  buildPrivateMedicalAudioPath,
  buildPrivateMedicalReportPath,
  buildPrivateMedicalTranscriptPath,
  ensurePrivateStorageDirectories,
  inferAudioMimeType,
  readEncryptedFile,
  writeEncryptedFile,
} from "../services/privateFileService.js";
import { transcriptValidationService } from "../services/transcriptValidationService.js";
import { medicalUploadIdParamSchema, updateMedicalTranscriptSchema } from "../validators/aiValidators.js";
import { logger } from "../utils/logger.js";

const router = Router();
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".mpeg", ".m4a", ".webm"]);
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
]);
const UNSUPPORTED_AUDIO_FORMAT_MESSAGE =
  "Unsupported audio format. Please upload WAV, MP3, MPEG, M4A, or WEBM audio.";

ensureMedicalDirectories();
ensurePrivateStorageDirectories();

function sanitizeBaseName(fileName) {
  const normalized = path.basename(String(fileName || "audio"));
  const withoutExt = normalized.replace(/\.[^.]+$/, "");
  const safe = withoutExt.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return safe || "audio";
}

function getBooleanQuery(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeMimeType(mimeType, fileName = "") {
  const normalized = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  if (normalized === "video/webm") {
    return "audio/webm";
  }

  if (normalized === "audio/mp3") {
    return "audio/mpeg";
  }

  if (normalized === "audio/x-m4a") {
    return "audio/m4a";
  }

  if (SUPPORTED_AUDIO_MIME_TYPES.has(normalized)) {
    return normalized;
  }

  const inferred = inferAudioMimeType(fileName, "");
  return inferred === "audio/mp3" ? "audio/mpeg" : inferred;
}

function validateAudioFile(file) {
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    throw new MedicalProcessingError(UNSUPPORTED_AUDIO_FORMAT_MESSAGE, {
      code: "UNSUPPORTED_FORMAT",
      statusCode: 400,
    });
  }

  const mime = normalizeMimeType(file?.mimetype, file?.originalname);
  if (!SUPPORTED_AUDIO_MIME_TYPES.has(mime)) {
    throw new MedicalProcessingError(UNSUPPORTED_AUDIO_FORMAT_MESSAGE, {
      code: "UNSUPPORTED_FORMAT",
      statusCode: 400,
    });
  }

  return mime;
}

function createStructuredErrorResponse(res, statusCode, error, fallbackMessage) {
  const payload = formatMedicalError(error, fallbackMessage);
  return res.status(statusCode).json({ error: payload });
}

async function readJsonArtifact(filePath) {
  const content = await readEncryptedFile(filePath);
  if (Array.isArray(content) || (content && typeof content === "object")) {
    return content;
  }

  if (Buffer.isBuffer(content)) {
    return JSON.parse(content.toString("utf8") || "[]");
  }

  return JSON.parse(String(content || "[]"));
}

async function readTextArtifact(filePath) {
  const content = await readEncryptedFile(filePath);
  if (Buffer.isBuffer(content)) {
    return content.toString("utf8");
  }
  return String(content || "");
}

async function findLinkedReport(session, userId) {
  if (!session?.audio_path || !userId) return null;
  return reportsRepository.findReportByAudioStoragePathForUser(userId, session.audio_path);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: medicalConfig.maxAudioSizeBytes },
  fileFilter: (_req, file, cb) => {
    try {
      validateAudioFile(file);
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  },
});

function uploadSingleAudio(req, res, next) {
  upload.single("audio")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(
        new MedicalProcessingError("Audio file exceeds configured size limit.", {
          code: "FILE_TOO_LARGE",
          statusCode: 413,
          details: {
            max_size_bytes: medicalConfig.maxAudioSizeBytes,
          },
        })
      );
      return;
    }

    next(error);
  });
}

router.use(requireAuth);

router.post(
  "/audio-upload",
  medicalUploadRateLimiter,
  uploadSingleAudio,
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    ensureMedicalDirectories();
    ensurePrivateStorageDirectories();

    if (!req.file) {
      return createStructuredErrorResponse(
        res,
        400,
        new MedicalProcessingError("Audio file is required", {
          code: "NO_FILE",
          statusCode: 400,
        }),
        "Audio file is required"
      );
    }

    const mimeType = validateAudioFile(req.file);
    await audioValidationService.validateAudioBuffer({
      buffer: req.file.buffer,
      fileName: req.file.originalname || "medical-audio.webm",
      mimeType,
      maxSizeBytes: medicalConfig.maxAudioSizeBytes,
    });
    const uploadId = randomUUID();
    const safeBaseName = sanitizeBaseName(req.file.originalname || "consultation");
    const fileName = `${safeBaseName}${path.extname(req.file.originalname || ".webm").toLowerCase() || ".webm"}`;
    const storagePath = buildPrivateMedicalAudioPath(req.auth.userId, uploadId, fileName);

    await writeEncryptedFile(storagePath, req.file.buffer);

    await medicalAudioSessionRepository.createSession({
      id: uploadId,
      userId: req.auth.userId,
      filename: fileName,
      uploadTime: new Date(),
      processingStatus: "uploaded",
      audioPath: storagePath,
      audioFilePath: storagePath,
      audioMimeType: mimeType,
    });

    medicalRuntimeStore.initialize(uploadId);
    medicalQueueService.enqueue({ uploadId });
    await auditLogService.log(req, {
      action: "upload_medical_audio",
      resourceType: "medical_audio_session",
      resourceId: uploadId,
    });

    return res.status(201).json({
      upload_id: uploadId,
      status: "uploaded",
      audio_url: buildAuthenticatedAudioUrl(req, uploadId),
    });
  })
);

router.get(
  "/status/:id",
  validateRequest({ params: medicalUploadIdParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    const uploadId = req.validatedParams.id;

    const session = await medicalAudioSessionRepository.getSessionByIdForUser(uploadId, req.auth.userId);
    if (!session) {
      return createStructuredErrorResponse(
        res,
        404,
        new MedicalProcessingError("Medical audio session not found", {
          code: "NOT_FOUND",
          statusCode: 404,
        }),
        "Medical audio session not found"
      );
    }

    const runtimeStatus = medicalRuntimeStore.getStatus(uploadId);
    const runtimeError = medicalRuntimeStore.getError(uploadId);
    const status = runtimeStatus || session.processing_status;
    const linkedReport = await findLinkedReport(session, req.auth.userId);

    return res.json({
      upload_id: session.id,
      status,
      processing_status: status,
      upload_time: session.upload_time,
      filename: session.filename,
      audio_url: buildAuthenticatedAudioUrl(req, session.id),
      transcript_available: Boolean(session.transcript_path),
      report_available: Boolean(session.report_path),
      confidence_score: session.transcript_confidence,
      review_required: Boolean(session.transcript_review_required),
      validation_status: session.transcript_validation_status,
      report_record_id: linkedReport?.id || null,
      error: runtimeError || (session.error_message ? { code: "PROCESSING_ERROR", message: session.error_message } : null),
    });
  })
);

router.get(
  "/transcript/:id",
  validateRequest({ params: medicalUploadIdParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    const uploadId = req.validatedParams.id;
    const session = await medicalAudioSessionRepository.getSessionByIdForUser(uploadId, req.auth.userId);
    if (!session) {
      return createStructuredErrorResponse(
        res,
        404,
        new MedicalProcessingError("Medical audio session not found", {
          code: "NOT_FOUND",
          statusCode: 404,
        }),
        "Medical audio session not found"
      );
    }

    let transcript = medicalRuntimeStore.getTranscript(uploadId);
    if ((!Array.isArray(transcript) || transcript.length === 0) && session.transcript_path) {
      try {
        const storedTranscript = await readJsonArtifact(session.transcript_path);
        transcript = Array.isArray(storedTranscript) ? storedTranscript : [];
      } catch (error) {
        logger.warn("Failed to read transcript artifact", {
          endpoint: req.originalUrl,
          user_id: req.auth.userId,
          upload_id: uploadId,
          error_message: error instanceof Error ? error.message : String(error),
        });
        transcript = [];
      }
    }

    const linkedReport = await findLinkedReport(session, req.auth.userId);

    await auditLogService.log(req, {
      action: "view_medical_transcript",
      resourceType: "medical_audio_session",
      resourceId: uploadId,
    });

    return res.json({
      upload_id: uploadId,
      status: medicalRuntimeStore.getStatus(uploadId) || session.processing_status,
      transcript: Array.isArray(transcript) ? transcript : [],
      raw_transcript_text: session.raw_transcription_text || "",
      corrected_transcript_text: session.corrected_transcription_text || session.transcription_text || "",
      confidence_score: session.transcript_confidence,
      review_required: Boolean(session.transcript_review_required),
      validation_status: session.transcript_validation_status,
      validation_issues: Array.isArray(session.transcript_validation_issues)
        ? session.transcript_validation_issues
        : [],
      report_record_id: linkedReport?.id || null,
      audio_url: buildAuthenticatedAudioUrl(req, session.id),
    });
  })
);

router.put(
  "/transcript/:id",
  validateRequest({ params: medicalUploadIdParamSchema, body: updateMedicalTranscriptSchema }),
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    const uploadId = req.validatedParams.id;
    const session = await medicalAudioSessionRepository.getSessionByIdForUser(uploadId, req.auth.userId);

    if (!session) {
      return createStructuredErrorResponse(
        res,
        404,
        new MedicalProcessingError("Medical audio session not found", {
          code: "NOT_FOUND",
          statusCode: 404,
        }),
        "Medical audio session not found"
      );
    }

    const reviewedTranscriptText = req.validatedBody.transcript_text;
    const validation = await transcriptValidationService.validateTranscriptText({
      transcriptText: reviewedTranscriptText,
      confidenceScore: session.transcript_confidence ?? 1,
    });

    const transcriptEntries =
      Array.isArray(validation.correctedTranscriptEntries) && validation.correctedTranscriptEntries.length > 0
        ? validation.correctedTranscriptEntries
        : validation.rawTranscriptEntries;

    const transcriptPath = buildPrivateMedicalTranscriptPath(uploadId);
    const reportPath = session.report_path || buildPrivateMedicalReportPath(uploadId, "json");
    const reportHtmlPath = session.report_html_path || buildPrivateMedicalReportPath(uploadId, "html");

    const structuredReport = await reportService.generateReportFromTranscriptEntries({
      transcriptEntries,
      structuredData: validation.structuredData || {},
      validationSummary: {
        confidence_score: validation.confidenceScore,
        review_required: validation.reviewRequired,
        issues: validation.validationIssues,
      },
      reportType: "general",
    });

    const { jsonReport, htmlReport } = medicalReportGenerator.generate({
      session,
      transcriptEntries,
      analysis: null,
      structuredReport,
    });

    await Promise.all([
      writeEncryptedFile(transcriptPath, transcriptEntries),
      writeEncryptedFile(reportPath, jsonReport),
      writeEncryptedFile(reportHtmlPath, htmlReport),
    ]);

    const updatedSession = await medicalAudioSessionRepository.updateSessionById(uploadId, {
      processing_status: "completed",
      transcript_path: transcriptPath,
      report_path: reportPath,
      report_html_path: reportHtmlPath,
      transcription_text: validation.correctedTranscriptText,
      corrected_transcription_text: validation.correctedTranscriptText,
      transcript_confidence: validation.confidenceScore,
      transcript_review_required: Boolean(validation.reviewRequired),
      transcript_validation_status: validation.validationStatus,
      transcript_validation_issues: validation.validationIssues || [],
      structured_medical_data: validation.structuredData || {},
      error_message: null,
    });

    medicalRuntimeStore.replaceTranscript(uploadId, transcriptEntries);
    medicalRuntimeStore.setStatus(uploadId, "completed");
    medicalRuntimeStore.setError(uploadId, null);

    const linkedReport = await reportsRepository.upsertStructuredReportForAudio({
      userId: req.auth.userId,
      patientId: null,
      doctorId: null,
      doctorName: null,
      transcription: validation.correctedTranscriptText,
      reportType: "general",
      generatedReport: structuredReport,
      reportContent: structuredReport.report_content,
      duration: 0,
      audioUrl: null,
      audioStoragePath: session.audio_path,
      audioMimeType: session.audio_mime_type,
    });

    medicalTranscriptionChannel.emit(uploadId, "TRANSCRIPTION_UPDATE", {
      upload_id: uploadId,
      status: "completed",
      transcript_count: transcriptEntries.length,
      transcript: transcriptEntries,
      report_ready: true,
      report_record_id: linkedReport?.id || null,
      review_required: Boolean(validation.reviewRequired),
      confidence_score: validation.confidenceScore,
    });

    medicalTranscriptionChannel.emit(uploadId, "TRANSCRIPTION_COMPLETED", {
      upload_id: uploadId,
      status: "completed",
      report_ready: true,
      report_record_id: linkedReport?.id || null,
      review_required: Boolean(validation.reviewRequired),
      confidence_score: validation.confidenceScore,
    });

    await auditLogService.log(req, {
      action: "review_medical_transcript",
      resourceType: "medical_audio_session",
      resourceId: uploadId,
    });

    return res.json({
      upload_id: uploadId,
      status: updatedSession?.processing_status || "completed",
      transcript: transcriptEntries,
      raw_transcript_text: session.raw_transcription_text || validation.rawTranscriptText,
      corrected_transcript_text: validation.correctedTranscriptText,
      confidence_score: validation.confidenceScore,
      review_required: Boolean(validation.reviewRequired),
      validation_status: validation.validationStatus,
      validation_issues: validation.validationIssues || [],
      report: jsonReport,
      report_record_id: linkedReport?.id || null,
      audio_url: buildAuthenticatedAudioUrl(req, session.id),
    });
  })
);

router.get(
  "/transcript/:id/stream",
  validateRequest({ params: medicalUploadIdParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    const uploadId = req.validatedParams.id;
    const channel = String(req.query.channel || medicalConfig.channelName);

    if (channel !== medicalConfig.channelName) {
      return createStructuredErrorResponse(
        res,
        400,
        new MedicalProcessingError(`Unsupported channel: ${channel}`, {
          code: "INVALID_CHANNEL",
          statusCode: 400,
        }),
        "Unsupported channel"
      );
    }

    const session = await medicalAudioSessionRepository.getSessionByIdForUser(uploadId, req.auth.userId);
    if (!session) {
      return createStructuredErrorResponse(
        res,
        404,
        new MedicalProcessingError("Medical audio session not found", {
          code: "NOT_FOUND",
          statusCode: 404,
        }),
        "Medical audio session not found"
      );
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    medicalTranscriptionChannel.subscribe(uploadId, res);

    const currentStatus = medicalRuntimeStore.getStatus(uploadId) || session.processing_status;
    const currentTranscript = medicalRuntimeStore.getTranscript(uploadId);
    const currentError = medicalRuntimeStore.getError(uploadId);
    const linkedReport = await findLinkedReport(session, req.auth.userId);

    medicalTranscriptionChannel.sendToClient(res, "TRANSCRIPTION_STARTED", {
      upload_id: uploadId,
      status: currentStatus || "uploaded",
    });

    if (Array.isArray(currentTranscript) && currentTranscript.length > 0) {
      medicalTranscriptionChannel.sendToClient(res, "TRANSCRIPTION_UPDATE", {
        upload_id: uploadId,
        status: currentStatus,
        transcript_count: currentTranscript.length,
        transcript: currentTranscript,
      });
    }

    if (["completed", "failed"].includes(currentStatus)) {
      medicalTranscriptionChannel.sendToClient(res, "TRANSCRIPTION_COMPLETED", {
        upload_id: uploadId,
        status: currentStatus,
        error: currentError,
        report_record_id: linkedReport?.id || null,
      });
    }

    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      medicalTranscriptionChannel.unsubscribe(uploadId, res);
      res.end();
    });
  })
);

router.get(
  "/report/:id",
  validateRequest({ params: medicalUploadIdParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureMedicalAudioSchema();
    const uploadId = req.validatedParams.id;
    const format = String(req.query.format || "json").toLowerCase();
    const download = getBooleanQuery(String(req.query.download || ""));

    const session = await medicalAudioSessionRepository.getSessionByIdForUser(uploadId, req.auth.userId);
    if (!session) {
      return createStructuredErrorResponse(
        res,
        404,
        new MedicalProcessingError("Medical audio session not found", {
          code: "NOT_FOUND",
          statusCode: 404,
        }),
        "Medical audio session not found"
      );
    }

    if (session.processing_status !== "completed" || !session.report_path) {
      return createStructuredErrorResponse(
        res,
        409,
        new MedicalProcessingError("Report generation is still in progress", {
          code: "REPORT_NOT_READY",
          statusCode: 409,
        }),
        "Report generation is still in progress"
      );
    }

    const linkedReport = await findLinkedReport(session, req.auth.userId);

    await auditLogService.log(req, {
      action: download ? "download_medical_report" : "view_medical_report",
      resourceType: "medical_audio_session",
      resourceId: uploadId,
    });

    if (format === "html") {
      if (!session.report_html_path) {
        return createStructuredErrorResponse(
          res,
          404,
          new MedicalProcessingError("HTML report not found", {
            code: "REPORT_NOT_FOUND",
            statusCode: 404,
          }),
          "HTML report not found"
        );
      }
      const htmlContent = await readTextArtifact(session.report_html_path);
      if (download) {
        res.setHeader("Content-Disposition", `attachment; filename="${uploadId}-clinical-report.html"`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(htmlContent);
    }

    const reportPayload = await readJsonArtifact(session.report_path);
    if (download) {
      res.setHeader("Content-Disposition", `attachment; filename="${uploadId}-clinical-report.json"`);
    }
    return res.json({
      upload_id: uploadId,
      status: session.processing_status,
      report: reportPayload,
      report_record_id: linkedReport?.id || null,
      audio_url: buildAuthenticatedAudioUrl(req, session.id),
    });
  })
);

router.use((error, _req, res, _next) => {
  const normalized = formatMedicalError(error);
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  return res.status(statusCode).json({ error: normalized });
});

export default router;
