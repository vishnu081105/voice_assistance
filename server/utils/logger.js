import winston from "winston";

function sanitizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const withoutQuery = raw.split("?")[0];
  return withoutQuery
    .replace(/\/reports\/patient\/[^/]+/gi, "/reports/patient/[redacted]")
    .replace(/\/patients\/[^/]+/gi, "/patients/[redacted]")
    .replace(/\/patient\/[^/]+/gi, "/patient/[redacted]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[id]"
    );
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

export function buildRequestLogMeta(req, extra = {}) {
  return {
    user_id: req.auth?.userId || null,
    ip_address: getClientIp(req),
    endpoint: sanitizeEndpoint(req.originalUrl || req.url || null),
    method: req.method || null,
    ...extra,
  };
}

export function buildSafeErrorMeta(error, extra = {}) {
  return {
    error_code: error?.code || null,
    error_name: error?.name || "Error",
    ...extra,
  };
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: {
    service: "medivoice-api",
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
