import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

function buildLimiter(name) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("rate_limit.exceeded", {
        endpoint: req.originalUrl,
        method: req.method,
        ip_address: req.ip,
        user_id: req.auth?.userId || null,
        limiter: name,
      });
      res.status(429).json({
        error: "Too many requests. Please try again shortly.",
      });
    },
  });
}

export const authRateLimiter = buildLimiter("auth");
export const aiRateLimiter = buildLimiter("ai");
export const medicalUploadRateLimiter = buildLimiter("medical_upload");
