import { useState, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/apiClient";

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
const LOCAL_TRANSCRIBE_URL = `${getApiBaseUrl()}/api/transcribe`;

function createTimeoutController(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function parseResponseBody(raw: string) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataByteLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, Math.round(pcm), true);
    offset += bytesPerSample;
  }

  return buffer;
}

function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(audioBuffer.length);
  const channelCount = audioBuffer.numberOfChannels;
  if (channelCount <= 0) return mono;

  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      mono[sampleIndex] += channelData[sampleIndex] / channelCount;
    }
  }

  return mono;
}

async function convertAudioToLinear16Wav(audioBlob: Blob): Promise<Blob> {
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return audioBlob;
  }

  const audioContext = new AudioContextClass();
  try {
    const sourceBuffer = await audioBlob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
    const monoSamples = downmixToMono(decoded);
    const monoBuffer = audioContext.createBuffer(1, monoSamples.length, decoded.sampleRate);
    monoBuffer.copyToChannel(monoSamples, 0);

    const targetSampleRate = 16000;
    const renderedLength = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
    const offlineContext = new OfflineAudioContext(1, renderedLength, targetSampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = monoBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    const rendered = await offlineContext.startRendering();
    const renderedSamples = rendered.getChannelData(0);
    const wavBuffer = encodePcm16Wav(renderedSamples, rendered.sampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

async function buildFormData(audioBlob: Blob) {
  let wavBlob = audioBlob;
  try {
    wavBlob = await convertAudioToLinear16Wav(audioBlob);
  } catch {
    // Fall back to the original recording when browser-side normalization is unavailable.
  }
  const formData = new FormData();
  formData.append("audio", wavBlob, "recording.wav");
  formData.append("language", "en");
  return formData;
}

function mapTranscriptionResponse(data: unknown): WhisperTranscriptionResult {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text || text.trim().length === 0) {
    throw new Error("Transcription failed. Please try again.");
  }

  const durationValue = Number(payload.duration || 0);
  const duration = Number.isFinite(durationValue) ? durationValue : 0;
  const language = typeof payload.language === "string" ? payload.language : "en";

  const segments = Array.isArray(payload.segments)
    ? payload.segments
        .map((segment) => {
          const row = segment && typeof segment === "object" ? (segment as Record<string, unknown>) : {};
          return {
            start: Number.isFinite(Number(row.start)) ? Number(row.start) : 0,
            end: Number.isFinite(Number(row.end)) ? Number(row.end) : 0,
            text: typeof row.text === "string" ? row.text : "",
          };
        })
        .filter((segment) => segment.text.trim().length > 0)
    : [];

  return {
    text,
    duration,
    language,
    segments,
  };
}

function getReadableErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim();
  if (!normalized) {
    return "Transcription failed. Please try again.";
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("unsupported")) {
    return "Unsupported audio format. Please use WAV, MP3, M4A, or WEBM audio.";
  }
  if (lower.includes("too large") || lower.includes("size limit")) {
    return "Audio file exceeds the configured upload limit.";
  }
  if (lower.includes("timed out")) {
    return "Transcription timed out. Please try again.";
  }
  if (lower.includes("low confidence")) {
    return "Transcription quality is low. Please review the audio and retry if needed.";
  }
  return normalized;
}

async function requestTranscription({
  formData,
}: {
  formData: FormData;
}) {
  const controller = createTimeoutController(TRANSCRIPTION_TIMEOUT_MS);
  try {
    const response = await fetch(LOCAL_TRANSCRIBE_URL, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: controller.signal,
    });

    const raw = await response.text().catch(() => "");
    const payload = parseResponseBody(raw);

    if (!response.ok) {
      const detail = payload?.error?.message || payload?.error || payload?.detail || payload?.message;
      throw new Error(String(detail || response.statusText || "Transcription failed."));
    }

    return mapTranscriptionResponse(payload);
  } finally {
    controller.clear();
  }
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
    setProgress("Processing...");

    try {
      const result = await requestTranscription({ formData: await buildFormData(audioBlob) });
      setProgress("Complete");
      return result;
    } catch (err) {
      const message = getReadableErrorMessage(err);
      setError(message);
      throw new Error(message);
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
