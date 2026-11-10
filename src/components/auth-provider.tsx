"use client";

import { createContext, useCallback, useContext, useState } from "react";
import AuthModal from "@/components/auth-modal";

type AuthMode = "login" | "register";

interface AuthContextValue {
  openAuth: (mode?: AuthMode) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ openAuth: () => {}, logout: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

/** 全局认证弹窗 Provider：任意组件 useAuth().openAuth('register') 唤起 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("register");

  const openAuth = useCallback((m: AuthMode = "register") => {
    setMode(m);
    setOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (supabase) await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ openAuth, logout }}>
      {children}
      {open && <AuthModal initialMode={mode} onClose={() => setOpen(false)} />}
    </AuthContext.Provider>
  );
}
