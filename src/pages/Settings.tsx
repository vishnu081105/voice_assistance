import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { TemplateManager } from '@/components/TemplateManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { getSetting, setSetting, clearAllReports, clearAllSettings, clearAllTemplates, ReportType } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Languages, FileText, Clock, Moon, Sun, Monitor, Bookmark, User, Building2, Type } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function Settings() {
  const [defaultReportType, setDefaultReportType] = useState<ReportType>('general');
  const [language, setLanguage] = useState('en-US');
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const loadSettings = async () => {
      const savedReportType = await getSetting<ReportType>('defaultReportType');
      const savedLanguage = await getSetting<string>('language');
      const savedTimestamps = await getSetting<boolean>('showTimestamps');
      const savedFontSize = await getSetting<number>('fontSize');
      const savedDoctorName = await getSetting<string>('doctorName');
      const savedClinicName = await getSetting<string>('clinicName');
      const savedAutoSave = await getSetting<boolean>('autoSave');
      
      if (savedReportType) setDefaultReportType(savedReportType);
      if (savedLanguage) setLanguage(savedLanguage);
      if (savedTimestamps !== undefined) setShowTimestamps(savedTimestamps);
      if (savedFontSize) setFontSize(savedFontSize);
      if (savedDoctorName) setDoctorName(savedDoctorName);
      if (savedClinicName) setClinicName(savedClinicName);
      if (savedAutoSave !== undefined) setAutoSave(savedAutoSave);
    };
    
    loadSettings();
  }, []);

  const handleReportTypeChange = async (value: ReportType) => {
    setDefaultReportType(value);
    await setSetting('defaultReportType', value);
    toast({ title: 'Settings saved' });
  };

  const handleLanguageChange = async (value: string) => {
    setLanguage(value);
    await setSetting('language', value);
    toast({ title: 'Settings saved' });
  };

  const handleTimestampsChange = async (value: boolean) => {
    setShowTimestamps(value);
    await setSetting('showTimestamps', value);
    toast({ title: 'Settings saved' });
  };

  const handleFontSizeChange = async (value: number[]) => {
    const size = value[0];
    setFontSize(size);
    await setSetting('fontSize', size);
  };

  const handleDoctorNameChange = async (value: string) => {
    setDoctorName(value);
    await setSetting('doctorName', value);
  };

  const handleClinicNameChange = async (value: string) => {
    setClinicName(value);
    await setSetting('clinicName', value);
  };

  const handleAutoSaveChange = async (value: boolean) => {
    setAutoSave(value);
    await setSetting('autoSave', value);
    toast({ title: 'Settings saved' });
  };

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      await clearAllReports();
      await clearAllSettings();
      await clearAllTemplates();
      toast({
        title: 'All data cleared',
        description: 'Your reports, templates, and settings have been deleted.',
      });
      // Reset to defaults
      setDefaultReportType('general');
      setLanguage('en-US');
      setShowTimestamps(true);
      setFontSize(14);
      setDoctorName('');
      setClinicName('');
      setAutoSave(true);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Clear failed',
        description: 'Failed to clear data.',
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-2xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Doctor</h1>
          <p className="mt-2 text-muted-foreground">
            Configure your profile and transcription preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Theme Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Moon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize how MediVoice looks</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="theme">Theme</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4" />
                        Light
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Dark
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        System
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your professional details for reports</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doctorName">Doctor Name</Label>
                <Input
                  id="doctorName"
                  placeholder="Dr. John Smith"
                  value={doctorName}
                  onChange={(e) => handleDoctorNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinicName">Clinic / Hospital Name</Label>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="clinicName"
                    placeholder="City Medical Center"
                    value={clinicName}
                    onChange={(e) => handleClinicNameChange(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Report Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Report Configuration</CardTitle>
                  <CardDescription>Default settings for report generation</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="reportType">Default Report Type</Label>
                <Select value={defaultReportType} onValueChange={handleReportTypeChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Clinical Note</SelectItem>
                    <SelectItem value="soap">SOAP Notes</SelectItem>
                    <SelectItem value="diagnostic">Surgical Pathology Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-Save Reports</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically save reports after generation
                  </p>
                </div>
                <Switch
                  checked={autoSave}
                  onCheckedChange={handleAutoSaveChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Bookmark className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Templates</CardTitle>
                  <CardDescription>Create reusable phrases and report structures</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TemplateManager mode="manage" />
            </CardContent>
          </Card>

          {/* Speech Recognition Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Languages className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Speech Recognition</CardTitle>
                  <CardDescription>Language and recognition options</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="language">Recognition Language</Label>
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="es-ES">Spanish</SelectItem>
                    <SelectItem value="fr-FR">French</SelectItem>
                    <SelectItem value="de-DE">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Type className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Display</CardTitle>
                  <CardDescription>Visual preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="timestamps">Show Timestamps</Label>
                  <p className="text-sm text-muted-foreground">
                    Display timestamps on reports
                  </p>
                </div>
                <Switch
                  id="timestamps"
                  checked={showTimestamps}
                  onCheckedChange={handleTimestampsChange}
                />
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Font Size</Label>
                  <span className="text-sm font-medium tabular-nums">{fontSize}px</span>
                </div>
                <Slider
                  value={[fontSize]}
                  onValueChange={handleFontSizeChange}
                  min={12}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Adjust text size for transcriptions and reports
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription>Irreversible actions</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    Clear All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your saved reports, templates, and settings. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearAllData}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isClearing ? 'Clearing...' : 'Delete Everything'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
