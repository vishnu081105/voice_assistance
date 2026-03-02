import { apiRequest, getStoredSession } from "@/lib/apiClient";
import {
  reportRepository,
  Report as RepositoryReport,
  ReportApiRow,
  ReportType as RepositoryReportType,
  StructuredGeneratedReport,
} from "@/lib/repositories/report.repository";
import {
  patientRepository,
  PatientRecord,
  UpsertPatientPayload,
} from "@/lib/repositories/patient.repository";

export type ReportType = RepositoryReportType;
export type Report = RepositoryReport;
export type GeneratedReport = StructuredGeneratedReport;

export interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  createdAt: Date;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Patient {
  patientId: string;
  fullName?: string;
  age?: number;
  gender?: string;
  phone?: string;
  address?: string;
  medicalHistory?: string;
  allergies?: string;
  diagnosisHistory?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function fromPatientRow(row: PatientRecord): Patient {
  return {
    patientId: row.patient_id,
    fullName: row.full_name || undefined,
    age: row.age ?? undefined,
    gender: row.gender || undefined,
    phone: row.phone || undefined,
    address: row.address || undefined,
    medicalHistory: row.medical_history || undefined,
    allergies: row.allergies || undefined,
    diagnosisHistory: row.diagnosis_history || undefined,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

function toPatientPayload(patient: Patient): UpsertPatientPayload {
  return {
    patient_id: patient.patientId,
    full_name: patient.fullName ?? null,
    age: patient.age ?? null,
    gender: patient.gender ?? null,
    phone: patient.phone ?? null,
    address: patient.address ?? null,
    medical_history: patient.medicalHistory ?? null,
    allergies: patient.allergies ?? null,
    diagnosis_history: patient.diagnosisHistory ?? null,
  };
}

async function getCurrentUserId(): Promise<string> {
  const session = getStoredSession();
  if (!session?.user?.id) throw new Error("User not authenticated");
  return session.user.id;
}

export async function saveReport(report: Omit<Report, "id" | "createdAt" | "updatedAt">): Promise<string> {
  return reportRepository.create(report);
}

export async function getReport(id: string): Promise<Report | undefined> {
  return reportRepository.getById(id);
}

export async function getAllReports(): Promise<Report[]> {
  return reportRepository.getAll();
}

export async function deleteReport(id: string): Promise<void> {
  await reportRepository.deleteById(id);
}

export async function updateReport(id: string, updates: Partial<Omit<Report, "id" | "createdAt">>): Promise<void> {
  await reportRepository.updateById(id, updates);
}

export async function searchReports(query: string): Promise<Report[]> {
  return reportRepository.search(query);
}

export async function clearAllReports(): Promise<void> {
  await reportRepository.clearAll();
}

export async function getReportStats(): Promise<{ totalPatients: number; totalRecords: number; allPatientIds: string[] }> {
  return reportRepository.getStats();
}

export async function searchReportsByPatient(patientId: string): Promise<ReportApiRow[]> {
  return reportRepository.searchByPatient(patientId);
}

export async function getPatientById(patientId: string): Promise<Patient | undefined> {
  const row = await patientRepository.getByPatientId(patientId);
  return row ? fromPatientRow(row) : undefined;
}

export async function upsertPatient(patient: Patient): Promise<Patient> {
  const row = await patientRepository.upsert(toPatientPayload(patient));
  return fromPatientRow(row);
}

export async function listPatients(query = ""): Promise<Patient[]> {
  const rows = await patientRepository.list(query);
  return rows.map(fromPatientRow);
}

export async function saveTemplate(template: Omit<Template, "id" | "createdAt">): Promise<void> {
  await getCurrentUserId();
  await apiRequest("/api/templates", {
    method: "POST",
    body: {
      name: template.name,
      content: template.content,
      category: template.category,
    },
  });
}

export async function getAllTemplates(): Promise<Template[]> {
  await getCurrentUserId();
  try {
    const { data } = await apiRequest<{ data: any[]; error: null }>("/api/templates");
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      category: row.category,
      createdAt: new Date(row.created_at),
    }));
  } catch (err) {
    console.error("Error fetching templates:", err);
    return [];
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await getCurrentUserId();
  await apiRequest(`/api/templates/${id}`, { method: "DELETE" });
}

export async function clearAllTemplates(): Promise<void> {
  await getCurrentUserId();
  await apiRequest("/api/templates", { method: "DELETE" });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  await getCurrentUserId();
  try {
    const { data } = await apiRequest<{ data: { key: string; value: T } | null }>(
      `/api/settings/${encodeURIComponent(key)}`
    );
    return data?.value as T;
  } catch {
    return undefined;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await getCurrentUserId();
  await apiRequest(`/api/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { value },
  });
}

export async function clearAllSettings(): Promise<void> {
  await getCurrentUserId();
  await apiRequest("/api/settings", { method: "DELETE" });
}

export async function listUsers(limit = 100): Promise<any[]> {
  await getCurrentUserId();
  const { data } = await apiRequest<{ data: any[]; error: null }>(`/api/users?limit=${limit}`);
  return data || [];
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
