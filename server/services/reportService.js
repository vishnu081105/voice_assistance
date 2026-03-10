import { medicalAnalysisService } from "./medicalAnalysisService.js";
import { geminiReportService } from "./geminiReportService.js";
import { transcriptValidationService } from "./transcriptValidationService.js";
import { transcriptCleaningService } from "./transcriptCleaningService.js";

function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${remainingSeconds}`;
}

function parseSpeakerLabel(line) {
  const match = String(line || "").match(/^(doctor|patient|unknown)\s*:\s*(.+)$/i);
  if (!match) {
    return {
      speaker: "Unknown",
      text: String(line || "").trim(),
    };
  }

  const rawSpeaker = String(match[1] || "").trim().toLowerCase();
  const speaker =
    rawSpeaker === "doctor" ? "Doctor" : rawSpeaker === "patient" ? "Patient" : "Unknown";

  return {
    speaker,
    text: String(match[2] || "").trim(),
  };
}

function buildTranscriptEntries(transcription) {
  const cleanedTranscript = transcriptCleaningService.cleanTranscript(transcription);
  const lines = cleanedTranscript
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizedLines =
    lines.length > 0
      ? lines
      : cleanedTranscript
          .split(/(?<=[.!?])\s+/)
          .map((line) => line.trim())
          .filter(Boolean);

  return normalizedLines.map((line, index) => {
    const parsed = parseSpeakerLabel(line);
    return {
      speaker: parsed.speaker,
      text: parsed.text,
      start_time: formatTimestamp(index * 5),
      end_time: formatTimestamp(index * 5 + 5),
    };
  });
}

function buildTranscriptTextFromEntries(transcriptEntries) {
  return transcriptCleaningService.cleanTranscript(
    (Array.isArray(transcriptEntries) ? transcriptEntries : [])
      .map((entry) => transcriptCleaningService.formatTranscriptEntry(entry))
      .filter(Boolean)
      .join("\n")
  );
}

async function generateStructuredReport({
  transcription,
  transcriptEntries,
  structuredData,
  validationSummary,
  reportType = "general",
  patientDetails = {},
  doctorDetails = {},
} = {}) {
  const hasEntries = Array.isArray(transcriptEntries) && transcriptEntries.length > 0;
  const validated = hasEntries
    ? await transcriptValidationService.validateTranscriptEntries({
        transcriptEntries,
      })
    : await transcriptValidationService.validateTranscriptText({
        transcriptText: transcription,
      });

  const entries =
    Array.isArray(validated.correctedTranscriptEntries) && validated.correctedTranscriptEntries.length > 0
      ? validated.correctedTranscriptEntries
      : hasEntries
        ? transcriptEntries
        : buildTranscriptEntries(transcription);

  const text = transcriptCleaningService.cleanTranscript(
    validated.correctedTranscriptText || transcription || buildTranscriptTextFromEntries(entries)
  );

  if (!text) {
    const error = new Error("Missing or invalid transcription field");
    error.statusCode = 400;
    error.code = "INVALID_TRANSCRIPTION";
    throw error;
  }

  const analysis = await medicalAnalysisService.analyzeConversation(entries);
  const mergedStructuredData = {
    ...(validated.structuredData || {}),
    ...(structuredData || {}),
  };

  return geminiReportService.generateStructuredReport({
    transcription: text,
    transcriptEntries: entries,
    analysis,
    structuredData: mergedStructuredData,
    validationSummary: validationSummary || {
      confidence_score: validated.confidenceScore,
      review_required: validated.reviewRequired,
      issues: validated.validationIssues,
    },
    patientDetails,
    doctorDetails,
    reportType,
  });
}

export const reportService = {
  async generateReport({ transcription, reportType = "general", patientDetails = {}, doctorDetails = {} }) {
    return generateStructuredReport({
      transcription,
      reportType,
      patientDetails,
      doctorDetails,
    });
  },

  async generateReportFromTranscriptEntries({
    transcriptEntries,
    structuredData,
    validationSummary,
    reportType = "general",
    patientDetails = {},
    doctorDetails = {},
  } = {}) {
    return generateStructuredReport({
      transcriptEntries,
      structuredData,
      validationSummary,
      reportType,
      patientDetails,
      doctorDetails,
    });
  },
};
