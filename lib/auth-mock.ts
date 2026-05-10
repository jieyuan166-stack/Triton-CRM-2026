// lib/auth-mock.ts
// Browser-only mock auth — replaced by NextAuth.js + Credentials provider in
// Step 10. Persists session AND mutable credentials in localStorage so the
// admin can change their sign-in email/password from Settings without us
// shipping a backend yet. NOT a security boundary.

const SESSION_KEY = "triton:session";
const CREDS_KEY = "triton:credentials";

export interface MockSession {
  email: string;
  signedInAt: string;
}

interface Credentials {
  email: string;
  password: string;
}

const DEFAULT_CREDENTIALS: Credentials = {
  email: "jieyuan165@gmail.com",
  password: "123456",
};

function getCredentials(): Credentials {
  if (typeof window === "undefined") return DEFAULT_CREDENTIALS;
  try {
    const raw = window.localStorage.getItem(CREDS_KEY);
    if (!raw) return DEFAULT_CREDENTIALS;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return {
      email: parsed.email ?? DEFAULT_CREDENTIALS.email,
      password: parsed.password ?? DEFAULT_CREDENTIALS.password,
    };
  } catch {
    return DEFAULT_CREDENTIALS;
  }
}

function writeCredentials(next: Credentials): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CREDS_KEY, JSON.stringify(next));
}

export function getCurrentLoginEmail(): string {
  return getCredentials().email;
}

export function updateMockCredentials(patch: {
  email?: string;
  password?: string;
}): { ok: boolean; email: string } {
  const current = getCredentials();
  const next: Credentials = {
    email: patch.email?.trim() || current.email,
    password: patch.password ?? current.password,
  };
  writeCredentials(next);
  // If the email changed, the active session must reflect that — otherwise
  // the next refresh would still show the old email in the header.
  const session = getMockSession();
  if (session && session.email !== next.email) {
    const updatedSession: MockSession = { ...session, email: next.email };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
    }
  }
  return { ok: true, email: next.email };
}

export function mockSignIn(
  email: string,
  password: string
): { ok: boolean; error?: string } {
  const creds = getCredentials();
  if (
    email.trim().toLowerCase() === creds.email.toLowerCase() &&
    password === creds.password
  ) {
    if (typeof window !== "undefined") {
      const session: MockSession = {
        email: creds.email,
        signedInAt: new Date().toISOString(),
      };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return { ok: true };
  }
  return { ok: false, error: "Invalid email or password" };
}

export function mockSignOut(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function getMockSession(): MockSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MockSession;
  } catch {
    return null;
  }
}
