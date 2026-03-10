import { ensureMedicalDirectories } from "../lib/medical/medicalPaths.js";
import { ensureMedicalAudioSchema } from "../lib/medical/medicalSchema.js";
import { formatMedicalError, MedicalProcessingError } from "../lib/medical/medicalErrors.js";
import { medicalAudioSessionRepository } from "../lib/repositories/medicalAudioSessionRepository.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";
import { uploadedAudioTranscriptionService } from "./uploadedAudioTranscriptionService.js";
import { medicalReportGenerator } from "./medicalReportGenerator.js";
import { medicalRuntimeStore } from "./medicalRuntimeStore.js";
import { medicalTranscriptionChannel } from "./medicalTranscriptionChannel.js";
import { reportService } from "./reportService.js";
import { transcriptCleaningService } from "./transcriptCleaningService.js";
import {
  buildPrivateMedicalReportPath,
  buildPrivateMedicalTranscriptPath,
  writeEncryptedFile,
} from "./privateFileService.js";

function emitEvent(uploadId, eventType, payload) {
  medicalTranscriptionChannel.emit(uploadId, eventType, {
    upload_id: uploadId,
    ...payload,
  });
}

async function updateStatus(uploadId, processingStatus, extra = {}) {
  medicalRuntimeStore.setStatus(uploadId, processingStatus);
  await medicalAudioSessionRepository.updateSessionById(uploadId, {
    processing_status: processingStatus,
    ...extra,
  });
}

async function persistTranscript(uploadId, transcriptEntries) {
  const transcriptPath = buildPrivateMedicalTranscriptPath(uploadId);
  await writeEncryptedFile(transcriptPath, transcriptEntries);
  return transcriptPath;
}

function buildTranscriptText(transcriptEntries) {
  return (Array.isArray(transcriptEntries) ? transcriptEntries : [])
    .map((entry) => transcriptCleaningService.formatTranscriptEntry(entry))
    .filter(Boolean)
    .join("\n");
}

async function persistReport(uploadId, jsonReport, htmlReport) {
  const reportPath = buildPrivateMedicalReportPath(uploadId, "json");
  const reportHtmlPath = buildPrivateMedicalReportPath(uploadId, "html");

  await Promise.all([writeEncryptedFile(reportPath, jsonReport), writeEncryptedFile(reportHtmlPath, htmlReport)]);

  return { reportPath, reportHtmlPath };
}

