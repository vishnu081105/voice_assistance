import { getApiBaseUrl } from '@/lib/apiClient';

export interface MedicalTranscriptEntry {
  speaker: 'Doctor' | 'Patient' | 'Unknown';
  text: string;
  start_time: string;
  end_time: string;
}

export interface MedicalStatusPayload {
  upload_id: string;
  status: string;
  processing_status: string;
  upload_time?: string;
  filename?: string;
  transcript_available?: boolean;
  report_available?: boolean;
  confidence_score?: number | null;
  review_required?: boolean;
  validation_status?: string | null;
  report_record_id?: string | null;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  } | null;
}

export interface MedicalTranscriptPayload {
  upload_id: string;
  status: string;
  transcript: MedicalTranscriptEntry[];
  raw_transcript_text?: string;
  corrected_transcript_text?: string;
  confidence_score?: number | null;
  review_required?: boolean;
  validation_status?: string | null;
  validation_issues?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    reason?: string;
  }>;
  report_record_id?: string | null;
}

export interface MedicalUploadResponse {
  upload_id: string;
  status: 'uploaded';
}

export interface MedicalReportPayload {
  upload_id: string;
  status: string;
  report: Record<string, unknown>;
  report_record_id?: string | null;
}

export interface MedicalTranscriptReviewPayload {
  upload_id: string;
  status: string;
  transcript: MedicalTranscriptEntry[];
  corrected_transcript_text: string;
  confidence_score?: number | null;
  review_required?: boolean;
  validation_status?: string | null;
  validation_issues?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    reason?: string;
  }>;
  report?: Record<string, unknown>;
  report_record_id?: string | null;
}

export interface MedicalStreamEventPayload {
  channel?: string;
  upload_id?: string;
  status?: string;
  progress?: number;
  transcript_count?: number;
  chunk?: MedicalTranscriptEntry;
  transcript?: MedicalTranscriptEntry[];
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
  [key: string]: unknown;
}

type StreamEventHandlers = {
  onStarted?: (payload: MedicalStreamEventPayload) => void;
  onUpdate?: (payload: MedicalStreamEventPayload) => void;
  onCompleted?: (payload: MedicalStreamEventPayload) => void;
  onError?: (error: Error) => void;
};

async function parseJsonResponse(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

async function requestMedical<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: BodyInit;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const json = await parseJsonResponse(response);
  if (!response.ok) {
    const message =
      json?.error?.message || json?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

export async function uploadMedicalAudio(file: File): Promise<MedicalUploadResponse> {
  const supportedExtensions = ['.wav', '.mp3', '.mpeg', '.m4a', '.webm'];
  const extension = supportedExtensions.some((suffix) => file.name.toLowerCase().endsWith(suffix));
  if (!extension) {
    throw new Error('Only WAV, MP3, MPEG, M4A, or WEBM files are allowed');
  }
  const formData = new FormData();
  formData.append('audio', file);
  return requestMedical<MedicalUploadResponse>('/api/medical/audio-upload', {
    method: 'POST',
    body: formData,
  });
}

export async function getMedicalStatus(uploadId: string): Promise<MedicalStatusPayload> {
  return requestMedical<MedicalStatusPayload>(`/api/medical/status/${encodeURIComponent(uploadId)}`);
}

export async function getMedicalTranscript(uploadId: string): Promise<MedicalTranscriptPayload> {
  return requestMedical<MedicalTranscriptPayload>(`/api/medical/transcript/${encodeURIComponent(uploadId)}`);
}

export async function getMedicalReport(uploadId: string): Promise<MedicalReportPayload> {
  return requestMedical<MedicalReportPayload>(`/api/medical/report/${encodeURIComponent(uploadId)}`);
}

export async function updateMedicalTranscript(
  uploadId: string,
  transcriptText: string
): Promise<MedicalTranscriptReviewPayload> {
  return requestMedical<MedicalTranscriptReviewPayload>(
    `/api/medical/transcript/${encodeURIComponent(uploadId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript_text: transcriptText,
      }),
    }
  );
}

export async function downloadMedicalReport(uploadId: string, format: 'json' | 'html' = 'json') {
  const response = await fetch(
    `${getApiBaseUrl()}/api/medical/report/${encodeURIComponent(uploadId)}?format=${format}&download=1`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const json = await parseJsonResponse(response);
    const message =
      json?.error?.message || json?.error || `Download failed with status ${response.status}`;
    throw new Error(message);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${uploadId}-clinical-report.${format === 'html' ? 'html' : 'json'}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);
}

export function subscribeMedicalTranscription(
  uploadId: string,
  handlers: StreamEventHandlers
): () => void {
  const controller = new AbortController();
  const url = `${getApiBaseUrl()}/api/medical/transcript/${encodeURIComponent(uploadId)}/stream?channel=medical-transcription`;

  const run = async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const json = await parseJsonResponse(response);
        const message = json?.error?.message || json?.error || 'Unable to open transcription stream';
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex >= 0) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          separatorIndex = buffer.indexOf('\n\n');

          const lines = rawEvent.split(/\r?\n/);
          let eventType = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (dataLines.length === 0) continue;
          const rawData = dataLines.join('\n');
          let payload: MedicalStreamEventPayload;
          try {
            payload = JSON.parse(rawData) as MedicalStreamEventPayload;
          } catch {
            payload = { raw: rawData };
          }

          if (eventType === 'TRANSCRIPTION_STARTED') {
            handlers.onStarted?.(payload);
          } else if (eventType === 'TRANSCRIPTION_UPDATE') {
            handlers.onUpdate?.(payload);
          } else if (eventType === 'TRANSCRIPTION_COMPLETED') {
            handlers.onCompleted?.(payload);
          }
        }
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      handlers.onError?.(error as Error);
    }
  };

  void run();

  return () => {
    controller.abort();
  };
}
