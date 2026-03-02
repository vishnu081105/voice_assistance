import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { reportsRepository } from "../lib/repositories/reportsRepository.js";

const router = Router();

const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;
const GEMINI_TIMEOUT_MS = 60 * 1000;
const GEMINI_MAX_RETRIES = 3;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
});

const reportPrompts = {
  general: "General clinical report",
  soap: "SOAP report",
  diagnostic: "Diagnostic report",
};

function cleanOutput(text) {
  return String(text || "").replace(/\*+/g, "").replace(/#+/g, "").trim();
}

function createTimeoutController(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function isTransientStatus(statusCode) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(statusCode));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextContent(messageContent) {
  if (typeof messageContent === "string") return messageContent;
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  if (typeof messageContent?.text === "string") return messageContent.text;
  return "";
}

function extractJsonBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return null;
      }
    }

    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeStructuredReport(candidate) {
  const input = candidate && typeof candidate === "object" ? candidate : {};

  const summary = typeof input.summary === "string" ? cleanOutput(input.summary) : "";
  const symptoms = Array.isArray(input.symptoms)
    ? input.symptoms.map((item) => cleanOutput(item)).filter(Boolean)
    : [];
  const diagnosis = typeof input.diagnosis === "string" ? cleanOutput(input.diagnosis) : "";
  const treatmentPlan =
    typeof input.treatment_plan === "string" ? cleanOutput(input.treatment_plan) : "";
  const recommendations = Array.isArray(input.recommendations)
    ? input.recommendations.map((item) => cleanOutput(item)).filter(Boolean)
    : [];

  return {
    summary,
    symptoms,
    diagnosis,
    treatment_plan: treatmentPlan,
    recommendations,
  };
}

function hasStructuredReportContent(report) {
  return Boolean(
    report.summary ||
      report.diagnosis ||
      report.treatment_plan ||
      report.symptoms.length > 0 ||
      report.recommendations.length > 0
  );
}

function formatStructuredReport(report) {
  return [
    `Summary:\n${report.summary || "N/A"}`,
    `Symptoms:\n${report.symptoms.length ? report.symptoms.map((item) => `- ${item}`).join("\n") : "- N/A"}`,
    `Diagnosis:\n${report.diagnosis || "N/A"}`,
    `Treatment Plan:\n${report.treatment_plan || "N/A"}`,
    `Recommendations:\n${
      report.recommendations.length
        ? report.recommendations.map((item) => `- ${item}`).join("\n")
        : "- N/A"
    }`,
  ].join("\n\n");
}

function ensureAiConfigured() {
  if (!config.lovableApiKey && !config.openaiApiKey && !config.geminiApiKey) {
    const error = new Error("AI service configuration error");
    error.statusCode = 500;
    throw error;
  }
}

function ensureTranscriptionConfigured() {
  if (!config.openaiApiKey && !config.lovableApiKey) {
    const error = new Error("Transcription service is not configured");
    error.statusCode = 500;
    throw error;
  }
}

function ensureGatewayConfigured() {
  if (!config.lovableApiKey) {
    const error = new Error("AI gateway API key is not configured");
    error.statusCode = 500;
    throw error;
  }
}

