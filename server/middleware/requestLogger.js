import { buildRequestLogMeta, logger } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info(
      "request.complete",
      buildRequestLogMeta(req, {
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
      })
    );
  });

  next();
}
