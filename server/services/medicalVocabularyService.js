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
    pattern: /\bamoxcillin\b/gi,
    replacement: "amoxicillin",
    reason: "Corrected antibiotic spelling.",
  },
  {
    pattern: /\bomeprazol\b/gi,
    replacement: "omeprazole",
    reason: "Corrected medication spelling.",
  },
  {
    pattern: /\bmetphormin\b/gi,
    replacement: "metformin",
    reason: "Corrected diabetes medication spelling.",
  },
  {
    pattern: /\batorvastin\b/gi,
    replacement: "atorvastatin",
    reason: "Corrected medication spelling.",
  },
  {
    pattern: /\bdermatities\b/gi,
    replacement: "dermatitis",
    reason: "Corrected common dermatology diagnosis misspelling.",
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
    pattern: /\bforengitis\b/gi,
    replacement: "pharyngitis",
    reason: "Corrected common diagnosis misspelling.",
  },
  {
    pattern: /\btonsilities\b/gi,
    replacement: "tonsillitis",
    reason: "Corrected common diagnosis misspelling.",
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

function loadCustomCorrections() {
  const raw = String(process.env.MEDICAL_VOCAB_CUSTOM_CORRECTIONS || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const pattern = String(item.pattern || "").trim();
          const replacement = String(item.replacement || "").trim();
          if (!pattern || !replacement) return null;
          return {
            pattern: new RegExp(pattern, "gi"),
            replacement,
            reason: String(item.reason || "Applied custom medical vocabulary correction.").trim(),
          };
        })
        .filter(Boolean);
    }

    return Object.entries(parsed)
      .map(([source, replacement]) => {
        const nextReplacement = String(replacement || "").trim();
        if (!source || !nextReplacement) return null;
        return {
          pattern: new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
          replacement: nextReplacement,
          reason: "Applied custom medical vocabulary correction.",
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const VOCABULARY_RULES = [...MEDICAL_TERM_CORRECTIONS, ...loadCustomCorrections()];

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

  for (const rule of VOCABULARY_RULES) {
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

  getRuleCount() {
    return VOCABULARY_RULES.length;
  },
};
