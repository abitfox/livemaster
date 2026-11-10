"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

type Mode = "login" | "register" | "forgot";

interface Props {
  initialMode: "login" | "register";
  onClose: () => void;
}

/** 登录/注册/忘记密码统一弹窗（自建认证 API；复用 .modal-mask/.modal 体系） */
export default function AuthModal({ initialMode, onClose }: Props) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    emailRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  function validate(): boolean {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("邮箱格式不正确，请检查后重试");
      return false;
    }
    if (mode === "register" && password.length < 8) {
      setError("密码至少 8 位");
      return false;
    }
    setError(null);
    return true;
  }

  async function callApi(path: string, body: Record<string, string>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  async function submit() {
    if (loading || !validate()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "register") {
        await callApi("/api/auth/register", { email, password });
        await refreshUser();
        router.push("/app");
        router.refresh();
      } else if (mode === "login") {
        await callApi("/api/auth/login", { email, password });
        await refreshUser();
        router.push("/app");
        router.refresh();
      } else {
        // 公测期未接入邮件服务：提示到登录后修改
        setInfo("公测期暂未接入邮件服务：如需重置密码，注册新账号即可；已登录用户可在「账号设置」修改密码。");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "网络异常，请稍后重试";
      if (msg.includes("已注册")) setError("该邮箱已注册，试试直接登录？");
      else if (mode === "login") setError("邮箱或密码不正确");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === "login";
  const isForgot = mode === "forgot";

  return (
    <div className="modal-mask show" onMouseDown={(e) => e.target === e.currentTarget && undefined}>
      <div className="modal auth-modal" role="dialog" aria-modal="true">
        <button className="modal-close" aria-label="关闭" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {!isForgot ? (
          <>
            <div className="auth-tabs">
              <button className={`auth-tab ${isLogin ? "on" : ""}`} onClick={() => switchMode("login")}>登录</button>
              <button className={`auth-tab ${!isLogin ? "on" : ""}`} onClick={() => switchMode("register")}>注册</button>
            </div>
            <p className="auth-desc">
              {isLogin ? "欢迎回来，继续你的排练计划。" : "注册只需一个邮箱，公测期全部功能免费。"}
            </p>
          </>
        ) : (
          <>
            <h3>重置密码</h3>
            <button className="auth-back" onClick={() => switchMode("login")}>← 返回登录</button>
          </>
        )}

        <div className="auth-form">
          <input
            ref={emailRef}
            className={`input ${error ? "input-err" : ""}`}
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {!isForgot && (
            <div className="pwd-wrap">
              <input
                className={`input ${error ? "input-err" : ""}`}
                type={showPwd ? "text" : "password"}
                placeholder={isLogin ? "密码" : "密码（8 位以上，建议包含字母和数字）"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button className="pwd-eye" aria-label="切换密码可见" onClick={() => setShowPwd((v) => !v)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          )}

          {error && (
            <div className="auth-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              {error}
            </div>
          )}
          {info && <div className="auth-info">{info}</div>}

          <button className="pill pill-primary auth-submit" disabled={loading} onClick={submit}>
            {loading ? (
              <>
                <span className="spinner" /> 提交中…
              </>
            ) : isForgot ? "发送重置说明" : isLogin ? "登录" : "创建账号，开始排练"}
          </button>

          {isLogin && !isForgot && (
            <button className="auth-link" onClick={() => switchMode("forgot")}>忘记密码？</button>
          )}
          {isLogin && <p className="auth-fine">注册即表示同意用户协议与隐私政策</p>}
        </div>
      </div>
    </div>
  );
}
