"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSession, signIn as nextSignIn, signOut as nextSignOut } from "next-auth/react";
import type { Session } from "next-auth";

interface AuthContextValue {
  session: Session | null;
  loginEmail: string;
  ready: boolean;
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  updateCredentials(patch: {
    email?: string;
    password?: string;
  }): Promise<{ ok: boolean; email: string; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loginEmailOverride, setLoginEmailOverride] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const next = await getSession();
    setSession(next);
    setReady(true);
    return next;
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const verifyResponse = await fetch("/api/auth/verify-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const verifyPayload = (await verifyResponse.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!verifyResponse.ok || !verifyPayload?.ok) {
        return {
          ok: false,
          error: verifyPayload?.error ?? "Invalid email or password",
        };
      }

      let result;
      try {
        result = await nextSignIn("credentials", {
          email,
          password,
          redirect: false,
        });
      } catch {
        return { ok: false, error: "Sign-in failed. Please try again." };
      }

      if (!result?.ok) {
        return { ok: false, error: "Sign-in failed. Please try again." };
      }

      await refreshSession();
      return { ok: true };
    },
    [refreshSession],
  );

  const signOut = useCallback(async () => {
    await nextSignOut({ redirect: false });
    setSession(null);
  }, []);

  const updateCredentials = useCallback(
    async (patch: { email?: string; password?: string }) => {
      const response = await fetch("/api/account/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        return {
          ok: false,
          email: loginEmailOverride ?? session?.user?.email ?? "",
          error: payload.error ?? "Unable to update credentials",
        };
      }

      const nextEmail = payload.email ?? patch.email ?? loginEmailOverride ?? session?.user?.email ?? "";
      setLoginEmailOverride(nextEmail);
      setSession((current) =>
        current?.user
          ? {
              ...current,
              user: {
                ...current.user,
                email: nextEmail,
              },
            }
          : current,
      );
      return { ok: true, email: nextEmail };
    },
    [loginEmailOverride, session?.user?.email],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loginEmail: loginEmailOverride ?? session?.user?.email ?? "",
      ready,
      signIn,
      signOut,
      updateCredentials,
    }),
    [loginEmailOverride, session, ready, signIn, signOut, updateCredentials],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
