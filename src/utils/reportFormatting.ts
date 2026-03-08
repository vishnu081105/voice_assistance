import type { Report } from '@/lib/db';
import type {
  StructuredGeneratedReport,
  StructuredMedication,
  StructuredPatientInformation,
} from '@/lib/repositories/report.repository';

function normalizeText(value: unknown, fallback = '') {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized || fallback;
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeText(item))
        .filter(Boolean)
    : [];
}

function normalizeMedications(value: unknown): StructuredMedication[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          return {
            name: normalizeText(row.name),
            dosage: normalizeText(row.dosage, 'Not specified'),
            frequency: normalizeText(row.frequency, 'Not specified'),
          };
        })
        .filter((item) => item.name)
    : [];
}

function buildPatientInformationLines(patientInformation: StructuredPatientInformation = {}) {
  return [
    patientInformation.full_name ? `Patient Name: ${patientInformation.full_name}` : null,
    patientInformation.patient_id ? `Patient ID: ${patientInformation.patient_id}` : null,
    patientInformation.age !== null && patientInformation.age !== undefined
      ? `Age: ${patientInformation.age}`
      : null,
    patientInformation.gender ? `Gender: ${patientInformation.gender}` : null,
    patientInformation.phone ? `Phone: ${patientInformation.phone}` : null,
    patientInformation.address ? `Address: ${patientInformation.address}` : null,
    patientInformation.doctor_name ? `Doctor: ${patientInformation.doctor_name}` : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildStructuredReportText(report: StructuredGeneratedReport | null | undefined) {
  if (!report) return '';

  if (normalizeText(report.report_content)) {
    return normalizeText(report.report_content);
  }

  const patientInfoLines = buildPatientInformationLines(report.patient_information);
  const symptomLines = normalizeList(report.symptoms).map((item) => `- ${item}`);
  const medicationLines = normalizeMedications(report.medications).map(
    (item) => `- ${item.name} | ${item.dosage} | ${item.frequency}`
  );
  const followUpLines = normalizeList(report.follow_up_instructions).map((item) => `- ${item}`);

  return [
    'Patient Information',
    patientInfoLines.length > 0 ? patientInfoLines.join('\n') : 'No patient identifiers were provided.',
    '',
    'Chief Complaint',
    normalizeText(report.chief_complaint, 'Not documented.'),
    '',
    'History of Present Illness',
    normalizeText(report.history_of_present_illness, 'Not documented.'),
    '',
    'Symptoms',
    symptomLines.length > 0 ? symptomLines.join('\n') : '- None documented',
    '',
    'Medical Assessment',
    normalizeText(report.medical_assessment, report.summary || 'Not documented.'),
    '',
    'Diagnosis',
    normalizeText(report.diagnosis, 'Not documented.'),
    '',
    'Treatment Plan',
    normalizeText(report.treatment_plan, 'Not documented.'),
    '',
    'Medications',
    medicationLines.length > 0 ? medicationLines.join('\n') : '- None documented',
    '',
    'Follow-up Instructions',
    followUpLines.length > 0 ? followUpLines.join('\n') : '- None documented',
  ].join('\n');
}

export function formatDurationLabel(durationSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(durationSeconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function buildReportDownloadText(report: Report) {
  const preview = normalizeText(report.reportContent);
  if (preview) return preview;

  const fallback = buildStructuredReportText(report.generatedReport);
  if (fallback) return fallback;

  return [
    'Patient Information',
    'No patient identifiers were provided.',
    '',
    'Chief Complaint',
    'Not documented.',
  ].join('\n');
}
