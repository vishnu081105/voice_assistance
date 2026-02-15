import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!mounted) return;
        setSession(session ?? null);
        setUser(session?.user ?? null);

        // If a user session exists, ensure a profile row exists in `users` table
        if (session?.user) {
          const id = session.user.id;
          const email = session.user.email ?? undefined;
          const pendingName = localStorage.getItem('pendingDoctorName');
          try {
            await supabase.from('users').upsert({ id, email, full_name: pendingName || null }, { onConflict: 'id' });
            if (pendingName) localStorage.removeItem('pendingDoctorName');
          } catch (err) {
            console.error('Failed to ensure user profile:', err);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    // Then check for existing session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session ?? null);
        setUser(session?.user ?? null);
      })
      .catch((err) => console.error('getSession error', err))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      try {
        subscription.unsubscribe();
      } catch (e) {
        /* ignore */
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('Attempting sign in for:', email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log('Sign in result:', { user: data.user, error });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    // If signUp returns a user object (no email-confirm flow), create profile immediately
    try {
      if (data?.user) {
        const id = data.user.id;
        await supabase.from('users').upsert({ id, email: data.user.email }, { onConflict: 'id' });
      }
    } catch (err) {
      console.error('Failed to create user row after signUp:', err);
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
