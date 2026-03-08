import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { buildStructuredReport } from "./medicalReportGenerator.js";

const DEFAULT_RETRY_DELAYS = Array.isArray(config.geminiRetryDelaysMs) && config.geminiRetryDelaysMs.length > 0
  ? config.geminiRetryDelaysMs
  : [1000, 3000];
const IS_TEST_ENVIRONMENT = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";

const GEMINI_SYSTEM_INSTRUCTION = `
You are a clinical documentation assistant for a hospital voice recording system.
Produce a concise, structured medical report from the consultation transcript.
Return JSON only with these keys:
- patient_information
- chief_complaint
- history_of_present_illness
- symptoms
- medical_assessment
- diagnosis
- treatment_plan
- medications
- follow_up_instructions
- summary
- recommendations

Rules:
- Never include markdown fences.
- Keep the same section meaning as a hospital medical report.
- Use arrays for symptoms, follow_up_instructions, and recommendations.
- Use an array of objects for medications with keys: name, dosage, frequency.
- If information is missing, use an empty string or empty array.
`.trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toError(message, { statusCode = 502, code = "GEMINI_REQUEST_FAILED", retriable = false } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.retriable = retriable;
  return error;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeList(value) {
  const items = Array.isArray(value) ? value : [];
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeMedications(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return {
          name: normalizeText(item),
          dosage: "",
          frequency: "",
        };
      }

      return {
        name: normalizeText(item?.name),
        dosage: normalizeText(item?.dosage),
        frequency: normalizeText(item?.frequency),
      };
    })
    .filter((item) => item.name);
}

function extractCandidateText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0];
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw toError("Gemini returned an empty response.", {
      statusCode: 502,
      code: "GEMINI_EMPTY_RESPONSE",
      retriable: true,
    });
  }

  return text;
}

