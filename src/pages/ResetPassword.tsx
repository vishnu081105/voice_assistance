import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Activity, Loader2, Lock, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getSession, resetPasswordWithToken, updateCurrentUserPassword } from '@/lib/authClient';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const tokenFromLink = searchParams.get('token');
    if (tokenFromLink) return;

    // Check if we have a valid session when updating password from an authenticated account
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (!session) {
          toast({
            variant: 'destructive',
            title: 'Invalid or expired link',
            description: 'Please request a new password reset link.',
          });
          navigate('/forgot-password');
        }
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Invalid or expired link',
          description: 'Please request a new password reset link.',
        });
        navigate('/forgot-password');
      }
    };
    checkSession();
  }, [navigate, searchParams, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same.',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const tokenFromLink = searchParams.get('token');
      const { error } = tokenFromLink
        ? await resetPasswordWithToken(tokenFromLink, password)
        : await updateCurrentUserPassword(password);

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message,
        });
      } else {
        setIsSuccess(true);
        toast({
          title: 'Password updated!',
          description: 'Your password has been successfully changed.',
        });
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25">
          <Activity className="h-7 w-7 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">MediVoice</h1>
          <p className="text-sm text-muted-foreground">Medical Transcription</p>
        </div>
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center">
          {isSuccess ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <CardTitle>Password Updated!</CardTitle>
              <CardDescription>
                Redirecting you to the dashboard...
              </CardDescription>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Reset Your Password</CardTitle>
              <CardDescription>
                Enter your new password below
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {!isSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
