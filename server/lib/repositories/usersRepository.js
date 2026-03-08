import { prisma } from "../db.js";

export const usersRepository = {
  async createUser({ email, fullName, passwordHash, role = "doctor" }) {
    return prisma.user.create({
      data: {
        email,
        full_name: fullName ?? null,
        role,
        password_hash: passwordHash,
      },
    });
  },

  async findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  async upsertProfile({ id, email, fullName }) {
    return prisma.user.upsert({
      where: { id },
      create: {
        id,
        email: email ?? "",
        full_name: fullName ?? null,
        role: "doctor",
        password_hash: "__unusable_password__",
      },
      update: {
        email: email ?? undefined,
        full_name: fullName ?? undefined,
      },
    });
  },

  async setResetToken({ email, token, expiresAt }) {
    return prisma.user.update({
      where: { email },
      data: {
        reset_token: token,
        reset_token_until: expiresAt,
      },
    });
  },

  async findByResetToken(token) {
    return prisma.user.findFirst({
      where: {
        reset_token: token,
        reset_token_until: {
          gt: new Date(),
        },
      },
    });
  },

  async updatePassword(userId, passwordHash) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
        reset_token: null,
        reset_token_until: null,
      },
    });
  },

  async listUsers(limit = 100) {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        created_at: true,
        updated_at: true,
      },
      take: limit,
      orderBy: {
        created_at: "desc",
      },
    });
  },
};
