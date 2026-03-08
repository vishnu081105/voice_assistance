export type UploadAudioTranscriptionUpdate = {
  status: "processing" | "completed";
  text: string;
  chunkIndex: number;
  totalChunks: number;
  progress: number;
};

type UploadAudioTranscriptionParams = {
  file: File;
};

type UploadAudioTranscriptionResult = {
  text: string;
  totalChunks: number;
  durationSeconds: number;
};

export const uploadAudioTranscriptionService = {
  async transcribeUploadedAudio(
    _params: UploadAudioTranscriptionParams
  ): Promise<UploadAudioTranscriptionResult> {
    throw new Error("Client-side upload transcription has been removed. Use the server-side medical upload pipeline.");
  },
};
