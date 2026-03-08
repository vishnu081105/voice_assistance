import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { getReport, updateReport, deleteReport, Report, ReportType } from '@/lib/db';
import { downloadReportAsDOCX, downloadReportAsPDF, downloadReportAsText } from '@/utils/reportExport';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Save, Trash2, Download, Edit, FileText, ClipboardList, Stethoscope, Loader2, FileDown, ChevronDown, Play, Pause, Volume2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const typeConfig: Record<ReportType, { label: string; icon: typeof FileText; color: string }> = {
  general: { label: 'General Clinical Note', icon: FileText, color: 'bg-primary/10 text-primary' },
  soap: { label: 'SOAP Notes', icon: ClipboardList, color: 'bg-success/10 text-success' },
  diagnostic: { label: 'Surgical Pathology Report', icon: Stethoscope, color: 'bg-accent/10 text-accent' },
};

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      if (!id) return;
      
      try {
        const data = await getReport(id);
        if (data) {
          setReport(data);
          setEditedContent(data.reportContent);
        } else {
          toast({
            variant: 'destructive',
            title: 'Report not found',
            description: 'The requested report could not be found.',
          });
          navigate('/history');
        }
      } catch (err) {
        console.error('Failed to load report:', err);
        toast({
          variant: 'destructive',
          title: 'Failed to load report',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();
  }, [id, navigate, toast]);

  const handleSave = async () => {
    if (!report) return;
    
    setIsSaving(true);
    try {
      await updateReport(report.id, { reportContent: editedContent });
      setReport({ ...report, reportContent: editedContent });
      setIsEditing(false);
      toast({ title: 'Report saved' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    
    try {
      await deleteReport(report.id);
      toast({ title: 'Report deleted' });
      navigate('/history');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
      });
    }
  };

  const handleDownloadTxt = () => {
    if (!report) return;
    downloadReportAsText(report);
  };

  const handleDownloadDocx = async () => {
    if (!report) return;
    await downloadReportAsDOCX(report);
    toast({ title: 'DOCX downloaded' });
  };

  const handleDownloadPdf = () => {
    if (!report) return;
    downloadReportAsPDF(report);
    toast({ title: 'PDF downloaded' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container flex max-w-4xl items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!report) return null;

  const config = typeConfig[report.reportType];
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-4xl py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/history')}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to History
        </Button>

        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-card to-secondary/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-xl p-3 shadow-sm', config.color)}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">{config.label}</CardTitle>
                  <CardDescription>
                    {format(new Date(report.createdAt), 'MMMM d, yyyy')} at {format(new Date(report.createdAt), 'h:mm a')}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditedContent(report.reportContent);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <Download className="h-4 w-4" />
                          Download
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleDownloadPdf} className="gap-2">
                          <FileDown className="h-4 w-4" />
                          Download as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleDownloadDocx()} className="gap-2">
                          <FileDown className="h-4 w-4" />
                          Download as DOCX
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadTxt} className="gap-2">
                          <FileText className="h-4 w-4" />
                          Download as Text
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. The report will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Duration: {Math.floor(report.duration / 60)}:{(report.duration % 60).toString().padStart(2, '0')}</span>
              <span>•</span>
              <span>{report.wordCount} words</span>
              {report.patientId && (
                <>
                  <span>•</span>
                  <span>Patient: {report.patientId}</span>
                </>
              )}
              {report.doctorName && (
                <>
                  <span>•</span>
                  <span>Dr. {report.doctorName}</span>
                </>
              )}
            </div>

            {/* Audio Playback */}
            {report.audioUrl && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <Volume2 className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Recording available</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!audioRef.current) {
                      audioRef.current = new Audio(report.audioUrl);
                      audioRef.current.onended = () => setIsPlayingAudio(false);
                    }
                    if (isPlayingAudio) {
                      audioRef.current.pause();
                      setIsPlayingAudio(false);
                    } else {
                      audioRef.current.play();
                      setIsPlayingAudio(true);
                    }
                  }}
                  className="gap-2"
                >
                  {isPlayingAudio ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlayingAudio ? 'Pause' : 'Play Recording'}
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            <Tabs defaultValue="report">
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="report" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Report
                </TabsTrigger>
                <TabsTrigger value="transcription" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Original Transcription
                </TabsTrigger>
              </TabsList>

              <TabsContent value="report">
                {isEditing ? (
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                  />
                ) : (
                  <ScrollArea className="h-[400px] rounded-lg border bg-secondary/30 p-4">
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                      {report.reportContent}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="transcription">
                <ScrollArea className="h-[400px] rounded-lg border bg-secondary/30 p-4">
                  <div className="whitespace-pre-wrap text-muted-foreground space-y-2">
                    {report.transcription.split('\n').map((line, index) => {
                      const isDoctor = line.startsWith('DOCTOR:');
                      const isPatient = line.startsWith('PATIENT:');
                      
                      if (isDoctor || isPatient) {
                        return (
                          <p key={index} className={cn(
                            "rounded px-2 py-1",
                            isDoctor && "bg-primary/10 border-l-2 border-primary",
                            isPatient && "bg-secondary border-l-2 border-muted-foreground"
                          )}>
                            <span className={cn(
                              "font-semibold",
                              isDoctor && "text-primary",
                              isPatient && "text-foreground"
                            )}>
                              {isDoctor ? 'DOCTOR:' : 'PATIENT:'}
                            </span>
                            <span>{line.replace(/^(DOCTOR:|PATIENT:)/, '')}</span>
                          </p>
                        );
                      }
                      return line ? <p key={index}>{line}</p> : null;
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
