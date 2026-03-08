import { describe, expect, it } from 'vitest';
import type { Report } from '@/lib/db';
import { buildReportDownloadText, buildStructuredReportText } from './reportFormatting';

const structuredReport = {
  patient_information: {
    patient_id: 'P-100',
    full_name: 'John Doe',
    age: 47,
    gender: 'male',
    doctor_name: 'Dr. Raman',
  },
  chief_complaint: 'Fever and cough for three days.',
  history_of_present_illness: 'Symptoms started after travel and worsened overnight.',
  summary: 'Consultation summary.',
  symptoms: ['Fever', 'Cough'],
  medical_assessment: 'Likely upper respiratory tract infection.',
  diagnosis: 'Viral upper respiratory infection',
  treatment_plan: 'Hydration, rest, and supportive care.',
  medications: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'twice daily' }],
  follow_up_instructions: ['Return if fever persists for 48 hours.'],
  recommendations: ['Monitor temperature at home.'],
  report_content: '',
};

describe('reportFormatting', () => {
  it('renders the structured report in the required clinical section order', () => {
    const reportText = buildStructuredReportText(structuredReport);

    expect(reportText).toContain('Patient Information');
    expect(reportText.indexOf('Chief Complaint')).toBeGreaterThan(reportText.indexOf('Patient Information'));
    expect(reportText.indexOf('History of Present Illness')).toBeGreaterThan(
      reportText.indexOf('Chief Complaint')
    );
    expect(reportText.indexOf('Follow-up Instructions')).toBeGreaterThan(
      reportText.indexOf('Medications')
    );
  });

  it('uses the saved report preview text as the download source', () => {
    const report: Report = {
      id: 'report-1',
      transcription: 'PATIENT: Fever for three days.',
      reportContent: 'Patient Information\nPatient ID: P-100',
      reportType: 'general',
      createdAt: new Date('2026-03-07T10:00:00.000Z'),
      updatedAt: new Date('2026-03-07T10:00:00.000Z'),
      duration: 32,
      wordCount: 12,
      patientId: 'P-100',
      doctorName: 'Dr. Raman',
      generatedReport: structuredReport,
    };

    expect(buildReportDownloadText(report)).toBe(report.reportContent);
  });
});
