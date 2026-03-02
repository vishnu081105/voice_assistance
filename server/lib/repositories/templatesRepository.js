import { prisma } from "../db.js";

export const templatesRepository = {
  async createTemplate(data) {
    return prisma.template.create({ data });
  },

  async listTemplatesForUser(userId) {
    return prisma.template.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
  },

  async deleteTemplateForUser(id, userId) {
    const template = await prisma.template.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!template) return 0;
    await prisma.template.delete({ where: { id: template.id } });
    return 1;
  },

  async deleteAllTemplatesForUser(userId) {
    const result = await prisma.template.deleteMany({ where: { user_id: userId } });
    return result.count;
  },
};

