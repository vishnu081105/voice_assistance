const MEDICAL_TERM_CORRECTIONS = [
  {
    pattern: /\bbronchities\b/gi,
    replacement: "bronchitis",
    reason: "Corrected common respiratory diagnosis misspelling.",
  },
  {
    pattern: /\bparacetmol\b/gi,
    replacement: "paracetamol",
    reason: "Corrected common medication misspelling.",
  },
  {
    pattern: /\bparacitamol\b/gi,
    replacement: "paracetamol",
    reason: "Corrected common medication misspelling.",
  },
  {
    pattern: /\bammoxicillin\b/gi,
    replacement: "amoxicillin",
    reason: "Corrected antibiotic spelling.",
  },
  {
    pattern: /\bamoxicilin\b/gi,
    replacement: "amoxicillin",
    reason: "Corrected antibiotic spelling.",
  },
  {
    pattern: /\bdiabities\b/gi,
    replacement: "diabetes",
    reason: "Corrected chronic disease spelling.",
  },
  {
    pattern: /\bdiabtes\b/gi,
    replacement: "diabetes",
    reason: "Corrected chronic disease spelling.",
  },
  {
    pattern: /\bhipertension\b/gi,
    replacement: "hypertension",
    reason: "Corrected cardiovascular diagnosis spelling.",
  },
  {
    pattern: /\bhyertension\b/gi,
    replacement: "hypertension",
    reason: "Corrected cardiovascular diagnosis spelling.",
  },
  {
    pattern: /\bazithromicin\b/gi,
    replacement: "azithromycin",
    reason: "Corrected medication spelling.",
  },
  {
    pattern: /\bwheesing\b/gi,
    replacement: "wheezing",
    reason: "Corrected symptom spelling.",
  },
  {
    pattern: /\bphlem\b/gi,
    replacement: "phlegm",
    reason: "Corrected symptom spelling.",
  },
  {
    pattern: /\bbp\b/gi,
    replacement: "blood pressure",
    reason: "Expanded common medical abbreviation.",
  },
  {
    pattern: /\bsugar levels?\b/gi,
    replacement: "blood glucose levels",
    reason: "Normalized common glucose terminology.",
  },
  {
    pattern: /\bi have rash\b/gi,
    replacement: "I have a rash",
    reason: "Normalized common clinical phrasing.",
  },
  {
    pattern: /\bitches very bad\b/gi,
    replacement: "itches very badly",
    reason: "Normalized symptom phrasing.",
  },
  {
    pattern: /\bvery bad\b/gi,
    replacement: "very badly",
    reason: "Normalized symptom phrasing.",
  },
];

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function preserveCase(source, replacement) {
  const original = String(source || "");
  if (!original) return replacement;
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyCorrectionSet(text) {
  let nextText = normalizeWhitespace(text);
  const corrections = [];

  for (const rule of MEDICAL_TERM_CORRECTIONS) {
    nextText = nextText.replace(rule.pattern, (match) => {
      const corrected = preserveCase(match, rule.replacement);
      if (match !== corrected) {
        corrections.push({
          original: match,
          corrected,
          reason: rule.reason,
        });
      }
      return corrected;
    });
  }

  return {
    text: normalizeWhitespace(nextText),
    corrections,
  };
}

function dedupeCorrections(corrections = []) {
  const seen = new Set();
  return corrections.filter((correction) => {
    const key = `${correction.original}|${correction.corrected}|${correction.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const medicalVocabularyService = {
  correctText(text) {
    const result = applyCorrectionSet(text);
    return {
      text: result.text,
      corrections: dedupeCorrections(result.corrections),
    };
  },

  correctEntries(entries = []) {
    if (!Array.isArray(entries)) {
      return {
        entries: [],
        corrections: [],
      };
    }

    const corrections = [];
    const nextEntries = entries.map((entry) => {
      const result = applyCorrectionSet(entry?.text);
      corrections.push(...result.corrections);
      return {
        ...entry,
        text: result.text,
      };
    });

    return {
      entries: nextEntries,
      corrections: dedupeCorrections(corrections),
    };
  },
};
