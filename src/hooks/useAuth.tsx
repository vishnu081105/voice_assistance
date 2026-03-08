import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  getSession,
  onAuthStateChange,
  signInWithPassword,
  signOut as authSignOut,
  signUp as authSignUp,
} from "@/lib/authClient";

export interface User {
  id: string;
  email: string;
  role?: 'doctor' | 'admin' | 'staff';
  user_metadata?: {
    full_name?: string | null;
  };
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const current = await getSession();
        if (!mounted) return;
        setSession(current);
        setUser(current?.user ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const listener = onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await signInWithPassword(email, password);
    const current = await getSession();
    setSession(current);
    setUser(current?.user ?? null);
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await authSignUp(email, password, fullName);
    const current = await getSession();
    setSession(current);
    setUser(current?.user ?? null);
    return { error };
  };

  const signOut = async () => {
    await authSignOut();
    setSession(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
