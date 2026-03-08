const SPEAKER_LABEL_PATTERN =
  /\b(doctor|patient|speaker\s*\d+|nurse|dr\.?|physician|clinician|attender)\s*:\s*/gi;

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^\s*(doctor|patient|speaker\s*\d+|nurse|dr\.?|physician|clinician|attender)\s*:\s*/i, "")
    .replace(SPEAKER_LABEL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTranscript(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  const cleaned = normalized
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .join("\n")
    .trim();

  return cleaned;
}

function normalizeSpeaker(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "doctor") return "Doctor";
  if (normalized === "patient") return "Patient";
  return "Unknown";
}

function cleanTranscriptEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      const cleanedText = cleanLine(entry?.text);
      return {
        speaker: normalizeSpeaker(entry?.speaker),
        text: cleanedText,
        start_time: entry?.start_time || "00:00:00",
        end_time: entry?.end_time || "00:00:00",
      };
    })
    .filter((entry) => Boolean(entry.text));
}

export const transcriptCleaningService = {
  cleanTranscript,
  cleanTranscriptEntries,
};
