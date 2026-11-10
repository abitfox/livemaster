"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LiveSession, Scene } from "@/lib/types";
import s from "./page.module.css";

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function greetingOf(hour: number): string {
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** 副文案三条轮换（按日期稳定轮换） */
const GREET_SUBS = ["今天是排练的好日子。", "观众们已经就座。", "流量池在等你。"];

const SCENE_LABELS: Record<Scene, string> = { train: "主播排练", feynman: "费曼学习" };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "进行中";
  return `${Math.max(1, Math.round(sec / 60))} 分钟`;
}

function StatusBadge({ status }: { status: LiveSession["status"] }) {
  if (status === "live") {
    return (
      <span className="badge badge-danger">
        <i className="dot" style={{ animation: "pulse-1s 1.6s ease-in-out infinite" }}></i>进行中
      </span>
    );
  }
  if (status === "interrupted") {
    return (
      <span className="badge badge-warning">
        <i className="dot"></i>已中断
      </span>
    );
  }
  return (
    <span className="badge badge-success">
      <i className="dot"></i>已完成
    </span>
  );
}

const ArrowIcon = () => (
  <svg className="arrow-btn" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const EmptyIcon = () => (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function AppHomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [scene, setScene] = useState<Scene>("train");
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (data.user?.email) setEmail(data.user.email);
    })();
    load();
  }, [load]);

  const nickname = email ? email.split("@")[0] : "";
  // 时段问候与副文案仅客户端计算，避免水合不一致
  const [greetText, setGreetText] = useState("");
  const [greetSub, setGreetSub] = useState(GREET_SUBS[0]);
  useEffect(() => {
    const now = new Date();
    setGreetText(greetingOf(now.getHours()));
    setGreetSub(GREET_SUBS[Math.floor(now.getTime() / 86400000) % GREET_SUBS.length]);
  }, []);

  function goNew() {
    const t = topic.trim();
    const params = new URLSearchParams({ scene });
    if (t) params.set("topic", t);
    router.push(`/app/new?${params.toString()}`);
  }

  const recent = (sessions ?? []).slice(0, 5);
  const loading = sessions === null && !error;

  return (
    <div className={s.wrap}>
      {/* 问候区 */}
      <div className={s.greeting}>
        <h1>
          {greetText}
          {nickname ? `，${nickname}` : ""}
        </h1>
        <div className={`text-sec ${s.greetSub}`}>{greetSub}</div>
      </div>

      {/* 快速开始卡（本页唯一主导光带） */}
      <section className={s.quickCard}>
        <h2>快速开始</h2>
        <form
          className={s.quickRow}
          onSubmit={(e) => {
            e.preventDefault();
            goNew();
          }}
        >
          <input
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入你的直播主题或要讲的知识点…"
          />
          <div className="pill-group" style={{ marginTop: 10, flexBasis: "100%" }}>
            <button type="button" className={`opt-pill ${scene === "train" ? "selected" : ""}`} onClick={() => setScene("train")}>
              主播排练
            </button>
            <button type="button" className={`opt-pill ${scene === "feynman" ? "selected" : ""}`} onClick={() => setScene("feynman")}>
              费曼学习
            </button>
          </div>
          <button type="submit" className="pill pill-primary" style={{ flexBasis: "100%", marginTop: 12 }}>
            生成观众，开始排练
          </button>
        </form>
      </section>

      {/* 最近场次 */}
      <div className={s.sectionHead}>
        <h2>最近场次</h2>
        <Link href="/app/history">查看全部</Link>
      </div>

      {loading && (
        <div>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`skeleton ${s.skelCard}`} />
          ))}
        </div>
      )}

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

      {!loading && !error && recent.length === 0 && (
        <div className="empty">
          <div className="e-ico">
            <EmptyIcon />
          </div>
          <div className="e-title">还没有排练场次</div>
          <div className="e-desc">输入一个主题，AI 观众马上为你就座。</div>
          <Link href="/app/new" className="pill pill-primary">
            开第一场
          </Link>
        </div>
      )}

      {recent.map((sess) => {
        const g = `g${(hashCode(sess.topic) % 6) + 1}`;
        const href = sess.status === "live" ? `/app/live/${sess.id}` : `/app/replay/${sess.id}`;
        return (
          <Link key={sess.id} href={href} className="hcard clickable">
            <div className={`hcard-icon ${g}`}>{sess.topic.slice(0, 1)}</div>
            <div>
              <div className="hcard-title">{sess.topic}</div>
              <div className="hcard-meta">
                <span className={`tag-pill ${sess.scene === "train" ? s.sceneRehearse : ""}`}>{SCENE_LABELS[sess.scene]}</span>
                <span className="text-ter num">
                  {fmtDate(sess.startedAt)} · {fmtDuration(sess.durationSec)}
                </span>
                <StatusBadge status={sess.status} />
              </div>
            </div>
            <div className="hcard-actions">
              <span className={`pill pill-compact ${sess.status === "live" ? "pill-primary" : "pill-secondary"}`}>
                {sess.status === "live" ? "继续" : "看复盘"}
              </span>
              <ArrowIcon />
            </div>
          </Link>
        );
      })}

      <p className="disclaimer" style={{ marginTop: 40 }}>
        本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容。
      </p>
    </div>
  );
}
