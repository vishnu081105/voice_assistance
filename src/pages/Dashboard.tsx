import { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { AudioWaveform } from '@/components/AudioWaveform';
import { ReportTypeSelector } from '@/components/ReportTypeSelector';
import { TranscriptionEditor } from '@/components/TranscriptionEditor';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Mic, Square, Sparkles, Loader2, Save, RotateCcw, AlertCircle, Edit, Wand2, 
  Users, Play, Pause, Volume2, Zap, FileText, Search, Database, 
  Stethoscope, ClipboardList, Calendar, XCircle, Activity, User, Clock
} from 'lucide-react';
import {
  GeneratedReport,
  ReportType,
  getPatientById,
  getReportStats,
  getSetting,
  saveReport,
  searchReportsByPatient,
  updateReport,
  upsertPatient,
} from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getAccessToken, getApiBaseUrl } from '@/lib/apiClient';

export default function Dashboard() {
  const [reportType, setReportType] = useState<ReportType>('general');
  const [generatedReport, setGeneratedReport] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isEditingTranscription, setIsEditingTranscription] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [patientMedicalHistory, setPatientMedicalHistory] = useState('');
  const [patientAllergies, setPatientAllergies] = useState('');
  const [patientDiagnosisHistory, setPatientDiagnosisHistory] = useState('');
  const [isPatientLookupLoading, setIsPatientLookupLoading] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [detectedSpeakers, setDetectedSpeakers] = useState<string[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [whisperTranscript, setWhisperTranscript] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [showResults, setShowResults] = useState(false);
  const [medicalCondition, setMedicalCondition] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [activeResultTab, setActiveResultTab] = useState('original');
  const [generatedStructuredReport, setGeneratedStructuredReport] = useState<GeneratedReport | null>(null);
  const [generatedReportId, setGeneratedReportId] = useState<string | null>(null);
  const [searchPatientId, setSearchPatientId] = useState('');
  const [patientRecords, setPatientRecords] = useState<any[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number | null>(null);
  const [totalPatients, setTotalPatients] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [allPatientIds, setAllPatientIds] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const patientLookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const {
    isListening,
    transcript: liveTranscript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error: speechError,
  } = useSpeechRecognition();

  const {
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    resetRecording,
    uploadRecording,
    error: recordingError,
  } = useAudioRecording();

  const {
    transcribe: whisperTranscribe,
    isTranscribing: isWhisperTranscribing,
    error: whisperError,
    progress: whisperProgress,
  } = useWhisperTranscription();

  const transcript = whisperTranscript || liveTranscript;

  // Load doctor name and fetch stats
  useEffect(() => {
    const loadSettings = async () => {
      const name = await getSetting<string>('doctorName');
      if (name) setDoctorName(name);
    };
    loadSettings();
    fetchDatabaseStats();
  }, []);

  useEffect(() => {
    if (!isEditingTranscription && !editedTranscript) {
      setEditedTranscript(transcript);
    }
  }, [transcript, isEditingTranscription, editedTranscript]);

  useEffect(() => {
    if (isListening) {
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isListening]);

  const applyPatientDetails = (patient: any) => {
    setPatientName(patient?.fullName || '');
    setPatientAge(patient?.age !== undefined && patient?.age !== null ? String(patient.age) : '');
    setPatientGender(patient?.gender || '');
    setPatientPhone(patient?.phone || '');
    setPatientAddress(patient?.address || '');
    setPatientMedicalHistory(patient?.medicalHistory || '');
    setPatientAllergies(patient?.allergies || '');
    setPatientDiagnosisHistory(patient?.diagnosisHistory || '');
  };

  const clearPatientDetails = () => {
    setPatientName('');
    setPatientAge('');
    setPatientGender('');
    setPatientPhone('');
    setPatientAddress('');
    setPatientMedicalHistory('');
    setPatientAllergies('');
    setPatientDiagnosisHistory('');
  };

  const fetchPatientDetails = async (id: string, showToast = false) => {
    const normalizedId = id.trim();
    if (!normalizedId) return;
    setIsPatientLookupLoading(true);
    try {
      const existingPatient = await getPatientById(normalizedId);
      if (existingPatient) {
        applyPatientDetails(existingPatient);
        if (showToast) {
          toast({
            title: 'Patient loaded',
            description: `Loaded existing details for ${normalizedId}.`,
          });
        }
      } else if (showToast) {
        toast({
          title: 'New patient',
          description: 'No existing record found. Enter details and continue.',
        });
      }
    } catch (err) {
      if (showToast) {
        toast({
          variant: 'destructive',
          title: 'Patient fetch failed',
          description: 'Could not fetch patient details right now.',
        });
      }
    } finally {
      setIsPatientLookupLoading(false);
    }
  };

  useEffect(() => {
    if (patientLookupTimeoutRef.current) clearTimeout(patientLookupTimeoutRef.current);
    if (!patientId.trim()) {
      clearPatientDetails();
      return;
    }
    patientLookupTimeoutRef.current = setTimeout(() => {
      fetchPatientDetails(patientId);
    }, 450);
    return () => {
      if (patientLookupTimeoutRef.current) clearTimeout(patientLookupTimeoutRef.current);
    };
  }, [patientId]);

  const fetchDatabaseStats = async () => {
    if (!user) return;
    try {
      const stats = await getReportStats();
      setTotalPatients(stats.totalPatients);
      setTotalRecords(stats.totalRecords);
      setAllPatientIds(stats.allPatientIds);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleStartRecording = async () => {
    setRecordingDuration(0);
    setGeneratedReport('');
    setGeneratedStructuredReport(null);
    setGeneratedReportId(null);
    setIsEditingTranscription(false);
    setEditedTranscript('');
    setDetectedSpeakers([]);
    setWhisperTranscript('');
    setShowResults(false);
    setMedicalCondition('');
    setTreatmentPlan('');
    setFollowupDate('');
    
    await startRecording();
    startListening();
  };

  const handleStopRecording = async () => {
    stopListening();
    const recordedBlob = await stopRecording();
    
    if (recordedBlob && recordedBlob.size > 0) {
      toast({
        title: 'Processing with Whisper AI',
        description: 'Transcribing your recording with OpenAI Whisper...',
      });
      
      const result = await whisperTranscribe(recordedBlob);
      setShowResults(true);
      if (result && result.text) {
        setWhisperTranscript(result.text);
        setEditedTranscript(result.text);
        toast({
          title: 'Whisper Transcription Complete',
          description: `Transcribed ${Math.round(result.duration)}s of audio with high accuracy.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Whisper Transcription Failed',
          description: whisperError || 'Transcription failed. You can still edit or retry.',
        });
      }
    } else {
      setShowResults(true);
    }
  };

  const handleCancelRecording = () => {
    resetTranscript();
    resetRecording();
    setShowResults(false);
    setGeneratedReport('');
    setGeneratedStructuredReport(null);
    setGeneratedReportId(null);
    setRecordingDuration(0);
    setIsEditingTranscription(false);
    setEditedTranscript('');
    setDetectedSpeakers([]);
    setWhisperTranscript('');
    setMedicalCondition('');
    setTreatmentPlan('');
    setFollowupDate('');
  };

  const handleSaveTranscriptionEdit = (text: string) => {
    setEditedTranscript(text);
    setIsEditingTranscription(false);
    toast({ title: 'Transcription saved', description: 'Your edits have been saved.' });
  };

  const upsertCurrentPatient = async () => {
    const normalizedPatientId = patientId.trim();
    if (!normalizedPatientId) return;

    const parsedAge = Number(patientAge);
    await upsertPatient({
      patientId: normalizedPatientId,
      fullName: patientName || undefined,
      age: Number.isFinite(parsedAge) && patientAge !== '' ? parsedAge : undefined,
      gender: patientGender || undefined,
      phone: patientPhone || undefined,
      address: patientAddress || undefined,
      medicalHistory: patientMedicalHistory || undefined,
      allergies: patientAllergies || undefined,
      diagnosisHistory: patientDiagnosisHistory || undefined,
    });
  };

  const handleEnhanceTranscription = async () => {
    const textToEnhance = editedTranscript || transcript;
    if (!textToEnhance.trim()) {
      toast({ variant: 'destructive', title: 'No transcription', description: 'Please record some audio first.' });
      return;
    }
    setIsEnhancing(true);
    try {
      const authToken = getAccessToken();
      if (!authToken) throw new Error('User not authenticated.');

      const response = await fetch(
        `${getApiBaseUrl()}/functions/v1/process-transcription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            transcription: textToEnhance,
            enableDiarization,
            enhanceTerminology: true,
            patient_id: patientId || undefined,
            patient_name: patientName || undefined,
          }),
        }
      );
      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limit exceeded.');
        if (response.status === 402) throw new Error('AI usage limit reached.');
        throw new Error(`Enhancement failed (${response.status})`);
      }
      const data = await response.json();
      if (data.processed) {
        setEditedTranscript(data.processed);
        if (data.speakers?.length > 0) setDetectedSpeakers(data.speakers);
        toast({ title: 'Transcription Enhanced', description: 'Medical terminology corrected.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Enhancement failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handlePlayAudio = () => {
    if (!audioUrl) return;
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => setIsPlayingAudio(false);
    }
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const currentTranscript = editedTranscript || transcript;
  const hasTranscription = currentTranscript.trim().length > 0;
  const wordCount = (currentTranscript + ' ' + interimTranscript).trim().split(/\s+/).filter(Boolean).length;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatStructuredReportText = (report: GeneratedReport) => {
    return [
      `Summary:\n${report.summary || 'N/A'}`,
      `Symptoms:\n${report.symptoms.length > 0 ? report.symptoms.map((item) => `- ${item}`).join('\n') : '- N/A'}`,
      `Diagnosis:\n${report.diagnosis || 'N/A'}`,
      `Treatment Plan:\n${report.treatment_plan || 'N/A'}`,
      `Recommendations:\n${report.recommendations.length > 0 ? report.recommendations.map((item) => `- ${item}`).join('\n') : '- N/A'}`,
    ].join('\n\n');
  };

  const generateReport = async () => {
    const textToProcess = editedTranscript || transcript;
    if (!textToProcess.trim()) {
      toast({ variant: 'destructive', title: 'No transcription', description: 'Please record some audio first.' });
      return;
    }
    setIsGenerating(true);
    setGeneratedReport('');
    setGeneratedStructuredReport(null);
    setGeneratedReportId(null);

    try {
      if (patientId.trim()) {
        await upsertCurrentPatient();
      }

      const authToken2 = getAccessToken();
      if (!authToken2) throw new Error('User not authenticated.');

      const response = await fetch(
        `${getApiBaseUrl()}/functions/v1/generate-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken2}`,
          },
          body: JSON.stringify({
            transcription: textToProcess,
            reportType,
            patient_id: patientId || undefined,
            doctor_id: doctorId || undefined,
            doctor_name: doctorName || undefined,
            patient_details: {
              patient_id: patientId || undefined,
              full_name: patientName || undefined,
              age: patientAge ? Number(patientAge) : undefined,
              gender: patientGender || undefined,
              phone: patientPhone || undefined,
              address: patientAddress || undefined,
              medical_history: patientMedicalHistory || undefined,
              allergies: patientAllergies || undefined,
              diagnosis_history: patientDiagnosisHistory || undefined,
            },
            doctor_details: {
              doctor_id: doctorId || undefined,
              doctor_name: doctorName || undefined,
            },
            persist: true,
          }),
        }
      );

      const rawBody = await response.text().catch(() => '');
      let responseData: any = {};
      try {
        responseData = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new Error(`Invalid AI response: ${rawBody || 'empty response'}`);
      }

      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limit exceeded.');
        if (response.status === 402) throw new Error('AI usage limit reached.');
        const serverMessage = responseData?.error?.message || responseData?.error || `Failed to generate report (${response.status})`;
        throw new Error(serverMessage);
      }

      const structured: GeneratedReport = {
        summary: typeof responseData.summary === 'string' ? responseData.summary : '',
        symptoms: Array.isArray(responseData.symptoms) ? responseData.symptoms.filter((item: any) => typeof item === 'string') : [],
        diagnosis: typeof responseData.diagnosis === 'string' ? responseData.diagnosis : '',
        treatment_plan: typeof responseData.treatment_plan === 'string' ? responseData.treatment_plan : '',
        recommendations: Array.isArray(responseData.recommendations)
          ? responseData.recommendations.filter((item: any) => typeof item === 'string')
          : [],
      };

      const hasGeneratedContent =
        Boolean(structured.summary) ||
        Boolean(structured.diagnosis) ||
        Boolean(structured.treatment_plan) ||
        structured.symptoms.length > 0 ||
        structured.recommendations.length > 0;

      if (!hasGeneratedContent) {
        throw new Error('Generated report is empty.');
      }

      setGeneratedStructuredReport(structured);
      const reportText =
        typeof responseData.report_content === 'string' && responseData.report_content.trim()
          ? responseData.report_content
          : formatStructuredReportText(structured);
      setGeneratedReport(reportText);
      setGeneratedReportId(typeof responseData.report_id === 'string' ? responseData.report_id : null);
      setShowResults(true);
      setActiveResultTab('report');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReport = async () => {
    if (!generatedReport.trim()) {
      toast({ variant: 'destructive', title: 'No report', description: 'Generate a report first.' });
      return;
    }
    try {
      await upsertCurrentPatient();

      const report = {
        transcription: editedTranscript || transcript,
        reportContent: generatedReport,
        reportType,
        duration: recordingDuration,
        wordCount,
        patientId: patientId || undefined,
        doctorId: doctorId || undefined,
        doctorName: doctorName || doctorId || undefined,
        generatedReport: generatedStructuredReport || undefined,
        audioUrl: undefined as string | undefined,
      };

      let reportId = generatedReportId;
      if (reportId) {
        await updateReport(reportId, report);
      } else {
        reportId = await saveReport(report);
      }

      if (audioBlob && reportId) {
        const uploadedUrl = await uploadRecording(reportId);
        if (uploadedUrl) await updateReport(reportId, { audioUrl: uploadedUrl });
      }
      toast({ title: 'Recording saved!', description: 'Saved to patient records.' });
      handleCancelRecording();
      fetchDatabaseStats();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Failed to save report.',
      });
    }
  };

  const handleSearchPatient = async () => {
    if (!searchPatientId.trim()) return;
    try {
      const data = await searchReportsByPatient(searchPatientId);
      if (data && data.length > 0) {
        setPatientRecords(data);
        setSelectedRecordIndex(null);
        toast({ title: 'Records Found', description: `Found ${data.length} records for Patient ${searchPatientId}` });
      } else {
        setPatientRecords([]);
        toast({ variant: 'destructive', title: 'No Records', description: `No records found for Patient ${searchPatientId}` });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Search failed', description: 'Could not search patient records.' });
    }
  };

  const error = speechError || recordingError;

  if (!isSupported) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-6xl py-8">
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Speech Recognition Not Supported</h2>
              <p className="text-center text-muted-foreground">Please use Chrome, Edge, or Safari.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-[1400px] py-6 px-4">
        {/* App Header - matching the HTML design */}
        <div className="rounded-xl bg-gradient-to-r from-primary to-[hsl(217,89%,61%)] text-primary-foreground p-6 mb-6 shadow-lg">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Hospital Voice Recording System</h1>
              <p className="opacity-90 text-sm">Secure medical documentation through voice recording and transcription</p>
            </div>
            {isWhisperTranscribing && (
              <Badge className="ml-auto bg-primary-foreground/20 text-primary-foreground gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {whisperProgress}
              </Badge>
            )}
          </div>
        </div>

        {/* Main Tabs - Recording & Patient Records */}
        <Tabs defaultValue="recording" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="recording" className="gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4" />
              Recording
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4" />
              Patient Records
            </TabsTrigger>
          </TabsList>

          {/* ==================== RECORDING TAB ==================== */}
          <TabsContent value="recording" className="space-y-4">
            <Card>
              <CardHeader className="bg-gradient-to-r from-primary to-[hsl(217,89%,61%)] text-primary-foreground rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-5 w-5" />
                  Record Doctor's Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Patient & Doctor ID Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-semibold text-muted-foreground">
                      <User className="h-4 w-4" />
                      Patient ID
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter patient ID"
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value)}
                        onBlur={() => fetchPatientDetails(patientId, true)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => fetchPatientDetails(patientId, true)}
                        disabled={isPatientLookupLoading || !patientId.trim()}
                      >
                        {isPatientLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Input
                      placeholder="Patient name"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-semibold text-muted-foreground">
                      <Stethoscope className="h-4 w-4" />
                      Doctor ID
                    </Label>
                    <Input 
                      placeholder="Enter doctor ID" 
                      value={doctorId} 
                      onChange={(e) => setDoctorId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Age</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Age"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Gender</Label>
                    <Select value={patientGender || undefined} onValueChange={setPatientGender}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-semibold text-muted-foreground">Phone</Label>
                    <Input
                      placeholder="Phone number"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold text-muted-foreground">Address</Label>
                  <Textarea
                    rows={2}
                    placeholder="Address"
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Medical History</Label>
                    <Textarea
                      rows={3}
                      placeholder="Medical history"
                      value={patientMedicalHistory}
                      onChange={(e) => setPatientMedicalHistory(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Allergies</Label>
                    <Textarea
                      rows={3}
                      placeholder="Allergies"
                      value={patientAllergies}
                      onChange={(e) => setPatientAllergies(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Diagnosis History</Label>
                    <Textarea
                      rows={3}
                      placeholder="Diagnosis history"
                      value={patientDiagnosisHistory}
                      onChange={(e) => setPatientDiagnosisHistory(e.target.value)}
                    />
                  </div>
                </div>

                {/* Source Language */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-semibold text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Source Language
                    </Label>
                    <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto Detect</SelectItem>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="Tamil">Tamil</SelectItem>
                        <SelectItem value="Chinese">Chinese</SelectItem>
                        <SelectItem value="Arabic">Arabic</SelectItem>
                        <SelectItem value="Japanese">Japanese</SelectItem>
                        <SelectItem value="German">German</SelectItem>
                        <SelectItem value="Portuguese">Portuguese</SelectItem>
                        <SelectItem value="Russian">Russian</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-semibold text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Duration
                    </Label>
                    <div className={cn(
                      "flex items-center justify-center h-10 rounded-md border px-4 text-2xl font-mono font-bold tabular-nums",
                      isListening && "text-destructive border-destructive/50 bg-destructive/5"
                    )}>
                      {formatDuration(recordingDuration)}
                    </div>
                  </div>
                </div>

                {/* Waveform */}
                <AudioWaveform isRecording={isListening} />

                {/* Recording Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {!isListening ? (
                    <Button
                      onClick={handleStartRecording}
                      className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground min-w-[160px]"
                    >
                      <Mic className="h-4 w-4" />
                      Start Recording
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStopRecording}
                      variant="secondary"
                      className="gap-2 min-w-[160px]"
                    >
                      <Square className="h-4 w-4" />
                      Stop Recording
                    </Button>
                  )}
                  
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md text-sm">
                    {isListening ? (
                      <>
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive"></span>
                        </span>
                        <span className="text-muted-foreground">Recording... {wordCount} words</span>
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4 text-accent" />
                        <span className="text-muted-foreground">Ready to record</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Live transcription during recording */}
                {isListening && (transcript || interimTranscript) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="flex items-center gap-2 mb-2 font-semibold text-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive"></span>
                      </span>
                      Live Transcription
                    </h4>
                    <div className="font-mono text-sm whitespace-pre-wrap min-h-[60px] max-h-[200px] overflow-y-auto">
                      {transcript}
                      {interimTranscript && <span className="text-muted-foreground italic">{interimTranscript}</span>}
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                {/* ===== RECORDING RESULTS ===== */}
                {!isListening && (
                  <>
                    <div className="border-t pt-4" />
                    <h3 className="flex items-center gap-2 font-semibold text-lg border-l-4 border-primary pl-3">
                      <FileText className="h-5 w-5 text-primary" />
                      Recording Results
                    </h3>

                    {/* Action buttons */}
                    <div className="flex flex-wrap justify-between gap-2">
                      <Button variant="outline" onClick={handleCancelRecording} className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/5">
                        <XCircle className="h-4 w-4" />
                        Cancel Recording
                      </Button>
                      <Button onClick={handleSaveReport} disabled={!generatedReport} className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Save className="h-4 w-4" />
                        Save to Patient Records
                      </Button>
                    </div>

                    {/* Results Tabs */}
                    <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
                      <TabsList className="grid w-full grid-cols-4 md:grid-cols-5">
                        <TabsTrigger value="original" className="gap-1 text-xs">
                          <FileText className="h-3 w-3" />
                          <span className="hidden sm:inline">Original</span>
                        </TabsTrigger>
                        <TabsTrigger value="enhanced" className="gap-1 text-xs">
                          <Wand2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Enhanced</span>
                        </TabsTrigger>
                        <TabsTrigger value="summary" className="gap-1 text-xs">
                          <ClipboardList className="h-3 w-3" />
                          <span className="hidden sm:inline">Summary</span>
                        </TabsTrigger>
                        <TabsTrigger value="report" className="gap-1 text-xs">
                          <Sparkles className="h-3 w-3" />
                          <span className="hidden sm:inline">Report</span>
                        </TabsTrigger>
                        <TabsTrigger value="audio" className="gap-1 text-xs">
                          <Volume2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Audio</span>
                        </TabsTrigger>
                      </TabsList>

                      {/* Original Transcript */}
                      <TabsContent value="original" className="border rounded-b-lg p-4">
                        <h4 className="flex items-center gap-2 mb-2 font-semibold">
                          <FileText className="h-4 w-4 text-primary" />
                          Original Language Transcript
                        </h4>
                        {isEditingTranscription ? (
                          <TranscriptionEditor
                            transcription={editedTranscript || transcript}
                            onSave={handleSaveTranscriptionEdit}
                            onCancel={() => setIsEditingTranscription(false)}
                          />
                        ) : (
                          <>
                            <div className="bg-secondary/30 rounded-lg border p-4 min-h-[150px] max-h-[400px] overflow-y-auto font-mono text-sm whitespace-pre-wrap">
                              {(editedTranscript || transcript)
                                ? (editedTranscript || transcript).split('\n').map((line, i) => {
                                    const isDoc = line.startsWith('DOCTOR:');
                                    const isPat = line.startsWith('PATIENT:');
                                    if (isDoc || isPat) {
                                      return (
                                        <p key={i} className={cn("rounded px-2 py-1 mb-1", isDoc && "bg-primary/10 border-l-2 border-primary", isPat && "bg-secondary border-l-2 border-muted-foreground")}>
                                          <span className={cn("font-semibold", isDoc && "text-primary", isPat && "text-muted-foreground")}>{isDoc ? 'DOCTOR:' : 'PATIENT:'}</span>
                                          <span>{line.replace(/^(DOCTOR:|PATIENT:)/, '')}</span>
                                        </p>
                                      );
                                    }
                                    return line ? <p key={i}>{line}</p> : null;
                                  })
                                : <p className="text-muted-foreground">No transcription yet. Start recording to continue.</p>}
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button variant="outline" size="sm" onClick={() => setIsEditingTranscription(true)} className="gap-2">
                                <Edit className="h-4 w-4" />
                                Edit
                              </Button>
                              <div className="flex items-center gap-2 ml-auto">
                                <Switch id="diarization" checked={enableDiarization} onCheckedChange={setEnableDiarization} />
                                <Label htmlFor="diarization" className="text-xs cursor-pointer">Speaker Labels</Label>
                              </div>
                            </div>
                          </>
                        )}
                      </TabsContent>

                      {/* Enhanced Transcript */}
                      <TabsContent value="enhanced" className="border rounded-b-lg p-4">
                        <h4 className="flex items-center gap-2 mb-2 font-semibold">
                          <Wand2 className="h-4 w-4 text-primary" />
                          AI-Enhanced Transcript
                        </h4>
                        <Button onClick={handleEnhanceTranscription} disabled={isEnhancing || !hasTranscription} className="gap-2 mb-3">
                          {isEnhancing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><Wand2 className="h-4 w-4" /> Enhance with AI</>}
                        </Button>
                        {detectedSpeakers.length > 0 && (
                          <div className="flex items-center gap-1 mb-2 px-2 py-1 bg-primary/10 rounded-full w-fit">
                            <Users className="h-3 w-3 text-primary" />
                            <span className="text-xs text-primary font-medium">{detectedSpeakers.join(', ')}</span>
                          </div>
                        )}
                        <div className="bg-secondary/30 rounded-lg border p-4 min-h-[150px] max-h-[400px] overflow-y-auto font-mono text-sm whitespace-pre-wrap">
                          {editedTranscript || transcript || 'Click "Enhance with AI" to process the transcript.'}
                        </div>
                      </TabsContent>

                      {/* Summary */}
                      <TabsContent value="summary" className="border rounded-b-lg p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Stethoscope className="h-4 w-4" />
                              Medical Condition
                            </Label>
                            <Textarea rows={4} placeholder="Enter medical condition..." value={medicalCondition} onChange={(e) => setMedicalCondition(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <ClipboardList className="h-4 w-4" />
                              Treatment Plan
                            </Label>
                            <Textarea rows={4} placeholder="Enter treatment plan..." value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-2 mt-4">
                          <Label className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Follow-up Date
                          </Label>
                          <Input type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />
                        </div>
                      </TabsContent>

                      {/* Report Generation */}
                      <TabsContent value="report" className="border rounded-b-lg p-4 space-y-4">
                        <div className="space-y-2">
                          <Label>Report Type</Label>
                          <ReportTypeSelector selectedType={reportType} onSelect={setReportType} />
                        </div>
                        <Button onClick={generateReport} disabled={isGenerating || !hasTranscription} className="w-full gap-2 h-12 text-base btn-glow" size="lg">
                          {isGenerating ? <><Loader2 className="h-5 w-5 animate-spin" /> Generating Report...</> : <><Sparkles className="h-5 w-5" /> Generate AI Report</>}
                        </Button>
                        {generatedReport && (
                          <div className="rounded-lg border bg-secondary/30 p-4">
                            <h4 className="flex items-center gap-2 mb-3 font-semibold">
                              <Sparkles className="h-4 w-4 text-primary" />
                              Generated Report
                            </h4>
                            <ScrollArea className="h-80">
                              <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                                {generatedReport}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </TabsContent>

                      {/* Audio */}
                      <TabsContent value="audio" className="border rounded-b-lg p-4">
                        <h4 className="flex items-center gap-2 mb-2 font-semibold">
                          <Volume2 className="h-4 w-4 text-primary" />
                          Audio Recording
                        </h4>
                        {audioUrl ? (
                          <div className="space-y-3">
                            <audio controls className="w-full" src={audioUrl} />
                            <p className="text-sm text-muted-foreground">Duration: {formatDuration(recordingDuration)}</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">No audio recording available.</p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== PATIENT RECORDS TAB ==================== */}
          <TabsContent value="records" className="space-y-4">
            <Card>
              <CardHeader className="bg-gradient-to-r from-primary to-[hsl(217,89%,61%)] text-primary-foreground rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Patient Records
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Search */}
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="md:col-span-3 space-y-2">
                    <Label className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Enter Patient ID
                    </Label>
                    <Input 
                      placeholder="Search by patient ID" 
                      value={searchPatientId} 
                      onChange={(e) => setSearchPatientId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPatient()}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearchPatient} className="w-full gap-2">
                      <Search className="h-4 w-4" />
                      Search
                    </Button>
                  </div>
                </div>

                {/* Patient Records Table */}
                {patientRecords.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/30 rounded-lg text-accent-foreground">
                      <Activity className="h-4 w-4" />
                      Found {patientRecords.length} records for Patient ID: {searchPatientId}
                    </div>

                    <h3 className="flex items-center gap-2 font-semibold border-l-4 border-primary pl-3">
                      <User className="h-4 w-4" />
                      Patient Records
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-secondary/50">
                            <th className="p-3 text-left font-semibold">#</th>
                            <th className="p-3 text-left font-semibold">Date/Time</th>
                            <th className="p-3 text-left font-semibold">Doctor</th>
                            <th className="p-3 text-left font-semibold">Report Type</th>
                            <th className="p-3 text-left font-semibold">Words</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientRecords.map((record, index) => (
                            <tr 
                              key={record.id} 
                              className={cn(
                                "border-b cursor-pointer transition-colors hover:bg-secondary/30",
                                selectedRecordIndex === index && "bg-primary/5"
                              )}
                              onClick={() => setSelectedRecordIndex(index)}
                            >
                              <td className="p-3">{index + 1}</td>
                              <td className="p-3">{new Date(record.created_at).toLocaleString()}</td>
                              <td className="p-3">{record.doctor_name || 'N/A'}</td>
                              <td className="p-3">
                                <Badge variant="secondary" className="capitalize">{record.report_type}</Badge>
                              </td>
                              <td className="p-3">{record.word_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Record Details */}
                    {selectedRecordIndex !== null && patientRecords[selectedRecordIndex] && (
                      <div className="space-y-4">
                        <h3 className="flex items-center gap-2 font-semibold border-l-4 border-primary pl-3">
                          <FileText className="h-4 w-4" />
                          Record Details
                        </h3>

                        <Tabs defaultValue="overview">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="overview" className="gap-1 text-xs">
                              <FileText className="h-3 w-3" />
                              Overview
                            </TabsTrigger>
                            <TabsTrigger value="report-content" className="gap-1 text-xs">
                              <Sparkles className="h-3 w-3" />
                              Report
                            </TabsTrigger>
                            <TabsTrigger value="record-audio" className="gap-1 text-xs">
                              <Volume2 className="h-3 w-3" />
                              Audio
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="overview" className="border rounded-b-lg p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-3">
                                <div>
                                  <Label className="text-muted-foreground text-xs">Doctor</Label>
                                  <p className="font-medium">{patientRecords[selectedRecordIndex].doctor_name || 'N/A'}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground text-xs">Date/Time</Label>
                                  <p className="font-medium">{new Date(patientRecords[selectedRecordIndex].created_at).toLocaleString()}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground text-xs">Report Type</Label>
                                  <Badge variant="secondary" className="capitalize">{patientRecords[selectedRecordIndex].report_type}</Badge>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <Label className="text-muted-foreground text-xs">Duration</Label>
                                  <p className="font-medium">{formatDuration(patientRecords[selectedRecordIndex].duration)}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground text-xs">Word Count</Label>
                                  <p className="font-medium">{patientRecords[selectedRecordIndex].word_count}</p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-4">
                              <Label className="text-muted-foreground text-xs">Transcription</Label>
                              <div className="bg-secondary/30 rounded-lg border p-4 mt-1 max-h-[200px] overflow-y-auto font-mono text-sm whitespace-pre-wrap">
                                {patientRecords[selectedRecordIndex].transcription}
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="report-content" className="border rounded-b-lg p-4">
                            <ScrollArea className="h-80">
                              <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                                {patientRecords[selectedRecordIndex].report_content}
                              </div>
                            </ScrollArea>
                          </TabsContent>

                          <TabsContent value="record-audio" className="border rounded-b-lg p-4">
                            {patientRecords[selectedRecordIndex].audio_url ? (
                              <audio controls className="w-full" src={patientRecords[selectedRecordIndex].audio_url} />
                            ) : (
                              <p className="text-muted-foreground text-sm">No audio recording available for this record.</p>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </div>
                )}

                {/* Database Summary */}
                <h3 className="flex items-center gap-2 font-semibold border-l-4 border-primary pl-3">
                  <Database className="h-4 w-4" />
                  Database Summary
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="text-center">
                    <CardContent className="pt-6">
                      <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                      <h5 className="font-semibold text-sm text-muted-foreground">Total Patients</h5>
                      <p className="text-3xl font-bold">{totalPatients}</p>
                    </CardContent>
                  </Card>
                  <Card className="text-center">
                    <CardContent className="pt-6">
                      <FileText className="h-6 w-6 mx-auto mb-2 text-primary" />
                      <h5 className="font-semibold text-sm text-muted-foreground">Total Records</h5>
                      <p className="text-3xl font-bold">{totalRecords}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <h5 className="font-semibold text-sm text-muted-foreground text-center mb-3">Quick Patient Select</h5>
                      <Select onValueChange={(v) => { setSearchPatientId(v); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a patient" />
                        </SelectTrigger>
                        <SelectContent>
                          {allPatientIds.map((pid) => (
                            <SelectItem key={pid} value={pid}>{pid}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
