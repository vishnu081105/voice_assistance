import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
      const res = await supabase.auth.getSession();
      const session = (res as any)?.data?.session;
      if (!session?.user) {
        setError('User not authenticated');
        return null;
      }

      const userId = session.user.id;
      const fileName = `${userId}/${reportId}-${Date.now()}.webm`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setError(`Failed to upload recording: ${uploadError.message}`);
        return null;
      }

      // Get the signed URL for the uploaded file
      const { data: urlData, error: urlError } = await supabase.storage
        .from('recordings')
        .createSignedUrl((uploadData as any)?.path, 60 * 60 * 24 * 365); // 1 year validity

      if (urlError) {
        console.error('Signed URL error:', urlError);
        setError('Failed to create download URL');
        return null;
      }

      return (urlData as any)?.signedUrl || null;
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
