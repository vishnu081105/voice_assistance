import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateMedicalTranscript, uploadMedicalAudio } from './medical.repository';

describe('medical.repository uploadMedicalAudio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts m4a uploads and posts them to the medical upload endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ upload_id: 'upload-1', status: 'uploaded' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const file = new File(['audio-data'], 'consultation.m4a', { type: 'audio/mp4' });
    const response = await uploadMedicalAudio(file);

    expect(response.upload_id).toBe('upload-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain('/api/medical/audio-upload');
  });

  it('rejects unsupported extensions before making a request', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');
    const file = new File(['text'], 'consultation.txt', { type: 'text/plain' });

    await expect(uploadMedicalAudio(file)).rejects.toThrow(
      'Only WAV, MP3, MPEG, M4A, or WEBM files are allowed'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends reviewed transcript updates to the medical review endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          upload_id: 'upload-1',
          status: 'completed',
          corrected_transcript_text: 'DOCTOR: Start paracetamol.',
          transcript: [],
          report_record_id: 'report-1',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const response = await updateMedicalTranscript('upload-1', 'Doctor: Start paracetamol.');

    expect(response.report_record_id).toBe('report-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/medical/transcript/upload-1'),
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });
});
