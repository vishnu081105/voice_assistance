import { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { getSetting, setSetting } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { User, Building2, Mail, Save, Loader2, Camera, Upload } from 'lucide-react';
import { brandLogoSrc } from '@/components/BrandLogo';

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const avatarImageSrc = avatarUrl || brandLogoSrc;
  const avatarImageClassName = avatarUrl ? 'object-cover' : 'object-contain bg-white p-2';

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const savedDoctorName = await getSetting<string>('doctorName');
        const savedClinicName = await getSetting<string>('clinicName');
        const savedSpecialty = await getSetting<string>('specialty');
        const savedPhone = await getSetting<string>('phone');
        const savedAvatarUrl = await getSetting<string>('avatarUrl');
        
        if (savedDoctorName) setDoctorName(savedDoctorName);
        if (savedClinicName) setClinicName(savedClinicName);
        if (savedSpecialty) setSpecialty(savedSpecialty);
        if (savedPhone) setPhone(savedPhone);
        if (savedAvatarUrl) setAvatarUrl(savedAvatarUrl);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProfile();
  }, []);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload an image file.',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB.',
      });
      return;
    }

    // Convert to base64 for local storage
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setAvatarUrl(base64);
      toast({
        title: 'Photo updated',
        description: 'Click Save Profile to keep your changes.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await setSetting('doctorName', doctorName);
      await setSetting('clinicName', clinicName);
      await setSetting('specialty', specialty);
      await setSetting('phone', phone);
      await setSetting('avatarUrl', avatarUrl);
      
      toast({
        title: 'Profile saved',
        description: 'Your profile information has been updated.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: 'Failed to save profile information.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-2xl py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-2xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your professional information
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Photo Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Profile Photo</CardTitle>
                  <CardDescription>Upload a professional photo</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 border-4 border-primary/20">
                  <AvatarImage src={avatarImageSrc} alt={doctorName || 'Doctor'} className={avatarImageClassName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                    {doctorName ? getInitials(doctorName) : <User className="h-10 w-10" />}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Photo
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Your login credentials</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg bg-secondary/50 p-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={avatarImageSrc} alt={doctorName || 'Doctor'} className={avatarImageClassName} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {doctorName ? getInitials(doctorName) : <User className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{doctorName || 'Doctor'}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Professional Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Professional Information</CardTitle>
                  <CardDescription>This information appears on your reports</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doctorName">Full Name</Label>
                <Input
                  id="doctorName"
                  placeholder="Dr. John Smith"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="specialty">Specialty</Label>
                <Input
                  id="specialty"
                  placeholder="General Medicine, Cardiology, etc."
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Clinic Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Clinic / Hospital</CardTitle>
                  <CardDescription>Your workplace information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinicName">Organization Name</Label>
                <Input
                  id="clinicName"
                  placeholder="MediVoice Hospital"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button 
            onClick={handleSaveProfile} 
            disabled={isSaving}
            className="w-full h-12 text-base gap-2"
            size="lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Save Profile
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
