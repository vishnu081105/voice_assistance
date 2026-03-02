const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000");
const SESSION_KEY = "medivoice_session";

export type AppUser = {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string | null;
  };
};

export type AppSession = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AppUser;
};

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getStoredSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AppSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getAccessToken(): string | null {
  return getStoredSession()?.access_token ?? null;
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  isFormData?: boolean;
};

export async function apiRequest<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const auth = options.auth !== false;
  const isFormData = options.isFormData === true;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `Cannot connect to backend (${API_BASE_URL}). Start the API server with "npm run server".`
    );
  }

  const text = await response.text();
  let json: any = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.error || "Request failed";
    throw new Error(message);
  }

  return json as T;
}
