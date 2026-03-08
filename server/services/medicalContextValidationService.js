import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { extractJsonBlock } from "./geminiReportService.js";

const CONTEXT_SYSTEM_INSTRUCTION = `
You validate medical consultation transcripts for plausibility.
Return JSON only with these keys:
- review_required
- issues
- suggestions
- summary

Rules:
- Do not rewrite the entire transcript.
- Flag likely recognition mistakes or medically implausible durations.
- Keep issues and suggestions concise.
- If the transcript looks acceptable, return review_required false and empty arrays.
`.trim();
const IS_TEST_ENVIRONMENT = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildHeuristicIssues(transcript) {
  const issues = [];
  const normalized = normalizeText(transcript).toLowerCase();

  const acuteDurationPatterns = [
    /\b(fever|cough|cold|vomiting|diarrhea|body ache|sore throat|headache)\b.{0,40}\bfor\s+\w+\s+years\b/i,
    /\bfor\s+\w+\s+years\b.{0,40}\b(fever|cough|cold|vomiting|diarrhea|body ache|sore throat|headache)\b/i,
  ];

  if (acuteDurationPatterns.some((pattern) => pattern.test(normalized))) {
    issues.push("Possible duration mismatch detected for an acute symptom.");
  }

  if (/\b(temperature|temp)\s*(?:is|of|:)?\s*(10[6-9]|[1-9]\d{2,})\b/i.test(normalized)) {
    issues.push("Temperature reading may be implausible and should be reviewed.");
  }

  if (/\b(spo2|oxygen saturation|saturation)\s*(?:is|of|:)?\s*(10[1-9]|[1-9]\d{2,})\s*%/i.test(normalized)) {
    issues.push("Oxygen saturation appears outside the expected range.");
  }

  return issues;
}

function normalizeValidationPayload(payload = {}) {
  const issues = Array.isArray(payload.issues)
    ? payload.issues.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const reviewRequired = Boolean(payload.review_required || issues.length > 0);

  return {
    status: reviewRequired ? "needs_review" : "validated",
    reviewRequired,
    issues,
    suggestions,
    summary: normalizeText(payload.summary),
  };
}

function buildPrompt({ transcript, structuredData, heuristicIssues }) {
  return `
Transcript:
${normalizeText(transcript)}

Structured medical data:
${JSON.stringify(structuredData || {}, null, 2)}

Existing heuristic issues:
${JSON.stringify(heuristicIssues || [], null, 2)}
  `.trim();
}

async function requestGeminiContextValidation({ transcript, structuredData, heuristicIssues }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geminiTimeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        config.geminiModel
      )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: CONTEXT_SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt({
                    transcript,
                    structuredData,
                    heuristicIssues,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        response.statusText ||
        "Gemini context validation failed.";
      const error = new Error(String(message));
      error.statusCode = response.status;
      error.code = payload?.error?.status || "GEMINI_CONTEXT_VALIDATION_FAILED";
      error.retriable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }

    const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    return normalizeValidationPayload(extractJsonBlock(text));
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Gemini context validation timed out.");
      timeoutError.statusCode = 504;
      timeoutError.code = "GEMINI_CONTEXT_VALIDATION_TIMEOUT";
      timeoutError.retriable = true;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const medicalContextValidationService = {
  async validateTranscript({ transcript, structuredData = {} } = {}) {
    const normalizedTranscript = normalizeText(transcript);
    const heuristicIssues = buildHeuristicIssues(normalizedTranscript);
    const heuristicResult = normalizeValidationPayload({
      review_required: heuristicIssues.length > 0,
      issues: heuristicIssues,
      suggestions:
        heuristicIssues.length > 0
          ? ["Review durations, numeric values, and medical terms before finalizing the report."]
          : [],
      summary:
        heuristicIssues.length > 0
          ? "Potential context inconsistencies were detected and should be reviewed."
          : "Transcript context appears medically plausible.",
    });

    if (
      !normalizedTranscript ||
      IS_TEST_ENVIRONMENT ||
      !config.enableGeminiContextValidation ||
      !config.geminiApiKey
    ) {
      return heuristicResult;
    }

    const maxAttempts = (Array.isArray(config.geminiRetryDelaysMs) ? config.geminiRetryDelaysMs.length : 0) + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const geminiResult = await requestGeminiContextValidation({
          transcript: normalizedTranscript,
          structuredData,
          heuristicIssues,
        });

        return normalizeValidationPayload({
          review_required: heuristicResult.reviewRequired || geminiResult.reviewRequired,
          issues: [...heuristicResult.issues, ...geminiResult.issues],
          suggestions: [...heuristicResult.suggestions, ...geminiResult.suggestions],
          summary: geminiResult.summary || heuristicResult.summary,
        });
      } catch (error) {
        logger.warn("gemini.context_validation_failed", {
          attempt,
          max_attempts: maxAttempts,
          error_code: error?.code || "GEMINI_CONTEXT_VALIDATION_FAILED",
          error_name: error?.name || "Error",
          retriable: Boolean(error?.retriable),
        });

        if (!error?.retriable || attempt >= maxAttempts) {
          break;
        }

        const delayMs =
          config.geminiRetryDelaysMs[attempt - 1] ??
          config.geminiRetryDelaysMs[config.geminiRetryDelaysMs.length - 1] ??
          1000;
        await sleep(delayMs);
      }
    }

    return {
      ...heuristicResult,
      status: heuristicResult.reviewRequired ? "needs_review" : "validation_unavailable",
    };
  },
};
