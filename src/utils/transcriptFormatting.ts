type TranscriptEntryLike = {
  speaker?: string | null;
  text?: string | null;
};

const UNKNOWN_SPEAKER_PATTERN = /^\s*unknown\s*:\s*/i;

function normalizeLine(line: string) {
  return line.replace(UNKNOWN_SPEAKER_PATTERN, "").trimEnd();
}

export function stripUnknownSpeakerLabels(text: string) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";

  return normalized
    .split("\n")
    .map((line) => normalizeLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatTranscriptEntryText(entry: TranscriptEntryLike) {
  const text = stripUnknownSpeakerLabels(String(entry?.text || "")).trim();
  if (!text) return "";

  const speaker = String(entry?.speaker || "").trim().toLowerCase();
  if (speaker === "doctor" || speaker === "patient") {
    return `${speaker.toUpperCase()}: ${text}`;
  }

  return text;
}

export function formatTranscriptEntriesText(entries: TranscriptEntryLike[]) {
  return (Array.isArray(entries) ? entries : []).map(formatTranscriptEntryText).filter(Boolean).join("\n");
}