async function runSinglePipeline({ uploadId, accessToken = "" }) {
  await ensureMedicalAudioSchema();
  ensureMedicalDirectories();

  const session = await medicalAudioSessionRepository.getSessionById(uploadId);
  if (!session) {
    throw new MedicalProcessingError("Medical upload session not found", {
      code: "SESSION_NOT_FOUND",
      statusCode: 404,
    });
  }

  await updateStatus(uploadId, "queued");
  emitEvent(uploadId, "TRANSCRIPTION_STARTED", { status: "queued" });

  await updateStatus(uploadId, "stt_processing");

  const transcriptionResult = await uploadedAudioTranscriptionService.transcribeUploadedAudio({
    audioPath: session.audio_path,
    uploadId,
    accessToken,
    onChunk: async ({ chunk, index, total, transcript, progress }) => {
      medicalRuntimeStore.replaceTranscript(uploadId, transcript);
      emitEvent(uploadId, "TRANSCRIPTION_UPDATE", {
        status: "stt_processing",
        progress:
          Number.isFinite(progress) && progress > 0
            ? progress
            : total > 0
              ? Number((((index + 1) / total) * 100).toFixed(2))
              : 0,
        transcript_count: transcript.length,
        chunk,
      });
    },
  });

  const rawTranscriptEntries = Array.isArray(transcriptionResult?.rawEntries)
    ? transcriptionResult.rawEntries
    : [];
  const correctedTranscriptEntries =
    Array.isArray(transcriptionResult?.correctedEntries) && transcriptionResult.correctedEntries.length > 0
      ? transcriptionResult.correctedEntries
      : rawTranscriptEntries;
  const rawTranscriptionText =
    String(transcriptionResult?.rawTranscriptText || "").trim() ||
    buildTranscriptText(rawTranscriptEntries);
  const correctedTranscriptionText =
    String(transcriptionResult?.correctedTranscriptText || "").trim() ||
    rawTranscriptionText;
  const transcriptPath = await persistTranscript(uploadId, rawTranscriptEntries);
  await updateStatus(uploadId, "analysis_processing", {
    transcript_path: transcriptPath,
    transcription_text: correctedTranscriptionText,
    raw_transcription_text: rawTranscriptionText,
    corrected_transcription_text: correctedTranscriptionText,
    transcript_confidence: transcriptionResult?.confidenceScore ?? null,
    transcript_review_required: Boolean(transcriptionResult?.reviewRequired),
    transcript_validation_status: transcriptionResult?.validationStatus || "validated",
    transcript_validation_issues: transcriptionResult?.validationIssues || [],
    structured_medical_data: transcriptionResult?.structuredData || {},
    error_message: null,
  });

  await updateStatus(uploadId, "report_generation");
  const structuredReport = await reportService.generateReportFromTranscriptEntries({
    transcriptEntries: correctedTranscriptEntries,
    structuredData: transcriptionResult?.structuredData || {},
    validationSummary: {
      confidence_score: transcriptionResult?.confidenceScore ?? null,
      review_required: Boolean(transcriptionResult?.reviewRequired),
      issues: transcriptionResult?.validationIssues || [],
    },
    reportType: "general",
  });
  const { jsonReport, htmlReport } = medicalReportGenerator.generate({
    session,
    transcriptEntries: rawTranscriptEntries,
    analysis: null,
    structuredReport,
  });

  const { reportPath, reportHtmlPath } = await persistReport(uploadId, jsonReport, htmlReport);
  const linkedReport = await reportsRepository.upsertStructuredReportForAudio({
    userId: session.user_id,
    patientId: null,
    doctorId: null,
    doctorName: null,
    transcription: correctedTranscriptionText,
    reportType: "general",
    generatedReport: structuredReport,
    reportContent: structuredReport.report_content,
    duration: Number(transcriptionResult?.durationSeconds || 0),
    audioUrl: null,
    audioStoragePath: session.audio_path,
    audioMimeType: session.audio_mime_type,
  });

  await updateStatus(uploadId, "completed", {
    report_path: reportPath,
    report_html_path: reportHtmlPath,
    transcription_text: correctedTranscriptionText,
    raw_transcription_text: rawTranscriptionText,
    corrected_transcription_text: correctedTranscriptionText,
    transcript_confidence: transcriptionResult?.confidenceScore ?? null,
    transcript_review_required: Boolean(transcriptionResult?.reviewRequired),
    transcript_validation_status: transcriptionResult?.validationStatus || "validated",
    transcript_validation_issues: transcriptionResult?.validationIssues || [],
    structured_medical_data: transcriptionResult?.structuredData || {},
    error_message: null,
  });

  emitEvent(uploadId, "TRANSCRIPTION_COMPLETED", {
    status: "completed",
    transcript_count: rawTranscriptEntries.length,
    report_ready: true,
    report_record_id: linkedReport?.id || null,
    confidence_score: transcriptionResult?.confidenceScore ?? null,
    review_required: Boolean(transcriptionResult?.reviewRequired),
  });
}

export const medicalPipelineService = {
  async processUpload({ uploadId, accessToken = "" }) {
    try {
      await runSinglePipeline({ uploadId, accessToken });
    } catch (error) {
      const normalized = formatMedicalError(error);
      medicalRuntimeStore.setStatus(uploadId, "failed");
      medicalRuntimeStore.setError(uploadId, normalized);

      await medicalAudioSessionRepository.updateSessionById(uploadId, {
        processing_status: "failed",
        error_message: normalized.message,
      });

      emitEvent(uploadId, "TRANSCRIPTION_COMPLETED", {
        status: "failed",
        error: normalized,
      });
    }
  },
};
