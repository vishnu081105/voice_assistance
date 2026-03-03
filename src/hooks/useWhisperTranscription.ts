import { useState, useCallback } from "react";
import { getAccessToken } from "@/lib/apiClient";

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

const MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

function createTimeoutController(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

export function useWhisperTranscription(): UseWhisperTranscriptionReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const transcribe = useCallback(async (audioBlob: Blob): Promise<WhisperTranscriptionResult | null> => {
    if (!audioBlob || audioBlob.size === 0) {
      setError("No audio data to transcribe");
      return null;
    }
    if (audioBlob.size > MAX_AUDIO_FILE_SIZE) {
      setError("Audio file is too large. Maximum supported size is 100MB.");
      return null;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress("Preparing audio...");

    try {
      const authToken = getAccessToken();
      if (!authToken) {
        throw new Error("User not authenticated");
      }

      const mimeType = audioBlob.type || "";
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("mp3")) extension = "mp3";
      else if (mimeType.includes("wav")) extension = "wav";
      else if (mimeType.includes("ogg")) extension = "ogg";

      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${extension}`);
      formData.append("language", "en");

      setProgress("Uploading audio...");
      console.log('[whisper] Uploading audio for transcription...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const controller = createTimeoutController(TRANSCRIPTION_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/whisper-transcribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: formData,
          signal: controller.signal,
        });
      } finally {
        controller.clear();
      }

      const raw = await response.text().catch(() => "");
      let dataJson: any = null;
      try {
        dataJson = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Transcription function returned invalid response: ${raw || "empty response"}`);
      }

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limit exceeded. Please wait and try again.");
        if (response.status === 401) throw new Error("Authentication failed (401).");
        if (response.status === 402) throw new Error("Usage limit reached (402).");
        if (response.status === 413) throw new Error("Audio file too large.");
        throw new Error(
          `Transcription failed (${response.status}) ${
            dataJson?.error || response.statusText || "Unknown error"
          }`
        );
      }

      const transcriptionText = typeof dataJson?.text === "string" ? dataJson.text.trim() : "";
      if (!transcriptionText) {
        throw new Error("No transcription received from Whisper");
      }

      setProgress("Finalizing transcription...");

      const durationValue = Number(dataJson?.duration || 0);
      const duration = Number.isFinite(durationValue) ? durationValue : 0;
      const segments = Array.isArray(dataJson?.segments) ? dataJson.segments : [];

      setProgress("Complete");

      return {
        text: transcriptionText,
        duration,
        language: typeof dataJson?.language === "string" ? dataJson.language : "en",
        segments,
      };
    } catch (err) {
      console.error("Whisper transcription error:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Transcription request timed out. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to transcribe audio");
      }
      return null;
    } finally {
      setIsTranscribing(false);
      setTimeout(() => setProgress(""), 1500);
    }
  }, []);

  return {
    transcribe,
    isTranscribing,
    error,
    progress,
  };
}
