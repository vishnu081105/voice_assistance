import { auditLogRepository } from "../lib/repositories/auditLogRepository.js";
import { getClientIp, logger } from "../utils/logger.js";

export const auditLogService = {
  async log(req, { action, resourceType, resourceId = null, userId = null } = {}) {
    if (!action || !resourceType) return;

    try {
      await auditLogRepository.create({
        user_id: userId ?? req?.auth?.userId ?? null,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        ip_address: getClientIp(req),
      });
    } catch (error) {
      logger.error("audit_log.write_failed", {
        user_id: userId ?? req?.auth?.userId ?? null,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        ip_address: getClientIp(req),
        error_code: error?.code || "AUDIT_LOG_WRITE_FAILED",
        error_name: error?.name || "Error",
      });
    }
  },
};
