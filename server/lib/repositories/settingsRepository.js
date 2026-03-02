import { prisma } from "../db.js";

export const settingsRepository = {
  async getSetting(userId, key) {
    const row = await prisma.setting.findFirst({
      where: {
        user_id: userId,
        key,
      },
    });
    if (!row) return null;
    let parsed = null;
    if (row.value) {
      try {
        parsed = JSON.parse(row.value);
      } catch {
        parsed = null;
      }
    }
    return {
      ...row,
      value: parsed,
    };
  },

  async upsertSetting(userId, key, value) {
    const serialized = JSON.stringify(value ?? null);
    const row = await prisma.setting.upsert({
      where: {
        user_id_key: {
          user_id: userId,
          key,
        },
      },
      create: {
        user_id: userId,
        key,
        value: serialized,
      },
      update: {
        value: serialized,
      },
    });
    return {
      ...row,
      value,
    };
  },

  async deleteAllSettingsForUser(userId) {
    const result = await prisma.setting.deleteMany({
      where: {
        user_id: userId,
      },
    });
    return result.count;
  },
};
