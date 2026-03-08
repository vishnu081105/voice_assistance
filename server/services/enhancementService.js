import { transcriptCleaningService } from "./transcriptCleaningService.js";
import { medicalVocabularyService } from "./medicalVocabularyService.js";

function normalizeLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePunctuation(text) {
  const trimmed = normalizeLine(text);
  if (!trimmed) return "";
  const withCapitalizedFirst = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (/[.!?]$/.test(withCapitalizedFirst)) {
    return withCapitalizedFirst;
  }
  return `${withCapitalizedFirst}.`;
}

function splitTranscriptLines(transcription) {
  const normalized = String(transcription || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean);
  }
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

export const enhancementService = {
  enhanceTranscript({ transcription, enableDiarization = true, enhanceTerminology = true }) {
    const baseText = transcriptCleaningService.cleanTranscript(transcription);
    if (!baseText) {
      const error = new Error("Missing or invalid transcription field");
      error.statusCode = 400;
      error.code = "INVALID_TRANSCRIPTION";
      throw error;
    }

    const lines = splitTranscriptLines(baseText);
    const enhanced = lines
      .map((line) => {
        let processedText = line;

        if (enhanceTerminology) {
          processedText = medicalVocabularyService.correctText(processedText).text;
        }
        processedText = normalizePunctuation(processedText);

        if (!processedText) return "";
        return processedText;
      })
      .filter(Boolean)
      .join("\n");

    return {
      processed: transcriptCleaningService.cleanTranscript(enhanced || normalizePunctuation(baseText)),
      speakers: [],
      hasDiarization: false,
      hasEnhancement: enhanceTerminology,
    };
  },
};
