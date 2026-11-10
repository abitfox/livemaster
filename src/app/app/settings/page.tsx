"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import s from "./page.module.css";

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface ToastItem {
  id: number;
  msg: string;
  ok: boolean;
}

/** 删除账号两级确认的阶段 */
type DelStage = "none" | "input" | "final";

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [nickSaving, setNickSaving] = useState(false);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [delStage, setDelStage] = useState<DelStage>("none");
  const [delInput, setDelInput] = useState("");
  const [delErr, setDelErr] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  function toast(msg: string, ok = true) {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user?.email) return;
      setEmail(user.email);
      setUserId(user.id);
      setNickname(user.email.split("@")[0]);
      // 昵称优先读 profiles 表
      const res = await supabase.from("profiles").select("nickname").eq("id", user.id).single();
      if (res.data?.nickname) setNickname(res.data.nickname as string);
    })();
  }, []);

  async function saveNickname() {
    if (!userId || nickSaving) return;
    const name = nickname.trim();
    if (!name) {
      toast("昵称不能为空", false);
      return;
    }
    setNickSaving(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("登录服务未配置");
      const { error } = await supabase.from("profiles").upsert({ id: userId, nickname: name });
      if (error) throw error;
      toast("昵称已更新");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", false);
    } finally {
      setNickSaving(false);
    }
  }

  /** 密码强度：0~3 */
  function pwdScore(v: string): number {
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Za-z]/.test(v) && /\d/.test(v)) score++;
    if (v.length >= 12 || /[^A-Za-z0-9]/.test(v)) score++;
    return score;
  }

  async function savePassword() {
    if (pwdSaving) return;
    setPwdErr(null);
    if (!pwd || !pwd2) {
      setPwdErr("请填写新密码");
      return;
    }
    if (pwd !== pwd2) {
      setPwdErr("两次输入的密码不一致");
      return;
    }
    setPwdSaving(true);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("登录服务未配置");
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd("");
      setPwd2("");
      toast("密码已更新");
    } catch (e) {
      toast(e instanceof Error ? e.message : "修改失败", false);
    } finally {
      setPwdSaving(false);
    }
  }

  async function finalDeleteAccount() {
    setDeleting(true);
    try {
      const supabase = createClient();
      if (supabase) await supabase.auth.signOut();
      setDelStage("none");
      router.push("/");
    } catch {
      setDeleting(false);
      toast("操作失败，请稍后再试", false);
    }
  }

  const avatarChar = email ? email[0].toUpperCase() : "L";
  const avatarG = `g${(hashCode(email || "L") % 6) + 1}`;
  const score = pwdScore(pwd);

  return (
    <div className={s.wrap}>
      <h1 className="page-title">账号设置</h1>

      {/* ① 账号信息 */}
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title" style={{ marginBottom: 16 }}>账号信息</div>
        <div className={s.acctRow}>
          <span className={`avatar avatar-56 ${avatarG}`}>{avatarChar}</span>
          <div className={s.acctInfo}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                className="input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ maxWidth: 180 }}
                aria-label="昵称"
              />
              <button className={`pill pill-secondary pill-compact ${nickSaving ? "loading" : ""}`} onClick={saveNickname} disabled={nickSaving}>
                保存
              </button>
            </div>
            <div className={`${s.acctMail} num`}>{email || "…"}</div>
          </div>
        </div>
      </section>

      {/* ② 修改密码 */}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title" style={{ marginBottom: 16 }}>修改密码</div>
        <div className="field">
          <label>新密码</label>
          <input
            className="input"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="8 位以上，建议包含字母和数字"
          />
          <div className={s.pwStrength}>
            {[0, 1, 2].map((i) => (
              <i
                key={i}
                style={{
                  background: i < score ? (score === 3 ? "var(--success)" : "var(--warning)") : "var(--bg-panel-raised)",
                }}
              />
            ))}
          </div>
          <div className="field-hint">8 位以上，建议包含字母和数字</div>
        </div>
        <div className="field">
          <label>确认新密码</label>
          <input
            className={`input ${pwdErr ? "error" : ""}`}
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="再次输入新密码"
          />
          {pwdErr && (
            <div className="field-error show">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              {pwdErr}
            </div>
          )}
        </div>
        <button className={`pill pill-primary ${pwdSaving ? "loading" : ""}`} onClick={savePassword} disabled={pwdSaving}>
          保存新密码
        </button>
      </section>

      {/* ③ 危险区 */}
      <section className="panel panel-danger" style={{ marginTop: 16 }}>
        <div className="panel-title" style={{ marginBottom: 4 }}>危险区</div>
        <p className="text-ter" style={{ marginBottom: 8 }}>以下操作不可恢复，请谨慎执行。</p>

        <div className={s.dangerRow}>
          <div>
            <div className={s.drTitle}>退出登录</div>
            <div className={s.drDesc}>退出后需要重新登录才能继续排练。</div>
          </div>
          <button className="pill pill-ghost pill-ghost-danger pill-compact" onClick={() => setLogoutOpen(true)}>
            退出登录
          </button>
        </div>

        <div className={s.dangerRow}>
          <div>
            <div className={s.drTitle}>删除账号</div>
            <div className={s.drDesc}>将永久删除你的全部排练数据与复盘报告，此操作不可恢复。</div>
          </div>
          <button
            className="pill pill-secondary pill-compact"
            style={{ color: "var(--danger)" }}
            onClick={() => { setDelStage("input"); setDelInput(""); setDelErr(false); }}
          >
            删除账号
          </button>
        </div>
      </section>

      <p className="disclaimer" style={{ marginTop: 40 }}>
        本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容。
      </p>

      {/* 退出登录确认模态 */}
      {logoutOpen && (
        <div className="modal-mask show" onClick={(e) => { if (e.target === e.currentTarget) setLogoutOpen(false); }}>
          <div className="modal">
            <h3>确定退出登录？</h3>
            <p className="modal-desc">退出后需要重新登录才能继续排练。</p>
            <div className="modal-actions">
              <button className="pill pill-ghost" onClick={() => setLogoutOpen(false)}>取消</button>
              <button className="pill pill-ghost pill-ghost-danger" onClick={() => { setLogoutOpen(false); logout(); }}>
                退出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除账号 · 第一级确认（输入「删除」解锁） */}
      {delStage === "input" && (
        <div className="modal-mask show" onClick={(e) => { if (e.target === e.currentTarget) setDelStage("none"); }}>
          <div className="modal">
            <h3>确定要删除账号吗？</h3>
            <p className="modal-desc">将永久删除你的全部排练数据与复盘报告，此操作不可恢复。请输入「删除」以继续。</p>
            <div className="modal-body">
              <input
                className={`input ${delErr ? "error" : ""}`}
                value={delInput}
                onChange={(e) => { setDelInput(e.target.value); setDelErr(false); }}
                placeholder="输入「删除」二字"
              />
              {delErr && <div className="error-card">输入不一致，请重新输入「删除」</div>}
            </div>
            <div className="modal-actions">
              <button className="pill pill-ghost" onClick={() => setDelStage("none")}>取消</button>
              <button
                className="pill pill-primary"
                disabled={delInput !== "删除"}
                onClick={() => {
                  if (delInput !== "删除") { setDelErr(true); return; }
                  setDelStage("final");
                }}
              >
                继续
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除账号 · 第二级确认 */}
      {delStage === "final" && (
        <div className="modal-mask show" onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDelStage("none"); }}>
          <div className="modal">
            <h3>最后确认</h3>
            <p className="modal-desc">将永久删除你的全部排练数据与复盘报告，此操作不可恢复。确认要永久删除账号吗？</p>
            <div className="modal-actions">
              <button className="pill pill-ghost" onClick={() => setDelStage("none")} disabled={deleting}>取消</button>
              <button className={`pill pill-primary ${deleting ? "loading" : ""}`} style={{ background: "var(--danger)" }} onClick={finalDeleteAccount} disabled={deleting}>
                永久删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? "" : "fail"}`}>
            {t.ok ? (
              <svg className="t-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </svg>
            ) : (
              <svg className="t-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            )}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
