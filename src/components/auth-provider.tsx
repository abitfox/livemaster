"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import AuthModal from "@/components/auth-modal";

type AuthMode = "login" | "register";

interface AuthUser {
  email: string;
  nickname: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  refreshUser: () => Promise<void>;
  openAuth: (mode?: AuthMode) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  refreshUser: async () => {},
  openAuth: () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/** 全局认证 Provider：会话状态（Cookie 会话，经 /api/auth/me 探测）+ 弹窗 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("register");

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const openAuth = useCallback((m: AuthMode = "register") => {
    setMode(m);
    setOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, refreshUser, openAuth, logout }}>
      {children}
      {open && <AuthModal initialMode={mode} onClose={() => setOpen(false)} />}
    </AuthContext.Provider>
  );
}
