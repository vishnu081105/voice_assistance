import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest, getStoredSession } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getStoredSession: vi.fn(() => ({
    user: { id: 'user-1' },
  })),
}));

vi.mock('@/lib/apiClient', () => ({
  apiRequest,
  getStoredSession,
}));

import { reportRepository } from './report.repository';

describe('report.repository', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('serializes the structured generated report when saving a record', async () => {
    apiRequest.mockResolvedValue({
      data: {
        id: 'report-1',
      },
    });

    const reportId = await reportRepository.create({
      transcription: 'PATIENT: Fever and cough.',
      reportContent: 'Patient Information\nPatient ID: P-100',
      reportType: 'general',
      duration: 40,
      wordCount: 20,
      patientId: 'P-100',
      doctorName: 'Dr. Raman',
      generatedReport: {
        patient_information: {
          patient_id: 'P-100',
        },
        chief_complaint: 'Fever and cough.',
        history_of_present_illness: 'Symptoms for three days.',
        summary: 'Consultation summary.',
        symptoms: ['Fever', 'Cough'],
        medical_assessment: 'Likely viral infection.',
        diagnosis: 'Viral URI',
        treatment_plan: 'Rest and fluids.',
        medications: [],
        follow_up_instructions: ['Return if worsening'],
        recommendations: ['Hydration'],
        report_content: 'Patient Information\nPatient ID: P-100',
      },
    });

    expect(reportId).toBe('report-1');
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/reports',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          generated_report: expect.stringContaining('"chief_complaint":"Fever and cough."'),
          patient_id: 'P-100',
        }),
      })
    );
  });
});