async function callGatewayChatCompletion(payload, timeoutMs) {
  if (!config.lovableApiKey) {
    const error = new Error("AI gateway API key is not configured");
    error.statusCode = 500;
    throw error;
  }

  const controller = createTimeoutController(timeoutMs);
  try {
    const response = await fetch(config.aiGatewayUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response;
  } finally {
    controller.clear();
  }
}

async function transcribeWithOpenAiWhisper(file, language) {
  if (!config.openaiApiKey) return null;

  const formData = new FormData();
  const fileBlob = new Blob([file.buffer], { type: file.mimetype || "audio/webm" });
  formData.append("file", fileBlob, file.originalname || "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  if (language && language !== "auto") formData.append("language", language);

  const controller = createTimeoutController(TRANSCRIPTION_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    const textBody = await response.text().catch(() => "");
    let parsed = {};
    try {
      parsed = textBody ? JSON.parse(textBody) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      const error = new Error(
        `Whisper API error (${response.status}) ${parsed?.error?.message || textBody || response.statusText}`
      );
      error.statusCode = response.status;
      throw error;
    }

    const text = cleanOutput(parsed?.text || "");
    if (!text) {
      const error = new Error("Whisper returned empty transcription");
      error.statusCode = 502;
      throw error;
    }

    return {
      text,
      duration: Number(parsed?.duration || 0),
      segments: Array.isArray(parsed?.segments) ? parsed.segments : [],
    };
  } finally {
    controller.clear();
  }
}

async function transcribeWithGateway(file, language) {
  const format = (file.mimetype?.split("/")[1] || "webm").toLowerCase();
  const base64Audio = file.buffer.toString("base64");

  const response = await callGatewayChatCompletion(
    {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a highly accurate medical transcription assistant. Return only plain transcription text.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format,
              },
            },
            {
              type: "text",
              text: `Transcribe this medical dictation accurately. Language hint: ${language || "auto"}.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4096,
    },
    TRANSCRIPTION_TIMEOUT_MS
  );

  const textBody = await response.text().catch(() => "");
  let parsed = {};
  try {
    parsed = textBody ? JSON.parse(textBody) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const error = new Error(
      `Transcription API error (${response.status}) ${parsed?.error?.message || textBody || response.statusText}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const transcriptText = cleanOutput(extractTextContent(parsed?.choices?.[0]?.message?.content));
  if (!transcriptText) {
    const error = new Error("Transcription service returned empty text");
    error.statusCode = 502;
    throw error;
  }

  return {
    text: transcriptText,
    duration: Math.round(file.size / 2000),
    segments: [],
  };
}

async function processTranscriptionWithGemini({ transcription, enableDiarization, enhanceTerminology }) {
  const systemPrompt =
    enableDiarization && enhanceTerminology
      ? "Label speakers as DOCTOR: and PATIENT:, and correct medical terminology while preserving meaning."
      : enableDiarization
        ? "Label speakers as DOCTOR: and PATIENT: only."
        : "Correct medical terminology and grammar only.";

  const response = await callGatewayChatCompletion(
    {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Process this medical transcription:\n\n${transcription}` },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    },
    GEMINI_TIMEOUT_MS
  );

  const textBody = await response.text().catch(() => "");
  let parsed = {};
  try {
    parsed = textBody ? JSON.parse(textBody) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const error = new Error(`AI service error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const processed = cleanOutput(extractTextContent(parsed?.choices?.[0]?.message?.content));
  if (!processed) {
    const error = new Error("AI service returned empty content");
    error.statusCode = 502;
    throw error;
  }

  return processed;
}

async function generateReportWithNativeGemini(prompt) {
  if (!config.geminiApiKey) return null;

  const url = `${config.geminiApiUrl}?key=${encodeURIComponent(config.geminiApiKey)}`;
  const controller = createTimeoutController(GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
        },
      }),
      signal: controller.signal,
    });

    const textBody = await response.text().catch(() => "");
    let parsed = {};
    try {
      parsed = textBody ? JSON.parse(textBody) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      const error = new Error(
        `Gemini API error (${response.status}) ${parsed?.error?.message || textBody || response.statusText}`
      );
      error.statusCode = response.status;
      throw error;
    }

    const rawContent = extractTextContent(parsed?.candidates?.[0]?.content?.parts);
    const json = extractJsonBlock(rawContent);
    if (!json) {
      const error = new Error("Gemini returned invalid JSON response");
      error.statusCode = 502;
      throw error;
    }
    return normalizeStructuredReport(json);
  } finally {
    controller.clear();
  }
}

