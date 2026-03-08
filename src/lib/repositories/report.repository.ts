import { apiRequest, getStoredSession } from "@/lib/apiClient";

export type ReportType = "general" | "soap" | "diagnostic";

export interface StructuredMedication {
  name: string;
  dosage: string;
  frequency: string;
}

export interface StructuredPatientInformation {
  patient_id?: string;
  full_name?: string;
  age?: number | null;
  gender?: string;
  phone?: string;
  address?: string;
  medical_history?: string;
  allergies?: string;
  diagnosis_history?: string;
  doctor_id?: string;
  doctor_name?: string;
  report_type?: string;
}

export interface StructuredGeneratedReport {
  patient_information: StructuredPatientInformation;
  chief_complaint: string;
  history_of_present_illness: string;
  summary: string;
  symptoms: string[];
  medical_assessment: string;
  diagnosis: string;
  treatment_plan: string;
  medications: StructuredMedication[];
  follow_up_instructions: string[];
  recommendations: string[];
  report_content?: string;
}

export interface Report {
  id: string;
  transcription: string;
  reportContent: string;
  reportType: ReportType;
  createdAt: Date;
  updatedAt: Date;
  duration: number;
  wordCount: number;
  patientId?: string;
  doctorId?: string;
  doctorName?: string;
  audioUrl?: string;
  generatedReport?: StructuredGeneratedReport | null;
}

export type ReportApiRow = {
  id: string;
  transcription: string;
  report_content: string;
  report_type: string;
  created_at: string;
  updated_at: string;
  duration: number;
  word_count: number;
  patient_id?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  audio_url?: string | null;
  generated_report?: string | null;
};

async function ensureCurrentUser(): Promise<string> {
  const session = getStoredSession();
  if (!session?.user?.id) throw new Error("User not authenticated");
  return session.user.id;
}

function parseGeneratedReport(raw: string | null | undefined): StructuredGeneratedReport | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Record<string, unknown>;
    const patientInformation =
      payload.patient_information && typeof payload.patient_information === "object"
        ? (payload.patient_information as Record<string, unknown>)
        : {};

    return {
      patient_information: {
        patient_id:
          typeof patientInformation.patient_id === "string" ? patientInformation.patient_id : undefined,
        full_name:
          typeof patientInformation.full_name === "string" ? patientInformation.full_name : undefined,
        age:
          typeof patientInformation.age === "number" ? patientInformation.age : null,
        gender: typeof patientInformation.gender === "string" ? patientInformation.gender : undefined,
        phone: typeof patientInformation.phone === "string" ? patientInformation.phone : undefined,
        address: typeof patientInformation.address === "string" ? patientInformation.address : undefined,
        medical_history:
          typeof patientInformation.medical_history === "string"
            ? patientInformation.medical_history
            : undefined,
        allergies:
          typeof patientInformation.allergies === "string" ? patientInformation.allergies : undefined,
        diagnosis_history:
          typeof patientInformation.diagnosis_history === "string"
            ? patientInformation.diagnosis_history
            : undefined,
        doctor_id:
          typeof patientInformation.doctor_id === "string" ? patientInformation.doctor_id : undefined,
        doctor_name:
          typeof patientInformation.doctor_name === "string" ? patientInformation.doctor_name : undefined,
        report_type:
          typeof patientInformation.report_type === "string" ? patientInformation.report_type : undefined,
      },
      chief_complaint:
        typeof payload.chief_complaint === "string" ? payload.chief_complaint : "",
      history_of_present_illness:
        typeof payload.history_of_present_illness === "string"
          ? payload.history_of_present_illness
          : "",
      summary: typeof payload.summary === "string" ? payload.summary : "",
      symptoms: Array.isArray(payload.symptoms)
        ? payload.symptoms.filter((item): item is string => typeof item === "string")
        : [],
      medical_assessment:
        typeof payload.medical_assessment === "string" ? payload.medical_assessment : "",
      diagnosis: typeof payload.diagnosis === "string" ? payload.diagnosis : "",
      treatment_plan: typeof payload.treatment_plan === "string" ? payload.treatment_plan : "",
      medications: Array.isArray(payload.medications)
        ? payload.medications
            .map((item) => {
              const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
              return {
                name: typeof row.name === "string" ? row.name : "",
                dosage: typeof row.dosage === "string" ? row.dosage : "",
                frequency: typeof row.frequency === "string" ? row.frequency : "",
              };
            })
            .filter((item) => item.name)
        : [],
      follow_up_instructions: Array.isArray(payload.follow_up_instructions)
        ? payload.follow_up_instructions.filter((item): item is string => typeof item === "string")
        : [],
      recommendations: Array.isArray(payload.recommendations)
        ? payload.recommendations.filter((item): item is string => typeof item === "string")
        : [],
      report_content: typeof payload.report_content === "string" ? payload.report_content : undefined,
    };
  } catch {
    return null;
  }
}

