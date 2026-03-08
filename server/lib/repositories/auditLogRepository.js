import { prisma } from "../db.js";

export const auditLogRepository = {
  async create(entry) {
    return prisma.auditLog.create({
      data: {
        user_id: entry.user_id ?? null,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id ?? null,
        ip_address: entry.ip_address ?? null,
        timestamp: entry.timestamp ?? new Date(),
      },
    });
  },
};
