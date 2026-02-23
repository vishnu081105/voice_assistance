import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WhisperTranscriptionResult {
  text: string;
  duration: number;
  language: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

interface UseWhisperTranscriptionReturn {
  transcribe: (audioBlob: Blob) => Promise<WhisperTranscriptionResult | null>;
  isTranscribing: boolean;
  error: string | null;
  progress: string;
}

export function useWhisperTranscription(): UseWhisperTranscriptionReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const transcribe = useCallback(async (audioBlob: Blob): Promise<WhisperTranscriptionResult | null> => {
    if (!audioBlob || audioBlob.size === 0) {
      setError('No audio data to transcribe');
      return null;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress('Preparing audio...');

    try {
      const mimeType = audioBlob.type || '';
      let extension = 'webm';
      if (mimeType.includes('mp4')) extension = 'mp4';
      else if (mimeType.includes('mp3')) extension = 'mp3';
      else if (mimeType.includes('wav')) extension = 'wav';
      else if (mimeType.includes('ogg')) extension = 'ogg';

      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${extension}`);
      formData.append('language', 'en');

      setProgress('Sending to Whisper AI...');

      // Get auth token from supabase session or fallback to env key
      const res = await supabase.auth.getSession();
      const session = (res as any)?.data?.session;
      const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-transcribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        if (response.status === 429) throw new Error('Rate limit exceeded. Please wait and try again.');
        if (response.status === 401) throw new Error('Authentication failed (401). Check function auth or API key. ' + bodyText);
        if (response.status === 402) throw new Error('Usage limit reached (402). ' + bodyText);
        throw new Error(`Transcription failed (${response.status}) ${response.statusText} ${bodyText}`);
      }

      setProgress('Processing transcription...');
      const raw = await response.text().catch(() => '');
      let dataJson: any = null;
      try {
        dataJson = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('Whisper function returned non-JSON response:', raw);
        throw new Error('Transcription function returned invalid response: ' + raw);
      }

      if (!dataJson || !dataJson.text) {
        throw new Error('No transcription received from Whisper: ' + raw);
      }

      setProgress('Complete!');

      return {
        text: dataJson.text,
        duration: dataJson.duration || 0,
        language: dataJson.language || 'en',
        segments: dataJson.segments || [],
      };

    } catch (err) {
      console.error('Whisper transcription error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
      setError(errorMessage);
      return null;
    } finally {
      setIsTranscribing(false);
      setTimeout(() => setProgress(''), 2000);
    }
  }, []);

  return {
    transcribe,
    isTranscribing,
    error,
    progress,
  };
}
