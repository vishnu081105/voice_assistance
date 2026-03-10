import { config } from "../config.js";
import { medicalContextValidationService } from "./medicalContextValidationService.js";
import { medicalVocabularyService } from "./medicalVocabularyService.js";
import { structuredMedicalDataService } from "./structuredMedicalDataService.js";
import { transcriptCleaningService } from "./transcriptCleaningService.js";

function normalizeText(value, fallback = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || fallback;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0, Math.min(1, numeric));
}

function buildTranscriptText(entries = []) {
  return normalizeText(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => transcriptCleaningService.formatTranscriptEntry(entry))
      .filter(Boolean)
      .join("\n")
  );
}

function splitTextToEntries(transcriptText = "") {
  const cleaned = transcriptCleaningService.cleanTranscript(transcriptText);
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const match = line.match(/^(doctor|patient|unknown)\s*:\s*(.+)$/i);
    return {
      speaker: match?.[1]
        ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
        : "Unknown",
      text: match?.[2] || line,
      start_time: "00:00:00",
      end_time: "00:00:00",
      sequence: index,
    };
  });
}

function buildValidationIssues({ lowConfidence, confidenceScore, corrections, contextValidation }) {
  const issues = [];

  if (lowConfidence) {
    issues.push({
      type: "confidence",
      severity: "warning",
      message: `Transcript confidence ${confidenceScore.toFixed(2)} is below the threshold of ${config.transcriptConfidenceThreshold.toFixed(2)}.`,
    });
  }

  for (const correction of Array.isArray(corrections) ? corrections : []) {
    issues.push({
      type: "medical_vocabulary",
      severity: "info",
      message: `${correction.original} -> ${correction.corrected}`,
      reason: correction.reason,
    });
  }

  for (const issue of Array.isArray(contextValidation?.issues) ? contextValidation.issues : []) {
    issues.push({
      type: "context_validation",
      severity: contextValidation?.reviewRequired ? "warning" : "info",
      message: issue,
    });
  }

  return issues;
}

function buildValidationStatus({ lowConfidence, reviewRequired }) {
  if (lowConfidence) return "low_confidence";
  if (reviewRequired) return "needs_review";
  return "validated";
}

export const transcriptValidationService = {
  async validateTranscriptEntries({ transcriptEntries = [], confidenceScore = 1 } = {}) {
    const rawEntries = transcriptCleaningService.cleanTranscriptEntries(transcriptEntries);
    const rawTranscriptText = buildTranscriptText(rawEntries);

    const correctionResult = medicalVocabularyService.correctEntries(rawEntries);
    const correctedEntries = transcriptCleaningService.cleanTranscriptEntries(correctionResult.entries);
    const correctedTranscriptText = buildTranscriptText(correctedEntries);
    const structuredData = await structuredMedicalDataService.extractFromTranscriptEntries(correctedEntries);
    const contextValidation = await medicalContextValidationService.validateTranscript({
      transcript: correctedTranscriptText,
      structuredData,
    });

    const normalizedConfidence = clampConfidence(confidenceScore);
    const lowConfidence = normalizedConfidence < config.transcriptConfidenceThreshold;
    const reviewRequired = lowConfidence || Boolean(contextValidation.reviewRequired);
    const validationIssues = buildValidationIssues({
      lowConfidence,
      confidenceScore: normalizedConfidence,
      corrections: correctionResult.corrections,
      contextValidation,
    });

    return {
      rawTranscriptText,
      correctedTranscriptText: correctedTranscriptText || rawTranscriptText,
      rawTranscriptEntries: rawEntries,
      correctedTranscriptEntries: correctedEntries.length > 0 ? correctedEntries : rawEntries,
      confidenceScore: normalizedConfidence,
      lowConfidence,
      reviewRequired,
      validationStatus: buildValidationStatus({ lowConfidence, reviewRequired }),
      corrections: correctionResult.corrections,
      validationIssues,
      contextValidation,
      structuredData,
    };
  },

  async validateTranscriptText({ transcriptText = "", confidenceScore = 1 } = {}) {
    const entries = splitTextToEntries(transcriptText);
    const validated = await this.validateTranscriptEntries({
      transcriptEntries: entries,
      confidenceScore,
    });

    return {
      ...validated,
      inputTranscriptText: normalizeText(transcriptText),
    };
  },
};