export function extractJsonBlock(rawText) {
  const text = normalizeText(rawText);
  if (!text) {
    throw toError("Gemini returned an empty response.", {
      statusCode: 502,
      code: "GEMINI_EMPTY_RESPONSE",
      retriable: true,
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeFenceMatch?.[1]) {
      return JSON.parse(codeFenceMatch[1].trim());
    }

    const startIndex = text.indexOf("{");
    const endIndex = text.lastIndexOf("}");
    if (startIndex >= 0 && endIndex > startIndex) {
      return JSON.parse(text.slice(startIndex, endIndex + 1));
    }

    throw toError("Gemini response was not valid JSON.", {
      statusCode: 502,
      code: "GEMINI_INVALID_RESPONSE",
      retriable: true,
    });
  }
}

export function normalizeGeminiReportObject(value) {
  const payload = value && typeof value === "object" ? value : {};
  const patientInformation =
    payload.patient_information && typeof payload.patient_information === "object"
      ? payload.patient_information
      : {};

  return {
    patient_information: patientInformation,
    chief_complaint: normalizeText(payload.chief_complaint),
    history_of_present_illness: normalizeText(payload.history_of_present_illness),
    symptoms: normalizeList(payload.symptoms),
    medical_assessment: normalizeText(payload.medical_assessment),
    diagnosis: normalizeText(payload.diagnosis),
    treatment_plan: normalizeText(payload.treatment_plan),
    medications: normalizeMedications(payload.medications),
    follow_up_instructions: normalizeList(payload.follow_up_instructions),
    summary: normalizeText(payload.summary),
    recommendations: normalizeList(payload.recommendations),
  };
}

function buildPrompt({
  transcription,
  transcriptEntries = [],
  analysis = {},
  structuredData = {},
  validationSummary = {},
  patientDetails = {},
  doctorDetails = {},
  reportType = "general",
} = {}) {
  const transcriptPreview = Array.isArray(transcriptEntries)
    ? transcriptEntries
        .map((entry) => {
          const speaker = normalizeText(entry?.speaker, "Unknown");
          const text = normalizeText(entry?.text);
          if (!text) return "";
          return `${speaker}: ${text}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return `
Report type: ${normalizeText(reportType, "general")}

Patient details:
${JSON.stringify(patientDetails || {}, null, 2)}

Doctor details:
${JSON.stringify(doctorDetails || {}, null, 2)}

Detected clinical analysis:
${JSON.stringify(analysis || {}, null, 2)}

Structured medical data:
${JSON.stringify(structuredData || {}, null, 2)}

Transcript validation summary:
${JSON.stringify(validationSummary || {}, null, 2)}

Transcript:
${normalizeText(transcription) || transcriptPreview}

Speaker transcript entries:
${transcriptPreview}
  `.trim();
}

function shouldRetry(error) {
  if (error?.name === "AbortError") return true;
  if (error?.retriable) return true;

  const statusCode = Number(error?.statusCode || 0);
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

async function requestGeminiReport({
  transcription,
  transcriptEntries,
  analysis,
  structuredData,
  validationSummary,
  patientDetails,
  doctorDetails,
  reportType,
} = {}) {
  if (!config.geminiApiKey) {
    throw toError("Gemini API key is not configured.", {
      statusCode: 503,
      code: "GEMINI_NOT_CONFIGURED",
      retriable: false,
    });
  }

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
            parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt({
                    transcription,
                    transcriptEntries,
                    analysis,
                    structuredData,
                    validationSummary,
                    patientDetails,
                    doctorDetails,
                    reportType,
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
        "Gemini report generation failed.";

      throw toError(String(message), {
        statusCode: response.status,
        code: payload?.error?.status || "GEMINI_REQUEST_FAILED",
        retriable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }

    return normalizeGeminiReportObject(extractJsonBlock(extractCandidateText(payload)));
  } catch (error) {
    if (error?.name === "AbortError") {
      throw toError("Gemini report generation timed out.", {
        statusCode: 504,
        code: "GEMINI_TIMEOUT",
        retriable: true,
      });
    }

    if (error instanceof Error && error.code) {
      throw error;
    }

    throw toError(error instanceof Error ? error.message : "Gemini report generation failed.", {
      statusCode: 503,
      code: "GEMINI_REQUEST_FAILED",
      retriable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const geminiReportService = {
  async generateStructuredReport({
    transcription,
    transcriptEntries = [],
    analysis = {},
    structuredData = {},
    validationSummary = {},
    patientDetails = {},
    doctorDetails = {},
    reportType = "general",
  } = {}) {
    const fallbackReport = buildStructuredReport({
      transcriptEntries,
      analysis,
      structuredData,
      patientDetails,
      doctorDetails,
      reportType,
    });

    if (!config.geminiApiKey || IS_TEST_ENVIRONMENT) {
      return fallbackReport;
    }

    const maxAttempts = DEFAULT_RETRY_DELAYS.length + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const geminiReport = await requestGeminiReport({
          transcription,
          transcriptEntries,
          analysis,
          structuredData,
          validationSummary,
          patientDetails,
          doctorDetails,
          reportType,
        });

        return buildStructuredReport({
          transcriptEntries,
          analysis,
          structuredData,
          patientDetails,
          doctorDetails,
          reportType,
          overrides: geminiReport,
        });
      } catch (error) {
        logger.warn("gemini.report_generation_failed", {
          attempt,
          max_attempts: maxAttempts,
          report_type: reportType,
          error_code: error?.code || "GEMINI_REQUEST_FAILED",
          error_name: error?.name || "Error",
          retriable: shouldRetry(error),
        });

        if (!shouldRetry(error) || attempt >= maxAttempts) {
          break;
        }

        const delayMs = DEFAULT_RETRY_DELAYS[attempt - 1] ?? DEFAULT_RETRY_DELAYS[DEFAULT_RETRY_DELAYS.length - 1];
        await sleep(delayMs);
      }
    }

    return fallbackReport;
  },
};
