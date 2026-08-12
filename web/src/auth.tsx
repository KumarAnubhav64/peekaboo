import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, getJson, postJson } from "./api";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, name?: string) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJson<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    signup: async (email, password, name) => {
      const u = await postJson<User>("/api/auth/signup", { email, password, name });
      setUser(u);
      return u;
    },
    login: async (email, password) => {
      const u = await postJson<User>("/api/auth/login", { email, password });
      setUser(u);
      return u;
    },
    logout: async () => {
      await postJson("/api/auth/logout", {});
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function googleSignIn(): void {
  // Full-page navigation so the OAuth redirect works with cookies.
  window.location.href = "/api/auth/google";
}

export { ApiError };
