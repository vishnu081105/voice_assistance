import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { setSetting } from '@/lib/db';
import { BrandLogo } from '@/components/BrandLogo';

// Signup will no longer require OTP verification; users can sign in after account creation.

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already logged in (after initial load)
  // avoid navigation during render
  useEffect(() => {
    if (user) {
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const validateEmail = (email: string): string | null => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return 'Email is required.';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) return 'Please enter a valid email address.';
    return null;
  };

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Validate doctor name
        if (!doctorName.trim()) {
          toast({ variant: 'destructive', title: 'Name required', description: 'Please enter your full name.' });
          setIsLoading(false);
          return;
        }

        // Validate email
        const emailError = validateEmail(email);
        if (emailError) {
          toast({ variant: 'destructive', title: 'Invalid email', description: emailError });
          setIsLoading(false);
          return;
        }

        // Validate password strength
        const pwError = validatePassword(password);
        if (pwError) {
          toast({ variant: 'destructive', title: 'Weak password', description: pwError });
          setIsLoading(false);
          return;
        }

        // Confirm password match
        if (password !== confirmPassword) {
          toast({ variant: 'destructive', title: 'Password mismatch', description: 'Passwords do not match.' });
          setIsLoading(false);
          return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const { error } = await signUp(normalizedEmail, password, doctorName.trim());
        if (error) {
          toast({ variant: 'destructive', title: 'Sign up failed', description: error.message });
        } else {
          toast({
            title: 'Account created',
            description: `Your account was created. You can now sign in with ${normalizedEmail}.`,
          });
          setIsSignUp(false);
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        // Validate email format
        const emailError = validateEmail(email);
        if (emailError) {
          toast({ variant: 'destructive', title: 'Invalid email', description: emailError });
          setIsLoading(false);
          return;
        }

        const { error } = await signIn(email.trim().toLowerCase(), password);
        if (error) {
          let errorMessage = error.message;
          if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Invalid email or password. Please try again.';
          }
          // Do not block sign-in with a special 'email not confirmed' message; surface the provider error instead
          toast({ variant: 'destructive', title: 'Sign in failed', description: errorMessage });
        } else {
          const pendingDoctorName = localStorage.getItem('pendingDoctorName');
          if (pendingDoctorName) {
            setTimeout(async () => {
              try {
                await setSetting('doctorName', pendingDoctorName);
                localStorage.removeItem('pendingDoctorName');
              } catch (err) {
                console.error('Failed to save doctor name:', err);
              }
            }, 1000);
          }
          navigate('/');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // OTP-related handlers removed; signup no longer requires a verification code.
  // Signup now creates account directly without verification code.

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strengthLabels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const strengthColors = ['', 'bg-destructive', 'bg-destructive/70', 'bg-accent', 'bg-secondary', 'bg-secondary'];
  const pwStrength = getPasswordStrength(password);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative mb-8">
        <BrandLogo
          className="items-center text-center"
          imgClassName="h-16 max-w-[260px] sm:h-20 sm:max-w-[320px]"
          subtitle="Voice Recording & Transcription System"
          subtitleClassName="text-sm"
        />
      </div>

      <Card className="relative w-full max-w-md shadow-2xl border-border/50 backdrop-blur-sm">
          <>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">{isSignUp ? 'Create Account' : 'Welcome Back'}</CardTitle>
              <CardDescription className="text-base">
                {isSignUp
                  ? 'Start transcribing your medical notes today'
                  : 'Sign in to access your medical transcriptions'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-2">
                      <Label htmlFor="doctorName" className="text-sm font-medium">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="doctorName"
                          type="text"
                          placeholder="Dr. John Smith"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          required={isSignUp}
                          maxLength={100}
                          className="pl-10 h-11"
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="doctor@hospital.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        maxLength={255}
                        className="pl-10 h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          maxLength={128}
                          className="pl-10 pr-10 h-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    {isSignUp && password.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                i <= pwStrength ? strengthColors[pwStrength] : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-xs ${pwStrength >= 4 ? 'text-secondary' : pwStrength >= 3 ? 'text-accent-foreground' : 'text-destructive'}`}>
                          {strengthLabels[pwStrength]}
                          {pwStrength < 5 && ' — Use uppercase, lowercase, numbers & symbols'}
                        </p>
                      </div>
                    )}
                  </div>

                  {isSignUp && (
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={8}
                          maxLength={128}
                          className="pl-10 pr-10 h-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {confirmPassword.length > 0 && password !== confirmPassword && (
                        <p className="text-xs text-destructive">Passwords do not match</p>
                      )}
                    </div>
                  )}

                  {!isSignUp && (
                    <div className="text-right">
                      <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-medium shadow-lg shadow-primary/25"
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Button>
                </form>

              <div className="mt-6 text-center text-sm">
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => setIsSignUp(false)}>
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => setIsSignUp(true)}>
                      Create one
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </>
      </Card>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
