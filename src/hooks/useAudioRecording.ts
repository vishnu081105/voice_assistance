import { useState, useRef, useCallback } from 'react';
import { getAccessToken, getApiBaseUrl } from '@/lib/apiClient';

interface UseAudioRecordingReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  resetRecording: () => void;
  uploadRecording: (reportId: string) => Promise<string | null>;
  error: string | null;
}

export function useAudioRecording(): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/mp4',
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        
        // Create a URL for playback
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone. Please grant permission.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });
        setAudioBlob(blob);
        
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        resolve(blob);
      };
      
      mediaRecorderRef.current.stop();
    });
  }, [isRecording]);

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];
    setError(null);
  }, [audioUrl]);

  const uploadRecording = useCallback(async (reportId: string): Promise<string | null> => {
    if (!audioBlob) {
      setError('No recording to upload');
      return null;
    }

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setError('User not authenticated');
        return null;
      }

      const formData = new FormData();
      formData.append('file', audioBlob, `${reportId}-${Date.now()}.webm`);
      formData.append('reportId', reportId);

      const response = await fetch(`${getApiBaseUrl()}/api/storage/recordings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const bodyText = await response.text().catch(() => '');
      let payload: any = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const message = payload?.error?.message || payload?.error || `Failed to upload recording (${response.status})`;
        setError(message);
        return null;
      }

      return payload?.data?.publicUrl || null;
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Failed to upload recording');
      return null;
    }
  }, [audioBlob]);

  return {
    isRecording,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    resetRecording,
    uploadRecording,
    error,
  };
}
