import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl } from "@/lib/apiClient";

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const ACCEPTED_AUDIO = ".mp3,.wav,.mpeg,.m4a,.webm";
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".mpeg", ".m4a", ".webm"]);
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
]);
const UNSUPPORTED_AUDIO_FORMAT_MESSAGE =
  "Unsupported audio format. Please upload WAV, MP3, MPEG, M4A, or WEBM.";

function isSupportedAudioFile(file) {
  const fileName = String(file?.name || "").toLowerCase().trim();
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
  const mimeType = String(file?.type || "").toLowerCase().trim();

  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    return false;
  }

  if (!mimeType) {
    return true;
  }

  return SUPPORTED_AUDIO_MIME_TYPES.has(mimeType);
}

export default function MedicalAudioUploadButton({ onUploadComplete = null }) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const openFilePicker = () => {
    if (isUploading) return;
    inputRef.current?.click();
  };

  const startUpload = (file) => {
    if (!file) return;

    if (!isSupportedAudioFile(file)) {
      setIsError(true);
      setIsSuccess(false);
      setStatusText(UNSUPPORTED_AUDIO_FORMAT_MESSAGE);
      setProgress(0);
      return;
    }

    setIsUploading(true);
    setIsError(false);
    setIsSuccess(false);
    setStatusText("Uploading audio...");
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiBaseUrl()}/api/medical/audio-upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      setProgress(value);
      setStatusText(`Uploading... ${value}%`);
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setIsError(true);
      setIsSuccess(false);
      setStatusText("Upload failed. Network error.");
    };

    xhr.onload = async () => {
      setIsUploading(false);
      const payload = parseJson(xhr.responseText);

      if (xhr.status >= 200 && xhr.status < 300) {
        setIsSuccess(true);
        setIsError(false);
        setProgress(100);
        setStatusText(
          payload?.upload_id
            ? `Uploaded (${payload.upload_id})`
            : "Uploaded successfully"
        );

        if (typeof onUploadComplete === "function") {
          setIsSuccess(false);
          setIsError(false);
          setStatusText("Processing uploaded audio...");

          try {
            await onUploadComplete({ file, payload });
            setIsSuccess(true);
            setIsError(false);
            setStatusText(
              payload?.upload_id
                ? `Uploaded (${payload.upload_id})`
                : "Uploaded successfully"
            );
          } catch (error) {
            setIsSuccess(false);
            setIsError(true);
            setStatusText(
              error instanceof Error
                ? error.message
                : "Uploaded audio transcription failed."
            );
          }
        }
        return;
      }

      setIsSuccess(false);
      setIsError(true);
      setStatusText(payload?.error?.message || "Upload failed.");
    };

    const formData = new FormData();
    formData.append("audio", file);
    xhr.send(formData);
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    startUpload(selectedFile);
    event.target.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_AUDIO}
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        type="button"
        onClick={openFilePicker}
        disabled={isUploading}
        variant="outline"
        className="gap-2 min-w-[160px]"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload Audio
          </>
        )}
      </Button>

      {statusText ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          ) : isError ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : null}
          <span>{statusText}</span>
          {isUploading ? <span>({progress}%)</span> : null}
        </div>
      ) : null}
    </div>
  );
}
