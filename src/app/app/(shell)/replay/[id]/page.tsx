"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TopNav from "@/components/top-nav";
import type { BotProfile, LiveEvent, LiveSession } from "@/lib/types";
import styles from "./replay.module.css";

const SCENE_LABELS: Record<string, string> = { train: "主播排练", feynman: "费曼学习" };
const LEVEL_COLORS = ["var(--l0)", "var(--l1)", "var(--l2)", "var(--l3)"];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface ReplayData {
  session: LiveSession;
  bots: BotProfile[];
  events: LiveEvent[];
}

/** 参与回放控制条/曲线打点的事件类型 */
const NOTABLE = new Set(["host", "system", "gift", "leave", "question"]);
/** 曲线上的关键事件（纯白实心点） */
const KEY_EVENTS = new Set(["system", "gift"]);

export default function ReplayPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [data, setData] = useState<ReplayData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [giveUp, setGiveUp] = useState(false);
  const [sec, setSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const secRef = useRef(0);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const wrapRef = useRef<HTMLDivElement>(null);

  /* ---------- 加载 ---------- */
  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const json = (await res.json()) as ReplayData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      setData(json);
      setGiveUp(false);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- 空报告：每 5s 重试，最多 12 次 ---------- */
  const hasReport = !!data?.session.aiReport;
  useEffect(() => {
    if (!data || hasReport) return;
    let tries = 0;
    let alive = true;
    const t = setInterval(async () => {
      tries++;
      if (tries > 12) {
        clearInterval(t);
        setGiveUp(true);
        return;
      }
      try {
        const res = await fetch(`/api/sessions/${id}`);
        const json = (await res.json()) as ReplayData;
        if (alive && res.ok && json.session?.aiReport) {
          setData(json);
          clearInterval(t);
        }
      } catch {
        /* 静默 */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [data, hasReport, id]);

  const session = data?.session ?? null;
  const events = useMemo(
    () => (data?.events ?? []).slice().sort((a, b) => a.offsetMs - b.offsetMs),
    [data],
  );
  const botsById = useMemo(
    () => new Map((data?.bots ?? []).map((b) => [b.id, b])),
    [data],
  );

  const durationSec = useMemo(() => {
    if (!session) return 0;
    if (session.durationSec && session.durationSec > 0) return session.durationSec;
    const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    return Math.max(1, Math.round((end - new Date(session.startedAt).getTime()) / 1000));
  }, [session]);

  /* ---------- 回放推进：1x 时 30 秒走完全程 ---------- */
  useEffect(() => {
    if (!playing || durationSec <= 0) return;
    let raf = 0;
    const t0 = performance.now();
    const base = secRef.current;
    const step = (now: number) => {
      const s = base + ((now - t0) / 1000) * (durationSec / 30) * speedRef.current;
      if (s >= durationSec) {
        secRef.current = durationSec;
        setSec(durationSec);
        setPlaying(false);
        return;
      }
      secRef.current = s;
      setSec(s);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationSec]);

  const seekToSec = useCallback((s: number) => {
    const clamped = Math.max(0, Math.min(s, durationSec));
    secRef.current = clamped;
    setSec(clamped);
  }, [durationSec]);

  const seekToPct = useCallback(
    (pct: number) => seekToSec(pct * durationSec),
    [seekToSec, durationSec],
  );

  /* ---------- 进度条拖拽 ---------- */
  const onProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const calc = (clientX: number) => {
      const rect = wrap.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    };
    seekToPct(calc(e.clientX));
    const mv = (ev: PointerEvent) => seekToPct(calc(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  /* ---------- 指标 ---------- */
  const metrics = useMemo(() => {
    if (!session) return null;
    const st = session.stats;
    const peak = Math.max(1, session.peakOnline);
    const finalOnline = (data?.bots ?? []).filter((b) => b.status === "online").length;
    return [
      { label: "峰值在线", value: String(session.peakOnline), color: undefined as string | undefined },
      { label: "平均在线", value: String(Math.round(peak / 2)), color: undefined },
      { label: "热度峰值", value: String(session.peakHeat), color: LEVEL_COLORS[Math.min(3, session.heatLevel)] },
      {
        label: "提问回应率",
        value: st.questionCount > 0 ? `${Math.round((st.questionAnswered / st.questionCount) * 100)}%` : "—",
        color: undefined,
      },
      {
        label: "观众留存率",
        value: st.enterCount > 0 ? `${Math.round((finalOnline / st.enterCount) * 100)}%` : "—",
        color: st.enterCount > 0 && finalOnline / st.enterCount >= 0.5 ? "var(--success)" : undefined,
      },
    ];
  }, [session, data]);

  /* ---------- 热度演示曲线（events 无 heat 点时的降级方案） ---------- */
  const curve = useMemo(() => {
    if (!session) return null;
    const W = 1000;
    const H = 280;
    const TOP = 24;
    const BOTTOM = 262;
    const peak = Math.max(1, session.peakHeat);
    const N = 80;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const base = peak * (0.12 + 0.88 * Math.pow(t, 0.85));
      const wiggle = Math.sin(t * Math.PI * 6) * peak * 0.05 * (0.3 + t);
      const heat = Math.max(0, Math.min(peak, base + wiggle));
      pts.push([(t * W), BOTTOM - (heat / peak) * (BOTTOM - TOP)]);
    }
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    const yAt = (x: number) => {
      const step = W / N;
      const idx = Math.max(0, Math.min(N - 1, Math.floor(x / step)));
      const [x0, y0] = pts[idx];
      const [x1, y1] = pts[idx + 1];
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    };
    return { W, H, line, area, pts, yAt };
  }, [session]);

  const notableEvents = useMemo(() => events.filter((e) => NOTABLE.has(e.type)), [events]);

  const progressTicks = useMemo(
    () =>
      notableEvents
        .map((e) => ({
          id: e.id,
          left: durationSec > 0 ? (e.offsetMs / 1000 / durationSec) * 100 : 0,
          key: KEY_EVENTS.has(e.type),
        }))
        .filter((t) => t.left >= 0 && t.left <= 100),
    [notableEvents, durationSec],
  );

  /* ---------- 加载 / 错误 / 空态 ---------- */
  if (!data && !loadErr) {
    return (
      <div className="page page-fade">
        <TopNav />
        <div className="page-body">
          <div className={`${styles.skeletonBlock} skeleton`} style={{ height: 96 }} />
          <div className={styles.skeletonGrid}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`skeleton ${styles.skeletonMetric}`} />
            ))}
          </div>
          <div className={`skeleton ${styles.skeletonBlock}`} style={{ height: 280 }} />
        </div>
      </div>
    );
  }
  if (loadErr || !session) {
    return (
      <div className="page page-fade">
        <TopNav />
        <div className="page-body">
          <div className="error-card">
            <span>{loadErr ?? "场次不存在"}</span>
            <button className="pill pill-ghost pill-compact" onClick={() => void load()}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  const pct = durationSec > 0 ? Math.min(100, (sec / durationSec) * 100) : 0;
  const report = session.aiReport;
  const replayHref = `/app/new?topic=${encodeURIComponent(session.topic)}&scene=${session.scene}`;

  return (
    <div className="page page-fade">
      <TopNav />
      <main className={`${styles.pageBody} page-body`}>
        {/* ① 场次头 */}
        <div className={styles.replayHead}>
          <div className={styles.rhMain}>
            <h1>{session.topic}</h1>
            <div className={styles.rhMeta}>
              <span className={`tag-pill ${styles.scenePill}`}>{SCENE_LABELS[session.scene] ?? session.scene}</span>
              <span className="text-ter num">
                {fmtDate(session.startedAt)} · 时长 {fmtClock(durationSec)}
              </span>
            </div>
          </div>
          <a className="pill pill-primary" href={replayHref}>再来一场</a>
        </div>

        {/* ② 指标区 ×5 */}
        {metrics && (
          <div className={styles.metrics}>
            {metrics.map((m) => (
              <div key={m.label} className={styles.metric}>
                <div className={styles.mLabel}>{m.label}</div>
                <div className={styles.mNum} style={m.color ? { color: m.color } : undefined}>{m.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ③ 回放控制条 */}
        <div className={styles.replayBar}>
          <button className={styles.playBtn} title={playing ? "暂停" : "播放"} onClick={() => setPlaying((v) => !v)}>
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7Z" /></svg>
            )}
          </button>
          <div className={styles.progressWrap} ref={wrapRef} onPointerDown={onProgressPointerDown}>
            <div className={styles.progressTrack} />
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            {progressTicks.map((t) => (
              <i
                key={t.id}
                className={`${styles.progressTick} ${t.key ? styles.tickKey : ""}`}
                style={{ left: `${t.left}%` }}
              />
            ))}
            <div className={styles.progressCursor} style={{ left: `${pct}%` }} />
          </div>
          <span className={styles.replayTime}>
            <span>{fmtClock(sec)}</span> / {fmtClock(durationSec)}
          </span>
          <div className="pill-group">
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                className={`opt-pill small ${speed === v ? "selected" : ""}`}
                onClick={() => setSpeed(v)}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>

        {/* ④ 热度曲线 */}
        <section className={`panel ${styles.curveCard}`}>
          <div className={styles.curveHead}>
            <h2 className="panel-title">热度曲线</h2>
            <span className="text-ter">拖动或播放控制条，游标将同步 · 点击时间轴条目可定位</span>
          </div>
          {curve && (
            <svg viewBox={`0 0 ${curve.W} ${curve.H}`} width="100%" className={styles.curveSvg} aria-hidden="true">
              <defs>
                <linearGradient id="cStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#5C6578" />
                  <stop offset="0.3" stopColor="#4D8EFF" />
                  <stop offset="0.6" stopColor="#8A5CFF" />
                  <stop offset="1" stopColor="#FF4D6A" />
                </linearGradient>
                <linearGradient id="cFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FF4D6A" stopOpacity="0.08" />
                  <stop offset="1" stopColor="#FF4D6A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
                <line x1="0" y1="56" x2={curve.W} y2="56" />
                <line x1="0" y1="112" x2={curve.W} y2="112" />
                <line x1="0" y1="168" x2={curve.W} y2="168" />
                <line x1="0" y1="224" x2={curve.W} y2="224" />
              </g>
              <path d={curve.area} fill="url(#cFill)" />
              <path d={curve.line} fill="none" stroke="url(#cStroke)" strokeWidth="2" strokeLinecap="round" />
              {notableEvents.map((e) => {
                const x = durationSec > 0 ? (e.offsetMs / 1000 / durationSec) * curve.W : 0;
                const y = curve.yAt(x);
                const key = KEY_EVENTS.has(e.type);
                return key ? (
                  <circle key={e.id} cx={x} cy={y} r="5" fill="#FFFFFF" />
                ) : (
                  <circle key={e.id} cx={x} cy={y} r="4.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
                );
              })}
              <line
                x1={(pct / 100) * curve.W} y1="0"
                x2={(pct / 100) * curve.W} y2={curve.H}
                stroke="rgba(255,77,106,0.6)" strokeWidth="1" strokeDasharray="3 3"
              />
              <circle
                cx={(pct / 100) * curve.W}
                cy={curve.yAt((pct / 100) * curve.W)}
                r="5" fill="#FFF" stroke="#FF4D6A" strokeWidth="2"
              />
            </svg>
          )}
          <div className={styles.curveLegend}>
            {["L0 冷启动", "L1 起量", "L2 加热", "L3 高热"].map((label, i) => (
              <span key={label}><i style={{ background: LEVEL_COLORS[i] }} />{label}</span>
            ))}
          </div>
        </section>

        {/* ⑤ 事件时间轴 + AI 报告（7:5） */}
        <div className={styles.split7}>
          <section className="panel">
            <h2 className="panel-title" style={{ marginBottom: 14 }}>事件时间轴</h2>
            <div className={styles.timeline}>
              {events.slice(0, 200).map((e) => {
                const key = KEY_EVENTS.has(e.type);
                const bot = e.botId ? botsById.get(e.botId) : undefined;
                const name = ((e.meta?.name as string) ?? bot?.name ?? "").trim();
                const prefix = name && !e.content.startsWith(name) ? `${name}：` : "";
                return (
                  <div
                    key={e.id}
                    className={`${styles.tlItem} ${key ? styles.tlKey : ""}`}
                    onClick={() => seekToSec(e.offsetMs / 1000)}
                  >
                    <span className={styles.tlTime}>{fmtClock(e.offsetMs / 1000)}</span>
                    <div className={styles.tlText}>
                      {prefix}
                      {e.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`panel ${styles.aiCard}`}>
            <div className={styles.aiHead}>
              <span className={styles.aiIco}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" /><circle cx="12" cy="12" r="3" /></svg>
              </span>
              <div>
                <div className="panel-title">AI 复盘报告</div>
                {report && <div className="text-ter">生成于 {fmtDate(report.generatedAt)}</div>}
              </div>
            </div>

            {!report ? (
              <div className={styles.aiGenerating}>
                <span className={styles.aiSpinner} />
                <p>
                  {giveUp
                    ? "报告生成超时，请稍后刷新本页重试。"
                    : "AI 正在生成你的复盘报告，通常需要 1 分钟"}
                </p>
              </div>
            ) : (
              <>
                <div className={styles.aiSection}>
                  <h4>总结</h4>
                  <p>{report.summary}</p>
                </div>
                {report.highlights.length > 0 && (
                  <div className={styles.aiSection}>
                    <h4>最值得保留的 {report.highlights.length} 句话</h4>
                    {report.highlights.map((h, i) => (
                      <div key={i} className={styles.aiQuote}>{h}</div>
                    ))}
                  </div>
                )}
                {report.problems.length > 0 && (
                  <div className={styles.aiSection}>
                    <h4>最危险的时刻</h4>
                    {report.problems.map((p, i) => (
                      <div key={i} className={styles.aiRisk}>
                        <span className={styles.rTime}>{p.time}</span>
                        <span>{p.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
                {report.suggestions.length > 0 && (
                  <div className={styles.aiSection}>
                    <h4>改进建议</h4>
                    {report.suggestions.map((s, i) => (
                      <p key={i} className={styles.aiSuggest}>{i + 1}. {s}</p>
                    ))}
                  </div>
                )}
                {report.feynman && (
                  <div className={styles.aiSection}>
                    <h4>费曼学习 · 概念缺口</h4>
                    {report.feynman.conceptGaps.map((g, i) => (
                      <p key={i} className={styles.aiSuggest}>· {g}</p>
                    ))}
                    <p className="text-ter" style={{ marginTop: 6 }}>
                      追问次数 <span className={styles.num}>{report.feynman.followUpCount}</span>
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <div className={styles.replayFoot}>
          <a className="pill pill-primary" href={replayHref}>再来一场</a>
        </div>
      </main>

      <div className={styles.footPad}>
        <p className="disclaimer">
          本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容，不构成任何真实平台的数据或建议。© 2025 LiveMaster 直播大师
        </p>
      </div>
    </div>
  );
}
