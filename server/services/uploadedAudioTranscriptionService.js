import { medicalConfig } from "../lib/medical/medicalPaths.js";
import { MedicalProcessingError } from "../lib/medical/medicalErrors.js";
import { logger } from "../utils/logger.js";
import { audioProcessingService } from "./audioProcessingService.js";
import { transcriptionService } from "./transcriptionService.js";
import { transcriptValidationService } from "./transcriptValidationService.js";
import { transcriptCleaningService } from "./transcriptCleaningService.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProcessingMessage(error) {
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "").trim().toUpperCase();

  if (code === "UNSUPPORTED_FORMAT" || message.toLowerCase().includes("unsupported audio format")) {
    return "Unsupported audio format. Please upload WAV, MP3, M4A, or WEBM audio.";
  }

  if (code === "FILE_TOO_LARGE" || message.toLowerCase().includes("size limit")) {
    return "Audio file exceeds the configured upload limit.";
  }

  if (code === "STT_TIMEOUT" || message.toLowerCase().includes("timed out")) {
    return "Audio transcription timed out. Please retry with the same recording.";
  }

  if (code === "STT_SERVICE_UNAVAILABLE") {
    return "Transcription service is temporarily unavailable. Please retry shortly.";
  }

  if (code === "AUDIO_TOO_SHORT") {
    return "Audio recording is too short to process reliably.";
  }

  if (code === "AUDIO_TOO_LONG") {
    return "Audio recording exceeds the supported duration limit.";
  }

  if (code === "CORRUPTED_AUDIO_FILE") {
    return "Audio file appears to be corrupted or unreadable.";
  }

  if (code === "LOW_CONFIDENCE_TRANSCRIPT") {
    return "Low confidence transcript detected. Please review the recording and retry if needed.";
  }

  return message || "Audio processing failed. Please upload a valid audio file.";
}

function toProcessingError(error, details = {}) {
  if (error instanceof MedicalProcessingError) {
    return error;
  }

  return new MedicalProcessingError(getProcessingMessage(error), {
    code: error?.code || "AUDIO_PROCESSING_FAILED",
    statusCode: Number(error?.statusCode || 422),
    details,
  });
}

export const uploadedAudioTranscriptionService = {
  async transcribeUploadedAudio({ audioPath, uploadId = "", accessToken: _accessToken = "", onChunk }) {
    if (!audioPath) {
      throw new MedicalProcessingError("Audio processing failed. Please upload a valid audio file.", {
        code: "AUDIO_PROCESSING_FAILED",
        statusCode: 422,
      });
    }

    let prepared = null;

    try {
      prepared = await audioProcessingService.prepareAudioFromPath({
        sourcePath: audioPath,
        workIdPrefix: uploadId ? `upload-${uploadId}` : "upload-audio",
      });

      const streamed = [];
      const transcription = await transcriptionService.transcribeWavFile({
        wavPath: prepared.wavPath,
        onChunkResult: async ({ chunkEntries, progress }) => {
          for (const entry of Array.isArray(chunkEntries) ? chunkEntries : []) {
            streamed.push(entry);

            if (typeof onChunk === "function") {
              await onChunk({
                chunk: entry,
                index: streamed.length - 1,
                total: streamed.length,
                progress,
                transcript: [...streamed],
                chunk_index: streamed.length,
                total_chunks: streamed.length,
              });
            }

            if (medicalConfig.chunkDelayMs > 0) {
              await sleep(medicalConfig.chunkDelayMs);
            }
          }
        },
      });

      const rawEntries =
        Array.isArray(transcription?.entries) && transcription.entries.length > 0
          ? transcription.entries
          : streamed;
      const entries = transcriptCleaningService.cleanTranscriptEntries(rawEntries);
      if (entries.length === 0) {
        throw new Error("Transcript entries are empty.");
      }

      const validation = await transcriptValidationService.validateTranscriptEntries({
        transcriptEntries: entries,
        confidenceScore: transcription?.confidence,
      });

      return {
        rawEntries: entries,
        correctedEntries: validation.correctedTranscriptEntries,
        rawTranscriptText: validation.rawTranscriptText,
        correctedTranscriptText: validation.correctedTranscriptText,
        durationSeconds: Number(transcription?.duration || 0),
        confidenceScore: validation.confidenceScore,
        validationStatus: validation.validationStatus,
        reviewRequired: validation.reviewRequired,
        validationIssues: validation.validationIssues,
        structuredData: validation.structuredData,
        lowConfidence: validation.lowConfidence,
        partial: Boolean(transcription?.partial),
      };
    } catch (error) {
      logger.error("uploaded_audio.processing_failed", {
        uploadId,
        error_code: error?.code || "AUDIO_PROCESSING_FAILED",
        error_name: error?.name || "Error",
      });
      throw toProcessingError(error, { upload_id: uploadId || null });
    } finally {
      await audioProcessingService.cleanupWorkingAudio(prepared);
    }
  },
};
