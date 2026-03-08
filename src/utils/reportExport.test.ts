import { describe, expect, it } from 'vitest';
import type { Report } from '@/lib/db';
import { exportReportToDOCX, exportReportToPDF } from './reportExport';

const report: Report = {
  id: 'report-export-1',
  transcription: 'PATIENT: Fever and cough.',
  reportContent: [
    'Patient Information',
    'Patient ID: P-100',
    '',
    'Chief Complaint',
    'Fever and cough.',
    '',
    'History of Present Illness',
    'Symptoms started three days ago.',
    '',
    'Symptoms',
    '- Fever',
    '- Cough',
    '',
    'Medical Assessment',
    'Likely viral infection.',
    '',
    'Diagnosis',
    'Viral upper respiratory infection',
    '',
    'Treatment Plan',
    'Supportive care and hydration.',
    '',
    'Medications',
    '- Paracetamol | 500 mg | twice daily',
    '',
    'Follow-up Instructions',
    '- Return if fever persists.',
  ].join('\n'),
  reportType: 'general',
  createdAt: new Date('2026-03-07T10:00:00.000Z'),
  updatedAt: new Date('2026-03-07T10:00:00.000Z'),
  duration: 75,
  wordCount: 48,
  patientId: 'P-100',
  doctorName: 'Dr. Raman',
};

describe('reportExport', () => {
  it('creates a PDF document for the saved report preview', () => {
    const pdf = exportReportToPDF(report);
    expect(pdf).toBeTruthy();
  });

  it('creates a DOCX blob for the saved report preview', async () => {
    const blob = await exportReportToDOCX(report);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
