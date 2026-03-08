import { z } from "zod";
import { sanitizeNullableText, sanitizeText } from "../utils/sanitize.js";

const emailSchema = z
  .string()
  .min(1)
  .max(255)
  .email()
  .transform((value) => sanitizeText(value, { preserveNewlines: false }).toLowerCase());

export const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  full_name: z
    .string()
    .max(100)
    .optional()
    .transform((value) => sanitizeNullableText(value, { preserveNewlines: false })),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  redirectTo: z.string().max(500).optional().default(""),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(255),
  password: z.string().min(6).max(128),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(6).max(128),
});
