function stripControlCharacters(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function sanitizeText(value, { preserveNewlines = true } = {}) {
  const cleaned = stripControlCharacters(value);
  const normalized = preserveNewlines
    ? cleaned.replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ")
    : cleaned.replace(/\s+/g, " ");
  return normalized.trim();
}

export function sanitizeNullableText(value, options) {
  if (value === undefined || value === null) return null;
  const sanitized = sanitizeText(value, options);
  return sanitized.length > 0 ? sanitized : null;
}