function toReport(row: ReportApiRow): Report {
  return {
    id: row.id,
    transcription: row.transcription,
    reportContent: row.report_content,
    reportType: row.report_type as ReportType,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    duration: Number(row.duration || 0),
    wordCount: Number(row.word_count || 0),
    patientId: row.patient_id ?? undefined,
    doctorId: row.doctor_id ?? undefined,
    doctorName: row.doctor_name ?? undefined,
    audioUrl: row.audio_url ?? undefined,
    generatedReport: parseGeneratedReport(row.generated_report),
  };
}

function serializeGeneratedReport(value: StructuredGeneratedReport | null | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

export const reportRepository = {
  async create(report: Omit<Report, "id" | "createdAt" | "updatedAt">): Promise<string> {
    await ensureCurrentUser();
    const payload = {
      transcription: report.transcription,
      report_content: report.reportContent,
      report_type: report.reportType,
      duration: report.duration,
      word_count: report.wordCount,
      patient_id: report.patientId ?? null,
      doctor_id: report.doctorId ?? null,
      doctor_name: report.doctorName ?? null,
      audio_url: report.audioUrl ?? null,
      generated_report: serializeGeneratedReport(report.generatedReport),
    };
    const { data } = await apiRequest<{ data: ReportApiRow; error: null }>("/api/reports", {
      method: "POST",
      body: payload,
    });
    return data.id;
  },

  async getById(id: string): Promise<Report | undefined> {
    await ensureCurrentUser();
    try {
      const { data } = await apiRequest<{ data: ReportApiRow; error: null }>(`/api/reports/${id}`);
      if (!data) return undefined;
      return toReport(data);
    } catch {
      return undefined;
    }
  },

  async getAll(): Promise<Report[]> {
    await ensureCurrentUser();
    try {
      const { data } = await apiRequest<{ data: ReportApiRow[]; error: null }>("/api/reports");
      return (data || []).map(toReport);
    } catch (err) {
      console.error("Error fetching reports:", err);
      return [];
    }
  },

  async deleteById(id: string): Promise<void> {
    await ensureCurrentUser();
    await apiRequest(`/api/reports/${id}`, { method: "DELETE" });
  },

  async updateById(id: string, updates: Partial<Omit<Report, "id" | "createdAt">>): Promise<void> {
    await ensureCurrentUser();
    const payload: Record<string, unknown> = {};
    if (updates.transcription !== undefined) payload.transcription = updates.transcription;
    if (updates.reportContent !== undefined) payload.report_content = updates.reportContent;
    if (updates.reportType !== undefined) payload.report_type = updates.reportType;
    if (updates.duration !== undefined) payload.duration = updates.duration;
    if (updates.wordCount !== undefined) payload.word_count = updates.wordCount;
    if (updates.patientId !== undefined) payload.patient_id = updates.patientId;
    if (updates.doctorId !== undefined) payload.doctor_id = updates.doctorId;
    if (updates.doctorName !== undefined) payload.doctor_name = updates.doctorName;
    if (updates.audioUrl !== undefined) payload.audio_url = updates.audioUrl;
    if (updates.generatedReport !== undefined) {
      payload.generated_report = serializeGeneratedReport(updates.generatedReport);
    }
    await apiRequest(`/api/reports/${id}`, { method: "PATCH", body: payload });
  },

  async search(query: string): Promise<Report[]> {
    await ensureCurrentUser();
    if (!query.trim()) return [];
    try {
      const { data } = await apiRequest<{ data: ReportApiRow[]; error: null }>(
        `/api/reports/search?q=${encodeURIComponent(query)}`
      );
      return (data || []).map(toReport);
    } catch (err) {
      console.error("Error searching reports:", err);
      return [];
    }
  },

  async clearAll(): Promise<void> {
    await ensureCurrentUser();
    await apiRequest("/api/reports", { method: "DELETE" });
  },

  async getStats(): Promise<{ totalPatients: number; totalRecords: number; allPatientIds: string[] }> {
    await ensureCurrentUser();
    const { data } = await apiRequest<{ data: { totalPatients: number; totalRecords: number; allPatientIds: string[] } }>(
      "/api/reports/stats"
    );
    return data || { totalPatients: 0, totalRecords: 0, allPatientIds: [] };
  },

  async searchByPatient(patientId: string): Promise<ReportApiRow[]> {
    await ensureCurrentUser();
    const { data } = await apiRequest<{ data: ReportApiRow[]; error: null }>(
      `/api/reports/patient/${encodeURIComponent(patientId)}`
    );
    return data || [];
  },
};
