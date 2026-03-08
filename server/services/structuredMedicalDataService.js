import { medicalAnalysisService } from "./medicalAnalysisService.js";

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function transcriptToText(transcriptEntries = []) {
  return (Array.isArray(transcriptEntries) ? transcriptEntries : [])
    .map((entry) => {
      const speaker = String(entry?.speaker || "Unknown").trim();
      const text = normalizeText(entry?.text);
      if (!text) return "";
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function extractDurations(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const pattern =
    /\b(?:for|since)\s+((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hour|hours|day|days|week|weeks|month|months|year|years))\b/gi;
  const durations = [];
  let match = pattern.exec(normalized);
  while (match) {
    durations.push(match[1].trim());
    match = pattern.exec(normalized);
  }

  return uniq(durations);
}

function extractVitals(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const vitals = [];
  const patterns = [
    {
      name: "blood_pressure",
      regex: /\b(?:blood pressure|bp)\s*(?:is|of|:)?\s*(\d{2,3}\s*\/\s*\d{2,3})\b/gi,
      unit: "mmHg",
    },
    {
      name: "temperature",
      regex: /\b(?:temperature|temp)\s*(?:is|of|:)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:°?\s*(f|c))?\b/gi,
      unitFromMatch: 2,
    },
    {
      name: "pulse",
      regex: /\b(?:pulse|heart rate)\s*(?:is|of|:)?\s*(\d{2,3})\s*(?:bpm)?\b/gi,
      unit: "bpm",
    },
    {
      name: "spo2",
      regex: /\b(?:spo2|oxygen saturation|saturation)\s*(?:is|of|:)?\s*(\d{2,3})\s*%/gi,
      unit: "%",
    },
  ];

  for (const pattern of patterns) {
    let match = pattern.regex.exec(normalized);
    while (match) {
      vitals.push({
        name: pattern.name,
        value: String(match[1] || "").trim(),
        unit: pattern.unit || String(match[pattern.unitFromMatch] || "").trim().toUpperCase() || "",
      });
      match = pattern.regex.exec(normalized);
    }
  }

  return vitals.filter((vital) => vital.value);
}

function normalizeMedication(item) {
  if (!item || typeof item !== "object") return null;
  const name = normalizeText(item.name);
  if (!name) return null;
  return {
    name,
    dosage: normalizeText(item.dosage),
    frequency: normalizeText(item.frequency),
  };
}

function dedupeMedications(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}|${item.dosage}|${item.frequency}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const structuredMedicalDataService = {
  async extractFromTranscriptEntries(transcriptEntries = []) {
    const normalizedEntries = Array.isArray(transcriptEntries) ? transcriptEntries : [];
    const analysis = await medicalAnalysisService.analyzeConversation(normalizedEntries);
    const transcriptText = transcriptToText(normalizedEntries);

    return {
      symptoms: uniq(analysis?.symptoms || []),
      diseases: uniq(analysis?.diagnosis || []),
      medications: dedupeMedications(
        (Array.isArray(analysis?.medications) ? analysis.medications : [])
          .map((item) => normalizeMedication(item))
          .filter(Boolean)
      ),
      durations: extractDurations(transcriptText),
      vitals: extractVitals(transcriptText),
    };
  },

  async extractFromText(transcriptText = "") {
    const lines = normalizeText(transcriptText)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(doctor|patient|unknown)\s*:\s*(.+)$/i);
        return {
          speaker: match?.[1] ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "Unknown",
          text: match?.[2] || line,
          start_time: "00:00:00",
          end_time: "00:00:00",
        };
      });

    return this.extractFromTranscriptEntries(lines);
  },
};
