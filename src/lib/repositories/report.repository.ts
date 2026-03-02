import { apiRequest, getStoredSession } from "@/lib/apiClient";

export type ReportType = "general" | "soap" | "diagnostic";

export interface StructuredGeneratedReport {
  summary: string;
  symptoms: string[];
  diagnosis: string;
  treatment_plan: string;
  recommendations: string[];
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
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms.filter((item: any) => typeof item === "string") : [],
      diagnosis: typeof parsed.diagnosis === "string" ? parsed.diagnosis : "",
      treatment_plan: typeof parsed.treatment_plan === "string" ? parsed.treatment_plan : "",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((item: any) => typeof item === "string")
        : [],
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
