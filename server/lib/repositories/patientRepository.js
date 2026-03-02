import { prisma } from "../db.js";

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const patientRepository = {
  async getPatientByIdForUser(userId, patientId) {
    return prisma.patient.findFirst({
      where: {
        user_id: userId,
        patient_id: patientId,
      },
    });
  },

  async listPatientsForUser(userId, query = "") {
    const search = query.trim();
    return prisma.patient.findMany({
      where: {
        user_id: userId,
        ...(search
          ? {
              OR: [
                { patient_id: { contains: search } },
                { full_name: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: {
        updated_at: "desc",
      },
      take: 100,
    });
  },

  async upsertPatientForUser(userId, payload) {
    const patientId = cleanString(payload?.patient_id);
    if (!patientId) {
      const error = new Error("patient_id is required");
      error.statusCode = 400;
      throw error;
    }

    const byGlobalId = await prisma.patient.findUnique({
      where: { patient_id: patientId },
    });

    if (byGlobalId && byGlobalId.user_id !== userId) {
      const error = new Error("Patient ID already exists");
      error.statusCode = 409;
      throw error;
    }

    const data = {
      full_name: cleanString(payload?.full_name),
      age: typeof payload?.age === "number" && Number.isFinite(payload.age) ? payload.age : null,
      gender: cleanString(payload?.gender),
      phone: cleanString(payload?.phone),
      address: cleanString(payload?.address),
      medical_history: cleanString(payload?.medical_history),
      allergies: cleanString(payload?.allergies),
      diagnosis_history: cleanString(payload?.diagnosis_history),
    };

    if (byGlobalId) {
      return prisma.patient.update({
        where: { patient_id: patientId },
        data,
      });
    }

    return prisma.patient.create({
      data: {
        patient_id: patientId,
        user_id: userId,
        ...data,
      },
    });
  },
};
