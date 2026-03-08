import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimiter } from "../middleware/rateLimit.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { audioProcessingService } from "../services/audioProcessingService.js";
import { audioValidationService } from "../services/audioValidationService.js";
import { transcriptionService } from "../services/transcriptionService.js";
import { transcriptCleaningService } from "../services/transcriptCleaningService.js";
import { enhancementService } from "../services/enhancementService.js";
import { reportService } from "../services/reportService.js";
import { auditLogService } from "../services/auditLogService.js";
import { logger } from "../utils/logger.js";
import { generateReportSchema, processTranscriptSchema, transcribeBodySchema } from "../validators/aiValidators.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.medicalAudioMaxSizeMb * 1024 * 1024 },
});

const reportTypes = new Set(["general", "soap", "diagnostic"]);

function normalizeReportType(value) {
  const normalized = String(value || "general").toLowerCase();
  return reportTypes.has(normalized) ? normalized : "general";
}

router.post(
  "/transcribe",
  requireAuth,
  aiRateLimiter,
  upload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const originalName = String(req.file.originalname || "recording.webm");
    const mimeType = String(req.file.mimetype || "");
    await audioValidationService.validateAudioBuffer({
      buffer: req.file.buffer,
      fileName: originalName,
      mimeType,
      maxSizeBytes: config.medicalAudioMaxSizeMb * 1024 * 1024,
    });

    const parseResult = transcribeBodySchema.safeParse({
      language: typeof req.body?.language === "string" ? req.body.language : "auto",
    });
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          message: "Invalid transcription payload",
          details: parseResult.error.issues,
        },
      });
    }

    let preparedAudio = null;
    try {
      preparedAudio = await audioProcessingService.prepareAudioFromBuffer({
        buffer: req.file.buffer,
        originalName,
        mimeType,
        workIdPrefix: "microphone",
      });

      const transcription = await transcriptionService.transcribeWavFile({
        wavPath: preparedAudio.wavPath,
        language: parseResult.data.language,
      });
      const cleanedText = transcriptCleaningService.cleanTranscript(transcription.text);

      return res.json({
        transcript: cleanedText,
        text: cleanedText,
        confidence: Number(transcription.confidence || 0),
        duration: Number(transcription.duration || 0),
        language: transcription.language || parseResult.data.language || "en",
        segments: Array.isArray(transcription.segments) ? transcription.segments : [],
        audio_url: null,
      });
    } catch (error) {
      logger.error("Transcription request failed", {
        endpoint: req.originalUrl,
        user_id: req.auth?.userId || null,
        error_code: error?.code || "TRANSCRIPTION_FAILED",
        error_name: error?.name || "Error",
      });
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : "Transcription failed. Please try again.";
      return res.status(Number(error?.statusCode || 500)).json({
        error: {
          code: error?.code || "TRANSCRIPTION_FAILED",
          message,
          details: error?.details,
        },
      });
    } finally {
      await audioProcessingService.cleanupWorkingAudio(preparedAudio);
    }
  })
);

router.post(
  ["/process-transcript", "/enhance-transcript"],
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: processTranscriptSchema }),
  asyncHandler(async (req, res) => {
    try {
      const { transcription, enableDiarization, enhanceTerminology } = req.validatedBody;

      const enhanced = enhancementService.enhanceTranscript({
        transcription,
        enableDiarization,
        enhanceTerminology,
      });

      return res.json({
        processed: enhanced.processed,
        original: transcription,
        speakers: enhanced.speakers,
        hasDiarization: enhanced.hasDiarization,
        hasEnhancement: enhanced.hasEnhancement,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      return res.status(statusCode).json({
        error: {
          code: error?.code || "ENHANCEMENT_FAILED",
          message: error instanceof Error ? error.message : "Enhancement failed",
        },
      });
    }
  })
);

router.post(
  "/generate-report",
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: generateReportSchema }),
  asyncHandler(async (req, res) => {
    try {
      const {
        transcription: rawTranscription,
        reportType: requestedReportType,
        patient_id: patientId,
        doctor_id: doctorId,
        doctor_name: doctorName,
        patient_details: patientDetails,
        doctor_details: doctorDetails,
        persist,
      } = req.validatedBody;

      const transcription = transcriptCleaningService.cleanTranscript(rawTranscription);
      const reportType = normalizeReportType(requestedReportType);

      const report = await reportService.generateReport({
        transcription,
        reportType,
        patientDetails,
        doctorDetails,
      });

      let reportId = null;
      if (persist) {
        const saved = await reportsRepository.createStructuredReport({
          userId: req.auth.userId,
          patientId,
          doctorId,
          doctorName,
          transcription,
          reportType,
          generatedReport: report,
          reportContent: report.report_content,
        });
        reportId = saved?.id || null;
        await auditLogService.log(req, {
          action: "create_report",
          resourceType: "report",
          resourceId: reportId,
        });
      }

      return res.json({
        patient_information: report.patient_information,
        chief_complaint: report.chief_complaint,
        history_of_present_illness: report.history_of_present_illness,
        summary: report.summary,
        symptoms: report.symptoms,
        medical_assessment: report.medical_assessment,
        diagnosis: report.diagnosis,
        treatment_plan: report.treatment_plan,
        medications: report.medications,
        follow_up_instructions: report.follow_up_instructions,
        recommendations: report.recommendations,
        report_content: report.report_content,
        report_id: reportId,
      });
    } catch (error) {
      logger.error("Report generation failed", {
        endpoint: req.originalUrl,
        user_id: req.auth?.userId || null,
        error_code: error?.code || "REPORT_GENERATION_FAILED",
        error_name: error?.name || "Error",
      });
      const statusCode = Number(error?.statusCode || 500);
      return res.status(statusCode).json({
        error: {
          code: error?.code || "REPORT_GENERATION_FAILED",
          message: error instanceof Error ? error.message : "Failed to generate report",
        },
      });
    }
  })
);

export default router;
