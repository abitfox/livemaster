"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LiveSession, Scene, SessionStatus } from "@/lib/types";
import s from "./page.module.css";

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SCENE_LABELS: Record<Scene, string> = { train: "主播排练", feynman: "费曼学习" };
const STATUS_LABELS: Record<SessionStatus, string> = { live: "进行中", ended: "已完成", interrupted: "已中断" };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "进行中";
  return `${Math.max(1, Math.round(sec / 60))} 分钟`;
}

/** 热度等级配色：沿用 L0~L3 语义色 */
const HEAT_COLOR = ["var(--l0)", "var(--l1)", "var(--l2)", "var(--l3)"];

function StatusBadge({ status }: { status: SessionStatus }) {
  const cls = status === "live" ? "badge-danger" : status === "interrupted" ? "badge-warning" : "badge-success";
  return (
    <span className={`badge ${cls}`}>
      <i className="dot" style={status === "live" ? { animation: "pulse-1s 1.6s ease-in-out infinite" } : undefined}></i>
      {STATUS_LABELS[status]}
    </span>
  );
}

const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

interface ToastItem {
  id: number;
  msg: string;
  ok: boolean;
}

type SceneFilter = "all" | Scene;
type StatusFilter = "all" | SessionStatus;

export default function HistoryPage() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneFilter, setSceneFilter] = useState<SceneFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiveSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastSeq = useRef(0);

  function toast(msg: string, ok = true) {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  const load = useCallback(async () => {
    setError(null);
    setSessions(null);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setSessions(data.sessions as LiveSession[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 点击其他区域关闭「…」菜单
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      setSessions((list) => (list ? list.filter((x) => x.id !== deleteTarget.id) : list));
      setDeleteTarget(null);
      toast("场次已删除");
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", false);
    } finally {
      setDeleting(false);
    }
  }

  const filtered = (sessions ?? []).filter(
    (x) =>
      (sceneFilter === "all" || x.scene === sceneFilter) &&
      (statusFilter === "all" || x.status === statusFilter),
  );
  const loading = sessions === null && !error;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <h1 className="page-title">历史场次</h1>
      </div>

      {/* 筛选 pill 行 */}
      <div className={s.filters}>
        {(
          [
            { key: "all" as SceneFilter, label: "全部" },
            { key: "train" as SceneFilter, label: "主播排练" },
            { key: "feynman" as SceneFilter, label: "费曼学习" },
          ]
        ).map((o) => (
          <button
            key={o.key}
            className={`opt-pill ${sceneFilter === o.key ? "selected" : ""}`}
            onClick={() => setSceneFilter(o.key)}
          >
            {o.label}
            {o.key === "all" && sessions && <span className="num" style={{ marginLeft: 2 }}>{sessions.length}</span>}
          </button>
        ))}
        <span className={s.filterGap} />
        {(
          [
            { key: "all" as StatusFilter, label: "全部状态" },
            { key: "ended" as StatusFilter, label: "已完成" },
            { key: "interrupted" as StatusFilter, label: "已中断" },
            { key: "live" as StatusFilter, label: "进行中" },
          ]
        ).map((o) => (
          <button
            key={o.key}
            className={`opt-pill ${statusFilter === o.key ? "selected" : ""}`}
            onClick={() => setStatusFilter(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div style={{ marginTop: 16 }}>
        {loading && [0, 1, 2].map((i) => <div key={i} className={`skeleton ${s.skelCard}`} />)}

        {error && (
          <div className="error-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <span>场次加载失败：{error}</span>
            <button className="pill pill-ghost pill-compact" onClick={load}>重试</button>
          </div>
        )}

        {!loading && !error && sessions?.length === 0 && (
          <div className="empty">
            <div className="e-ico">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="e-title">还没有排练场次</div>
            <div className="e-desc">输入一个主题，AI 观众马上为你就座。</div>
            <Link href="/app/new" className="pill pill-primary">开第一场</Link>
          </div>
        )}

        {!loading && !error && sessions && sessions.length > 0 && filtered.length === 0 && (
          <div className="empty">
            <div className="e-title">没有符合筛选条件的场次</div>
            <div className="e-desc">换个筛选条件试试。</div>
          </div>
        )}

        {filtered.map((sess) => {
          const g = `g${(hashCode(sess.topic) % 6) + 1}`;
          return (
            <div key={sess.id} className="hcard">
              <div className={`hcard-icon ${g}`}>{sess.topic.slice(0, 1)}</div>
              <div>
                <div className="hcard-title">{sess.topic}</div>
                <div className="hcard-meta">
                  <span className={`tag-pill ${sess.scene === "train" ? s.sceneRehearse : ""}`}>{SCENE_LABELS[sess.scene]}</span>
                  <span className="text-ter num">{fmtDate(sess.startedAt)}</span>
                  <StatusBadge status={sess.status} />
                </div>
                <div className={s.hstats}>
                  <div className={s.hstat}>
                    <span className={s.hsLabel}>热度峰值</span>
                    <span className={`num ${s.hsVal}`} style={{ color: HEAT_COLOR[Math.min(3, Math.max(0, sess.peakHeat))] }}>
                      L{sess.peakHeat}
                    </span>
                  </div>
                  <div className={s.hstat}>
                    <span className={s.hsLabel}>时长</span>
                    <span className={`num ${s.hsVal}`}>{fmtDuration(sess.durationSec)}</span>
                  </div>
                </div>
              </div>
              <div className="hcard-actions">
                <Link href={`/app/replay/${sess.id}`} className="pill pill-secondary pill-compact">看复盘</Link>
                <div className={`${s.moreWrap} ${openMenuId === sess.id ? s.open : ""}`} ref={openMenuId === sess.id ? menuRef : undefined}>
                  <button
                    className="pill pill-ghost pill-compact"
                    style={{ padding: "0 10px" }}
                    aria-label="更多操作"
                    onClick={() => setOpenMenuId((v) => (v === sess.id ? null : sess.id))}
                  >
                    <MoreIcon />
                  </button>
                  <div className={s.moreMenu}>
                    <button className={s.del} onClick={() => { setOpenMenuId(null); setDeleteTarget(sess); }}>
                      <TrashIcon />
                      删除场次
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="disclaimer" style={{ marginTop: 40 }}>
        本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容。
      </p>

      {/* 删除确认模态 */}
      {deleteTarget && (
        <div className="modal-mask show" onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal">
            <h3>
              确定删除场次 <span className="num">#{(sessions ?? []).findIndex((x) => x.id === deleteTarget.id) + 1}</span>？
            </h3>
            <p className="modal-desc">删除后不可恢复，该场次的复盘报告与观众数据将一并删除。</p>
            <div className="modal-actions">
              <button className="pill pill-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</button>
              <button className={`pill pill-primary ${deleting ? "loading" : ""}`} onClick={confirmDelete} disabled={deleting}>
                删除
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
