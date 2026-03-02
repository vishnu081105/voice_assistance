import { apiRequest, AppSession, AppUser, getStoredSession, setStoredSession } from "@/lib/apiClient";

type AuthListener = (event: string, session: AppSession | null) => void;
const listeners = new Set<AuthListener>();

function notify(event: string, session: AppSession | null) {
  listeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (err) {
      console.error("Auth listener error:", err);
    }
  });
}

export async function getSession(): Promise<AppSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  try {
    const { session: refreshed } = await apiRequest<{ user: AppUser; session: AppSession }>("/api/auth/me");
    if (refreshed?.access_token) {
      setStoredSession(refreshed);
      return refreshed;
    }
    return session;
  } catch {
    setStoredSession(null);
    return null;
  }
}

export function onAuthStateChange(callback: AuthListener) {
  listeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => listeners.delete(callback),
      },
    },
  };
}

export async function signInWithPassword(email: string, password: string): Promise<{ session: AppSession | null; user: AppUser | null; error: Error | null }> {
  try {
    const response = await apiRequest<{ user: AppUser; session: AppSession }>("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    setStoredSession(response.session);
    notify("SIGNED_IN", response.session);
    return { session: response.session, user: response.user, error: null };
  } catch (err) {
    return { session: null, user: null, error: err as Error };
  }
}

export async function signUp(
  email: string,
  password: string,
  fullName?: string
): Promise<{ session: AppSession | null; user: AppUser | null; error: Error | null }> {
  try {
    const response = await apiRequest<{ user: AppUser; session: AppSession }>("/api/auth/signup", {
      method: "POST",
      auth: false,
      body: {
        email,
        password,
        full_name: fullName ?? null,
      },
    });
    if (response.session) {
      setStoredSession(response.session);
      notify("SIGNED_IN", response.session);
    }
    return { session: response.session ?? null, user: response.user, error: null };
  } catch (err) {
    return { session: null, user: null, error: err as Error };
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore logout errors; local cleanup still needed
  }
  setStoredSession(null);
  notify("SIGNED_OUT", null);
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<{ error: Error | null }> {
  try {
    await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      auth: false,
      body: { email, redirectTo },
    });
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function resetPasswordWithToken(token: string, password: string): Promise<{ error: Error | null }> {
  try {
    await apiRequest("/api/auth/reset-password", {
      method: "POST",
      auth: false,
      body: { token, password },
    });
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function updateCurrentUserPassword(password: string): Promise<{ error: Error | null }> {
  try {
    await apiRequest("/api/auth/update-password", {
      method: "POST",
      body: { password },
    });
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
