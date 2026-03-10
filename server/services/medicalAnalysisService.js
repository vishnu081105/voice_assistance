import { transcriptCleaningService } from "./transcriptCleaningService.js";

const symptomLexicon = [
  "fever",
  "cough",
  "headache",
  "chest pain",
  "shortness of breath",
  "fatigue",
  "sore throat",
  "vomiting",
  "nausea",
  "dizziness",
  "abdominal pain",
  "back pain",
  "joint pain",
  "body ache",
  "palpitations",
];

const diagnosisLexicon = [
  "hypertension",
  "diabetes",
  "viral infection",
  "asthma",
  "bronchitis",
  "migraine",
  "gastritis",
  "anxiety",
  "pneumonia",
];

const riskFlagTerms = [
  "severe chest pain",
  "loss of consciousness",
  "shortness of breath",
  "blood pressure very high",
  "uncontrolled bleeding",
  "stroke symptoms",
];

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findLexiconMatches(text, lexicon) {
  const normalized = String(text || "").toLowerCase();
  return uniq(
    lexicon.filter((entry) => {
      return normalized.includes(entry.toLowerCase());
    })
  );
}

function extractDiagnosisFromSentences(sentences) {
  const diagnosis = [];
  const patterns = [
    /diagnos(?:is|ed)\s*(?:as|with)?\s*([a-zA-Z0-9\s-]{3,80})/i,
    /impression\s*(?:is|:)\s*([a-zA-Z0-9\s-]{3,80})/i,
    /assessment\s*(?:is|:)\s*([a-zA-Z0-9\s-]{3,80})/i,
  ];

  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match?.[1]) {
        diagnosis.push(match[1].trim());
      }
    }
  }

  return uniq(diagnosis);
}

function extractMedications(sentences) {
  const medications = [];
  const medicationRegex =
    /\b(?:start|take|prescribe|prescribed|continue)\s+([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,4})(?:\s+(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|units?)))?(?:\s+(once daily|twice daily|thrice daily|daily|every\s+\d+\s*(?:hour|hours|day|days)|at night|before food|after food))?/gi;

  for (const sentence of sentences) {
    let match = medicationRegex.exec(sentence);
    while (match) {
      const name = (match[1] || "").trim();
      if (name && !/^with\b/i.test(name)) {
        medications.push({
          name,
          dosage: (match[2] || "").trim() || "not specified",
          frequency: (match[3] || "").trim() || "not specified",
        });
      }
      match = medicationRegex.exec(sentence);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of medications) {
    const key = `${entry.name}|${entry.dosage}|${entry.frequency}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function extractAdvice(sentences) {
  const advicePatterns = [
    /\b(avoid [^.!?]+)/i,
    /\b(maintain [^.!?]+)/i,
    /\b(rest[^.?!]*)/i,
    /\b(drink [^.?!]+)/i,
    /\b(please [^.?!]+)/i,
    /\b(you should [^.?!]+)/i,
  ];

  const advice = [];
  for (const sentence of sentences) {
    for (const pattern of advicePatterns) {
      const match = sentence.match(pattern);
      if (match?.[1]) {
        advice.push(match[1].trim());
      }
    }
  }
  return uniq(advice);
}

function extractFollowUp(sentences) {
  const followUp = [];
  const followUpPatterns = [
    /follow[-\s]?up\s*(?:in|after)?\s*([a-zA-Z0-9\s-]{2,40})/i,
    /review\s*(?:in|after)?\s*([a-zA-Z0-9\s-]{2,40})/i,
    /come back\s*(?:in|after)?\s*([a-zA-Z0-9\s-]{2,40})/i,
  ];

  for (const sentence of sentences) {
    for (const pattern of followUpPatterns) {
      const match = sentence.match(pattern);
      if (match?.[1]) {
        followUp.push(`Follow-up ${match[1].trim()}`);
      }
    }
  }

  return uniq(followUp);
}

function extractRiskFlags(text) {
  return findLexiconMatches(text, riskFlagTerms);
}

function conversationTextFromTranscript(transcriptEntries) {
  if (!Array.isArray(transcriptEntries)) return "";
  return transcriptEntries
    .map((entry) => transcriptCleaningService.formatTranscriptEntry(entry))
    .filter(Boolean)
    .join(" ");
}

export const medicalAnalysisService = {
  async analyzeConversation(transcriptEntries) {
    const conversationText = conversationTextFromTranscript(transcriptEntries);
    const sentences = splitSentences(conversationText);

    const symptoms = findLexiconMatches(conversationText, symptomLexicon);
    const diagnosis = uniq([
      ...findLexiconMatches(conversationText, diagnosisLexicon),
      ...extractDiagnosisFromSentences(sentences),
    ]);
    const medications = extractMedications(sentences);
    const advice = extractAdvice(sentences);
    const riskFlags = extractRiskFlags(conversationText);
    const followUp = extractFollowUp(sentences);

    return {
      symptoms,
      diagnosis,
      medications,
      advice,
      risk_flags: riskFlags,
      follow_up: followUp,
    };
  },
};
