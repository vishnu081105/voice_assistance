import { z } from "zod";
import { sanitizeNullableText, sanitizeText } from "../utils/sanitize.js";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => sanitizeNullableText(value, { preserveNewlines: true }));

export const patientIdParamSchema = z.object({
  patientId: z.string().min(1).max(100).transform((value) => sanitizeText(value, { preserveNewlines: false })),
});

export const listPatientsQuerySchema = z.object({
  q: z.string().max(100).optional().default(""),
});

export const upsertPatientSchema = z.object({
  patient_id: z.string().min(1).max(100).transform((value) => sanitizeText(value, { preserveNewlines: false })),
  full_name: optionalText,
  age: z.union([z.number().int().min(0).max(150), z.null(), z.undefined()]).optional().default(null),
  gender: optionalText,
  phone: optionalText,
  address: optionalText,
  medical_history: optionalText,
  allergies: optionalText,
  diagnosis_history: optionalText,
});
