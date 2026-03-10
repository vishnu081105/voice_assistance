const SPEAKER_LABEL_PATTERN =
  /\b(doctor|patient|unknown|speaker\s*\d+|nurse|dr\.?|physician|clinician|attender)\s*:\s*/gi;
const FALSE_SILENCE_TOKEN_PATTERN =
  /(?:<\|[^>]*(?:nospeech|silence|noise)[^>]*\|>|\[(?:silence|noise|music|inaudible|unintelligible)\]|\((?:silence|noise|music|inaudible|unintelligible)\))/gi;

function normalizeForComparison(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeFalseSilenceTokens(text) {
  return String(text || "").replace(FALSE_SILENCE_TOKEN_PATTERN, " ");
}

function normalizePunctuation(text) {
  return String(text || "")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,.;!?]){2,}/g, "$1")
    .replace(/([,.;!?])(?=[^\s,.;!?])/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeRepeatedWords(text) {
  const tokens = String(text || "").split(/\s+/).filter(Boolean);
  const deduped = [];
  let previousNormalized = "";

  for (const token of tokens) {
    const normalized = token.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase();
    if (
      normalized &&
      normalized === previousNormalized &&
      normalized.length > 2
    ) {
      continue;
    }

    deduped.push(token);
    previousNormalized = normalized;
  }

  return deduped.join(" ");
}

function dedupeRepeatedPhrases(text) {
  let words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length < 4) return String(text || "");

  let changed = true;
  while (changed) {
    changed = false;
    const maxWindow = Math.min(8, Math.floor(words.length / 2));
    for (let windowSize = maxWindow; windowSize >= 2; windowSize -= 1) {
      const rebuilt = [];
      let index = 0;

      while (index < words.length) {
        const left = words.slice(index, index + windowSize);
        const right = words.slice(index + windowSize, index + windowSize * 2);
        const leftNormalized = left.map((word) => word.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase());
        const rightNormalized = right.map((word) => word.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase());

        if (
          left.length === windowSize &&
          right.length === windowSize &&
          leftNormalized.join(" ") &&
          leftNormalized.join(" ") === rightNormalized.join(" ")
        ) {
          rebuilt.push(...left);
          index += windowSize * 2;
          changed = true;
          continue;
        }

        rebuilt.push(words[index]);
        index += 1;
      }

      if (changed) {
        words = rebuilt;
        break;
      }
    }
  }

  return words.join(" ");
}

function cleanLine(line) {
  const stripped = removeFalseSilenceTokens(String(line || ""))
    .replace(/^\s*(doctor|patient|unknown|speaker\s*\d+|nurse|dr\.?|physician|clinician|attender)\s*:\s*/i, "")
    .replace(SPEAKER_LABEL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalizePunctuation(
    dedupeRepeatedWords(
      dedupeRepeatedPhrases(stripped)
    )
  );
}

function cleanTranscript(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  const cleanedLines = normalized
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const dedupedLines = [];
  for (const line of cleanedLines) {
    if (normalizeForComparison(line) && normalizeForComparison(line) === normalizeForComparison(dedupedLines[dedupedLines.length - 1] || "")) {
      continue;
    }
    dedupedLines.push(line);
  }

  return dedupedLines.join("\n").trim();
}

function dedupeEntries(entries) {
  const deduped = [];

  for (const entry of entries) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      normalizeForComparison(previous.text) &&
      normalizeForComparison(previous.text) === normalizeForComparison(entry.text)
    ) {
      previous.end_time = entry.end_time || previous.end_time;
      continue;
    }
    deduped.push(entry);
  }

  return deduped;
}

function normalizeSpeaker(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "doctor") return "Doctor";
  if (normalized === "patient") return "Patient";
  return "Unknown";
}

function formatTranscriptEntry(entry) {
  const speaker = normalizeSpeaker(entry?.speaker);
  const text = cleanLine(entry?.text);
  if (!text) return "";
  if (speaker === "Doctor" || speaker === "Patient") {
    return `${speaker.toUpperCase()}: ${text}`;
  }
  return text;
}

function cleanTranscriptEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return dedupeEntries(
    entries
      .map((entry) => {
        const cleanedText = cleanLine(entry?.text);
        return {
          speaker: normalizeSpeaker(entry?.speaker),
          text: cleanedText,
          start_time: entry?.start_time || "00:00:00",
          end_time: entry?.end_time || "00:00:00",
        };
      })
      .filter((entry) => Boolean(entry.text))
  );
}

export const transcriptCleaningService = {
  cleanTranscript,
  cleanTranscriptEntries,
  formatTranscriptEntry,
  normalizeForComparison,
};
