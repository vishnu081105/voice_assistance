import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  downloadMedicalReport,
  getMedicalReport,
  getMedicalStatus,
  getMedicalTranscript,
  MedicalTranscriptEntry,
  subscribeMedicalTranscription,
  updateMedicalTranscript,
  uploadMedicalAudio,
} from '@/lib/repositories/medical.repository';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertCircle,
  AudioLines,
  Download,
  FileText,
  Loader2,
  RefreshCcw,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const terminalStatuses = new Set(['completed', 'failed']);

function prettyStatus(value: string) {
  return value
    .replaceAll('_', ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'uploaded' || status === 'queued') return 'secondary';
  return 'outline';
}

function buildReviewTextFromEntries(entries: MedicalTranscriptEntry[]) {
  return entries
    .map((entry) => {
      const text = String(entry?.text || '').trim();
      if (!text) return '';
      return `${String(entry?.speaker || 'Unknown').toUpperCase()}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatMedicalReportPreview(report: Record<string, unknown> | null) {
  if (!report || typeof report !== 'object') return '';

  const directContent = typeof report.report_content === 'string' ? report.report_content.trim() : '';
  if (directContent) return directContent;

  const structuredReport =
    report.structured_report && typeof report.structured_report === 'object'
      ? (report.structured_report as Record<string, unknown>)
      : null;
  const structuredContent =
    structuredReport && typeof structuredReport.report_content === 'string'
      ? structuredReport.report_content.trim()
      : '';
  if (structuredContent) return structuredContent;

  return JSON.stringify(report, null, 2);
}

export default function MedicalAudioAnalysis() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const streamUnsubscribeRef = useRef<null | (() => void)>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState('');
  const [status, setStatus] = useState('idle');
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [transcript, setTranscript] = useState<MedicalTranscriptEntry[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [isReviewDirty, setIsReviewDirty] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [validationStatus, setValidationStatus] = useState('');
  const [validationIssues, setValidationIssues] = useState<
    Array<{ type?: string; severity?: string; message?: string; reason?: string }>
  >([]);
  const [reportPreview, setReportPreview] = useState('');
  const [reportRecordId, setReportRecordId] = useState<string | null>(null);

  const canDownload = status === 'completed' && Boolean(uploadId);
  const transcriptCount = transcript.length;

  const sortedTranscript = useMemo(() => {
    return [...transcript].sort((a, b) => {
      return a.start_time.localeCompare(b.start_time);
    });
  }, [transcript]);

  const applyTranscriptState = ({
    transcriptEntries,
    correctedTranscriptText,
    reviewRequiredValue,
    confidenceScoreValue,
    validationStatusValue,
    validationIssuesValue,
    reportRecordIdValue,
  }: {
    transcriptEntries: MedicalTranscriptEntry[];
    correctedTranscriptText?: string;
    reviewRequiredValue?: boolean;
    confidenceScoreValue?: number | null;
    validationStatusValue?: string | null;
    validationIssuesValue?: Array<{ type?: string; severity?: string; message?: string; reason?: string }>;
    reportRecordIdValue?: string | null;
  }) => {
    setTranscript(transcriptEntries);
    setReviewRequired(Boolean(reviewRequiredValue));
    setConfidenceScore(
      confidenceScoreValue === null || confidenceScoreValue === undefined
        ? null
        : Number(confidenceScoreValue)
    );
    setValidationStatus(String(validationStatusValue || ''));
    setValidationIssues(Array.isArray(validationIssuesValue) ? validationIssuesValue : []);
    setReportRecordId(reportRecordIdValue || null);

    if (!isReviewDirty || !reviewText.trim()) {
      const nextReviewText =
        String(correctedTranscriptText || '').trim() || buildReviewTextFromEntries(transcriptEntries);
      setReviewText(nextReviewText);
    }
  };

  const loadReportPreview = async (id: string) => {
    const reportPayload = await getMedicalReport(id);
    setReportPreview(formatMedicalReportPreview(reportPayload.report));
    setReportRecordId(reportPayload.report_record_id || null);
  };

  const startStream = (id: string) => {
    if (streamUnsubscribeRef.current) {
      streamUnsubscribeRef.current();
      streamUnsubscribeRef.current = null;
    }

    streamUnsubscribeRef.current = subscribeMedicalTranscription(id, {
      onStarted: (payload) => {
        if (payload?.status) {
          setStatus(String(payload.status));
        }
      },
      onUpdate: (payload) => {
        if (payload?.status) {
          setStatus(String(payload.status));
        }
        if (Array.isArray(payload?.transcript)) {
          applyTranscriptState({
            transcriptEntries: payload.transcript,
          });
          return;
        }
        if (payload?.chunk) {
          setTranscript((prev) => [...prev, payload.chunk]);
        }
      },
      onCompleted: (payload) => {
        if (payload?.status) {
          setStatus(String(payload.status));
        }
        if (payload?.error?.message) {
          setErrorMessage(String(payload.error.message));
        }
        if (payload?.status === 'completed') {
          void refreshStatus(id);
        }
      },
      onError: (error) => {
        setErrorMessage(error.message);
      },
    });
  };

  const refreshStatus = async (id: string) => {
    const state = await getMedicalStatus(id);
    if (state?.status) {
      setStatus(state.status);
    }
    setReviewRequired(Boolean(state?.review_required));
    setConfidenceScore(
      state?.confidence_score === null || state?.confidence_score === undefined
        ? null
        : Number(state.confidence_score)
    );
    setValidationStatus(String(state?.validation_status || ''));
    setReportRecordId(state?.report_record_id || null);
    if (state?.error?.message) {
      setErrorMessage(state.error.message);
    }
    if (state?.transcript_available) {
      const transcriptPayload = await getMedicalTranscript(id);
      applyTranscriptState({
        transcriptEntries: Array.isArray(transcriptPayload.transcript) ? transcriptPayload.transcript : [],
        correctedTranscriptText: transcriptPayload.corrected_transcript_text,
        reviewRequiredValue: transcriptPayload.review_required,
        confidenceScoreValue: transcriptPayload.confidence_score,
        validationStatusValue: transcriptPayload.validation_status,
        validationIssuesValue: transcriptPayload.validation_issues,
        reportRecordIdValue: transcriptPayload.report_record_id,
      });
    }
    if (state?.report_available) {
      await loadReportPreview(id);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Select a WAV, MP3, MPEG, M4A, or WEBM file to continue.',
      });
      return;
    }

    if (![ '.wav', '.mp3', '.mpeg', '.m4a', '.webm' ].some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
      toast({
        variant: 'destructive',
        title: 'Unsupported format',
        description: 'Only WAV, MP3, MPEG, M4A, or WEBM files are accepted.',
      });
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setTranscript([]);
    setReviewText('');
    setIsReviewDirty(false);
    setValidationIssues([]);
    setValidationStatus('');
    setConfidenceScore(null);
    setReviewRequired(false);
    setReportPreview('');
    setReportRecordId(null);
    setStatus('uploading');

    try {
      const response = await uploadMedicalAudio(file);
      setUploadId(response.upload_id);
      setStatus(response.status);
      startStream(response.upload_id);

      toast({
        title: 'Upload successful',
        description: `Session ${response.upload_id} queued for processing.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      setStatus('failed');
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveReview = async () => {
    if (!uploadId || !reviewText.trim()) return;

    setIsSavingReview(true);
    setErrorMessage('');
    try {
      const response = await updateMedicalTranscript(uploadId, reviewText);
      applyTranscriptState({
        transcriptEntries: Array.isArray(response.transcript) ? response.transcript : [],
        correctedTranscriptText: response.corrected_transcript_text,
        reviewRequiredValue: response.review_required,
        confidenceScoreValue: response.confidence_score,
        validationStatusValue: response.validation_status,
        validationIssuesValue: response.validation_issues,
        reportRecordIdValue: response.report_record_id,
      });
      setReportPreview(formatMedicalReportPreview(response.report || null));
      setStatus(response.status || 'completed');
      setIsReviewDirty(false);
      toast({
        title: 'Transcript reviewed',
        description: 'The reviewed transcript was saved and the report was regenerated.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save transcript review';
      setErrorMessage(message);
      toast({
        variant: 'destructive',
        title: 'Review update failed',
        description: message,
      });
    } finally {
      setIsSavingReview(false);
    }
  };

  const handleDownload = async (format: 'json' | 'html') => {
    if (!uploadId) return;
    setIsDownloading(true);
    try {
      await downloadMedicalReport(uploadId, format);
      toast({
        title: 'Download started',
        description: `Clinical report (${format.toUpperCase()}) is downloading.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: message,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!uploadId) return;

    let canceled = false;
    const interval = setInterval(() => {
      if (canceled) return;
      if (terminalStatuses.has(status)) return;
      void refreshStatus(uploadId);
    }, 3000);

    void refreshStatus(uploadId);

    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [uploadId, status]);

  useEffect(() => {
    return () => {
      if (streamUnsubscribeRef.current) {
        streamUnsubscribeRef.current();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-6xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Medical Audio Analysis</h1>
          <p className="mt-2 text-muted-foreground">
            Upload doctor-patient audio to generate speaker-separated transcription and a clinical report.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AudioLines className="h-5 w-5 text-primary" />
                Upload Audio
              </CardTitle>
              <CardDescription>Accepted formats: WAV, MP3, MPEG, M4A, WEBM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="file"
                accept=".wav,.mp3,.mpeg,.m4a,.webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,audio/webm"
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  setFile(selected);
                }}
              />
              <Button onClick={handleUpload} disabled={isUploading || !file} className="w-full gap-2">
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload and Process
                  </>
                )}
              </Button>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={statusVariant(status)}>{prettyStatus(status)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Session</span>
                  <span className="text-xs font-mono text-right break-all">
                    {uploadId || 'Not started'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Transcript Segments</span>
                  <span className="text-sm font-medium">{transcriptCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="text-sm font-medium">
                    {confidenceScore === null ? 'N/A' : `${Math.round(confidenceScore * 100)}%`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={!uploadId || isUploading}
                  onClick={() => {
                    if (!uploadId) return;
                    void refreshStatus(uploadId);
                  }}
                  className="gap-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  variant="default"
                  disabled={!canDownload || isDownloading}
                  onClick={() => void handleDownload('json')}
                  className="gap-2"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  JSON
                </Button>
              </div>

              <Button
                variant="secondary"
                disabled={!canDownload || isDownloading}
                onClick={() => void handleDownload('html')}
                className="w-full gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF-ready HTML
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Live Transcription Viewer
              </CardTitle>
              <CardDescription>
                Channel: <span className="font-mono">medical-transcription</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Processing Error</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <ScrollArea className="h-[480px] rounded-lg border p-4">
                {sortedTranscript.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No transcript yet. Upload audio to start processing.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sortedTranscript.map((entry, index) => (
                      <div
                        key={`${entry.start_time}-${entry.end_time}-${index}`}
                        className={cn(
                          'rounded-md border p-3 text-sm',
                          entry.speaker === 'Doctor' && 'border-primary/30 bg-primary/5',
                          entry.speaker === 'Patient' && 'border-blue-500/30 bg-blue-500/5',
                          entry.speaker === 'Unknown' && 'border-muted bg-muted/20'
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <Badge
                            variant={entry.speaker === 'Doctor' ? 'default' : 'secondary'}
                            className={cn(entry.speaker === 'Unknown' && 'bg-muted text-muted-foreground')}
                          >
                            {entry.speaker}
                          </Badge>
                          <span className="font-mono text-muted-foreground">
                            {entry.start_time} - {entry.end_time}
                          </span>
                        </div>
                        <p className="leading-relaxed">{entry.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Doctor Review</h3>
                  {validationStatus ? (
                    <Badge variant={reviewRequired ? 'destructive' : 'secondary'}>
                      {prettyStatus(validationStatus)}
                    </Badge>
                  ) : null}
                  {reviewRequired ? <Badge variant="destructive">Review Required</Badge> : null}
                </div>

                <Textarea
                  value={reviewText}
                  onChange={(event) => {
                    setReviewText(event.target.value);
                    setIsReviewDirty(true);
                  }}
                  placeholder="Review and edit the transcript before finalizing the report."
                  className="min-h-[180px] font-mono text-sm"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleSaveReview()}
                    disabled={!uploadId || !reviewText.trim() || isSavingReview}
                    className="gap-2"
                  >
                    {isSavingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Save Review and Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!reportRecordId}
                    onClick={() => {
                      if (!reportRecordId) return;
                      navigate(`/report/${reportRecordId}`);
                    }}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Open Saved Report
                  </Button>
                </div>

                {validationIssues.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Validation Notes</p>
                    <div className="space-y-2">
                      {validationIssues.map((issue, index) => (
                        <div key={`${issue.type || 'issue'}-${index}`} className="rounded-md border p-3 text-sm">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge variant={issue.severity === 'warning' ? 'destructive' : 'outline'}>
                              {issue.type || 'validation'}
                            </Badge>
                            {issue.reason ? (
                              <span className="text-xs text-muted-foreground">{issue.reason}</span>
                            ) : null}
                          </div>
                          <p>{issue.message || 'Review note available.'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {reportPreview ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Generated Report Preview</p>
                      <span className="text-xs text-muted-foreground">
                        Use the saved report view for PDF and DOCX download.
                      </span>
                    </div>
                    <ScrollArea className="h-[260px] rounded-lg border bg-secondary/20 p-4">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{reportPreview}</div>
                    </ScrollArea>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
