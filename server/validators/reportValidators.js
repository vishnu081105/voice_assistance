import { z } from "zod";
import { sanitizeNullableText, sanitizeText } from "../utils/sanitize.js";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => sanitizeNullableText(value, { preserveNewlines: true }));

export const reportIdParamSchema = z.object({
  id: z.string().min(1).max(100),
});

export const reportSearchQuerySchema = z.object({
  q: z.string().max(200).optional().default(""),
});

export const reportPatientParamSchema = z.object({
  patientId: z.string().min(1).max(100),
});

export const createReportSchema = z.object({
  transcription: z
    .union([z.string(), z.undefined(), z.null()])
    .optional()
    .transform((value) => sanitizeNullableText(value, { preserveNewlines: true })),
  transcript: z
    .union([z.string(), z.undefined(), z.null()])
    .optional()
    .transform((value) => sanitizeNullableText(value, { preserveNewlines: true })),
  report_content: z.string().min(1).transform((value) => sanitizeText(value, { preserveNewlines: true })),
  report_type: z.enum(["general", "soap", "diagnostic"]).optional().default("general"),
  duration: z.number().int().min(0).optional().default(0),
  word_count: z.number().int().min(0).optional().default(0),
  patient_id: optionalText,
  doctor_id: optionalText,
  doctor_name: optionalText,
  generated_report: z.any().optional().default(null),
});

export const updateReportSchema = z
  .object({
    transcription: optionalText,
    report_content: z.string().min(1).optional().transform((value) => value === undefined ? undefined : sanitizeText(value, { preserveNewlines: true })),
    report_type: z.enum(["general", "soap", "diagnostic"]).optional(),
    duration: z.number().int().min(0).optional(),
    word_count: z.number().int().min(0).optional(),
    patient_id: optionalText,
    doctor_id: optionalText,
    doctor_name: optionalText,
    generated_report: z.any().optional(),
  })
  .partial();
