import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "./api";
import type { User } from "../types/api";

interface AuthValue { token: string | null; user: User | null; ready: boolean; signIn: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string) => Promise<void>; signOut: () => void }
const AuthContext = createContext<AuthValue | null>(null);
const storedToken = () => localStorage.getItem("api-lens-token");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(storedToken);
  const [user, setUser] = useState<User | null>(() => {
    try { const raw = localStorage.getItem("api-lens-user"); return raw ? JSON.parse(raw) as User : null; } catch { return null; }
  });
  const accept = (result: { token: string; user: User }) => {
    localStorage.setItem("api-lens-token", result.token);
    localStorage.setItem("api-lens-user", JSON.stringify(result.user));
    setToken(result.token); setUser(result.user);
  };
  const value = useMemo<AuthValue>(() => ({
    token, user, ready: true,
    async signIn(email, password) { accept(await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })); },
    async signUp(email, password) { accept(await apiRequest("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) })); },
    signOut() { localStorage.removeItem("api-lens-token"); localStorage.removeItem("api-lens-user"); setToken(null); setUser(null); },
  }), [token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
