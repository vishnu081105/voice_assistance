import { z } from "zod";
import { sanitizeNullableText, sanitizeText } from "../utils/sanitize.js";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => sanitizeNullableText(value, { preserveNewlines: true }));

export const transcribeBodySchema = z.object({
  language: z.string().max(32).optional().default("auto"),
});

export const processTranscriptSchema = z.object({
  transcription: z.string().min(1).transform((value) => sanitizeText(value, { preserveNewlines: true })),
  enableDiarization: z.boolean().optional().default(true),
  enhanceTerminology: z.boolean().optional().default(true),
});

export const generateReportSchema = z.object({
  transcription: z.string().min(1).transform((value) => sanitizeText(value, { preserveNewlines: true })),
  reportType: z.enum(["general", "soap", "diagnostic"]).optional().default("general"),
  patient_id: optionalText,
  doctor_id: optionalText,
  doctor_name: optionalText,
  patient_details: z.record(z.any()).optional().default({}),
  doctor_details: z.record(z.any()).optional().default({}),
  persist: z.boolean().optional().default(false),
});

export const medicalUploadIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateMedicalTranscriptSchema = z.object({
  transcript_text: z
    .string()
    .min(1)
    .transform((value) => sanitizeText(value, { preserveNewlines: true })),
});
