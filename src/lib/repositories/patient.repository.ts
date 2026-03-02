import { apiRequest, getStoredSession } from "@/lib/apiClient";

export interface PatientRecord {
  patient_id: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  medical_history: string | null;
  allergies: string | null;
  diagnosis_history: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertPatientPayload {
  patient_id: string;
  full_name?: string | null;
  age?: number | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  medical_history?: string | null;
  allergies?: string | null;
  diagnosis_history?: string | null;
}

async function ensureCurrentUser(): Promise<string> {
  const session = getStoredSession();
  if (!session?.user?.id) throw new Error("User not authenticated");
  return session.user.id;
}

export const patientRepository = {
  async getByPatientId(patientId: string): Promise<PatientRecord | undefined> {
    await ensureCurrentUser();
    const normalized = patientId.trim();
    if (!normalized) return undefined;

    try {
      const { data } = await apiRequest<{ data: PatientRecord; error: null }>(
        `/api/patients/${encodeURIComponent(normalized)}`
      );
      return data || undefined;
    } catch {
      return undefined;
    }
  },

  async upsert(payload: UpsertPatientPayload): Promise<PatientRecord> {
    await ensureCurrentUser();
    const { data } = await apiRequest<{ data: PatientRecord; error: null }>("/api/patients", {
      method: "POST",
      body: payload,
    });
    return data;
  },

  async list(query = ""): Promise<PatientRecord[]> {
    await ensureCurrentUser();
    const q = query.trim();
    const path = q ? `/api/patients?q=${encodeURIComponent(q)}` : "/api/patients";
    const { data } = await apiRequest<{ data: PatientRecord[]; error: null }>(path);
    return data || [];
  },
};