async function generateReportWithGateway(prompt) {
  const response = await callGatewayChatCompletion(
    {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an expert medical report assistant. Return ONLY strict JSON matching the requested schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    },
    GEMINI_TIMEOUT_MS
  );

  const textBody = await response.text().catch(() => "");
  let parsed = {};
  try {
    parsed = textBody ? JSON.parse(textBody) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const error = new Error(`AI service error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const content = extractTextContent(parsed?.choices?.[0]?.message?.content);
  const json = extractJsonBlock(content);
  if (!json) {
    const error = new Error("AI service returned invalid JSON");
    error.statusCode = 502;
    throw error;
  }
  return normalizeStructuredReport(json);
}

async function generateStructuredReportWithRetry(prompt) {
  let lastError = null;
  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
    try {
      const report =
        (await generateReportWithNativeGemini(prompt)) ?? (await generateReportWithGateway(prompt));
      if (hasStructuredReportContent(report)) {
        return report;
      }
      throw new Error("Generated report is empty");
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || 0);
      if (attempt >= GEMINI_MAX_RETRIES - 1 || !isTransientStatus(statusCode)) {
        throw error;
      }
      await sleep(400 * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error("Failed to generate report");
}

router.post(
  "/whisper-transcribe",
  requireAuth,
  upload.single("audio"),
  asyncHandler(async (req, res) => {
    ensureTranscriptionConfigured();

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }
    if (!req.file.mimetype?.startsWith("audio/")) {
      return res.status(400).json({ error: "Only audio files are allowed" });
    }
    if (req.file.size > MAX_AUDIO_SIZE_BYTES) {
      return res.status(413).json({ error: "Audio file too large. Max size is 100MB." });
    }

    const language = typeof req.body?.language === "string" ? req.body.language : "auto";

    let result = null;
    try {
      result = await transcribeWithOpenAiWhisper(req.file, language);
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 500 || !error?.statusCode) {
        result = null;
      } else {
        throw error;
      }
    }

    if (!result) {
      result = await transcribeWithGateway(req.file, language);
    }

    return res.json({
      text: result.text,
      duration: Number(result.duration || 0),
      language,
      segments: Array.isArray(result.segments) ? result.segments : [],
    });
  })
);

router.post(
  "/process-transcription",
  requireAuth,
  asyncHandler(async (req, res) => {
    ensureGatewayConfigured();

    const transcription = typeof req.body?.transcription === "string" ? req.body.transcription : "";
    const enableDiarization = req.body?.enableDiarization !== false;
    const enhanceTerminology = req.body?.enhanceTerminology !== false;

    if (!transcription.trim()) {
      return res.status(400).json({ error: "Missing or invalid transcription field" });
    }

    const processedText = await processTranscriptionWithGemini({
      transcription,
      enableDiarization,
      enhanceTerminology,
    });

    const speakers = [];
    processedText.split("\n").forEach((line) => {
      if (line.startsWith("DOCTOR:") && !speakers.includes("Doctor")) speakers.push("Doctor");
      if (line.startsWith("PATIENT:") && !speakers.includes("Patient")) speakers.push("Patient");
    });

    return res.json({
      processed: processedText,
      original: transcription,
      speakers,
      hasDiarization: enableDiarization,
      hasEnhancement: enhanceTerminology,
    });
  })
);

router.post(
  "/generate-report",
  requireAuth,
  asyncHandler(async (req, res) => {
    ensureAiConfigured();

    const transcription = typeof req.body?.transcription === "string" ? req.body.transcription : "";
    const reportType =
      typeof req.body?.reportType === "string" && reportPrompts[req.body.reportType]
        ? req.body.reportType
        : "general";
    const patientId =
      typeof req.body?.patient_id === "string" && req.body.patient_id.trim()
        ? req.body.patient_id.trim()
        : null;
    const doctorId =
      typeof req.body?.doctor_id === "string" && req.body.doctor_id.trim()
        ? req.body.doctor_id.trim()
        : null;
    const doctorName =
      typeof req.body?.doctor_name === "string" && req.body.doctor_name.trim()
        ? req.body.doctor_name.trim()
        : null;
    const patientDetails =
      req.body?.patient_details && typeof req.body.patient_details === "object"
        ? req.body.patient_details
        : {};
    const doctorDetails =
      req.body?.doctor_details && typeof req.body.doctor_details === "object"
        ? req.body.doctor_details
        : {};
    const persist = req.body?.persist === true;

    if (!transcription.trim()) {
      return res.status(400).json({ error: "Missing or invalid transcription field" });
    }

    const prompt = [
      "Generate a structured medical report from the consultation transcript.",
      `Report style: ${reportPrompts[reportType]}.`,
      "Return ONLY JSON with this exact schema:",
      JSON.stringify(
        {
          summary: "",
          symptoms: [""],
          diagnosis: "",
          treatment_plan: "",
          recommendations: [""],
        },
        null,
        2
      ),
      "Rules:",
      "- Use only transcript facts. Do not fabricate.",
      "- Keep symptoms and recommendations as arrays of short strings.",
      "- Keep summary concise and clinical.",
      "",
      `Patient details: ${JSON.stringify(patientDetails)}`,
      `Doctor details: ${JSON.stringify(doctorDetails)}`,
      "Transcript:",
      transcription,
    ].join("\n");

    const structuredReport = await generateStructuredReportWithRetry(prompt);
    const reportContent = formatStructuredReport(structuredReport);

    let reportId = null;
    if (persist) {
      const saved = await reportsRepository.createStructuredReport({
        userId: req.auth.userId,
        patientId,
        doctorId,
        doctorName,
        transcription,
        reportType,
        generatedReport: structuredReport,
      });
      reportId = saved?.id || null;
    }

    return res.json({
      ...structuredReport,
      report_content: reportContent,
      report_id: reportId,
    });
  })
);

export default router;
