import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWhisperTranscription } from './useWhisperTranscription';

describe('useWhisperTranscription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a transcription result for valid audio', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'Patient reports fever and cough.',
          duration: 18,
          language: 'en',
          segments: [{ start: 0, end: 18, text: 'Patient reports fever and cough.' }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useWhisperTranscription());
    const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
    let transcription: Awaited<ReturnType<typeof result.current.transcribe>> | null = null;
    await act(async () => {
      transcription = await result.current.transcribe(audioBlob);
    });

    expect(transcription?.text).toBe('Patient reports fever and cough.');
    expect(result.current.error).toBeNull();
  });

  it('surfaces backend transcription errors with a user-friendly message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Audio file exceeds the configured upload limit.',
          },
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useWhisperTranscription());
    const audioBlob = new Blob(['audio'], { type: 'audio/webm' });

    await act(async () => {
      await expect(result.current.transcribe(audioBlob)).rejects.toThrow(
        'Audio file exceeds the configured upload limit.'
      );
    });
  });
});
