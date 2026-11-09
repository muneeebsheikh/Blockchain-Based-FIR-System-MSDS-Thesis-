import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TOKEN_KEY, type Role } from "../api/client";

type User = { id: string; email: string; role: Role };

type AuthState = {
  user: User | null;
  token: string | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("fir_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  });

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      setSession: (t, u) => {
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem("fir_user", JSON.stringify(u));
        setToken(t);
        setUser(u);
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("fir_user");
        setToken(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
