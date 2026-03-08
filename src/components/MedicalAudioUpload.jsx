import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/apiClient";

const ACCEPTED_AUDIO =
  ".wav,.mp3,.mpeg,.m4a,.webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/webm";

export default function MedicalAudioUpload() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Idle");
  const [uploadId, setUploadId] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const resetStateForNewUpload = () => {
    setProgress(0);
    setUploadId("");
    setErrorText("");
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    resetStateForNewUpload();
    if (!selected) {
      setStatusText("Idle");
      return;
    }

    const supported = [".wav", ".mp3", ".mpeg", ".m4a", ".webm"].some((suffix) =>
      selected.name.toLowerCase().endsWith(suffix)
    );
    if (!supported) {
      setStatusText("Invalid file");
      setErrorText("Please select a WAV, MP3, MPEG, M4A, or WEBM file.");
      return;
    }

    setStatusText("Ready to upload");
  };

  const handleUpload = () => {
    if (!file || isUploading) return;
    if (![ ".wav", ".mp3", ".mpeg", ".m4a", ".webm" ].some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
      setStatusText("Invalid file");
      setErrorText("Only WAV, MP3, MPEG, M4A, or WEBM files are supported.");
      return;
    }

    setIsUploading(true);
    setStatusText("Uploading...");
    setProgress(0);
    setUploadId("");
    setErrorText("");

    const formData = new FormData();
    formData.append("audio", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiBaseUrl()}/api/medical/audio-upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      setProgress(percent);
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setStatusText("Upload failed");
      setErrorText("Network error while uploading.");
    };

    xhr.onload = () => {
      setIsUploading(false);

      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100);
        setStatusText("Uploaded successfully");
        setUploadId(String(payload.upload_id || ""));
        return;
      }

      setStatusText("Upload failed");
      setErrorText(payload?.error?.message || "Unable to upload file.");
    };

    xhr.send(formData);
  };

  return (
    <Card className="mt-6 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Upload Doctor-Patient Audio
        </CardTitle>
        <CardDescription>
          Add a consultation recording without affecting the microphone workflow.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input type="file" accept={ACCEPTED_AUDIO} onChange={handleFileChange} />

        <Button type="button" onClick={handleUpload} disabled={!file || isUploading} className="gap-2">
          <Upload className="h-4 w-4" />
          {isUploading ? "Uploading..." : "Upload Audio"}
        </Button>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Status: {statusText}</div>
          <Progress value={progress} />
        </div>

        {uploadId ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Upload Complete</AlertTitle>
            <AlertDescription>
              File uploaded successfully. Upload ID: <span className="font-mono">{uploadId}</span>
            </AlertDescription>
          </Alert>
        ) : null}

        {errorText ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
