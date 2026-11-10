"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TopNav from "@/components/top-nav";
import type { BotProfile, LiveEvent, LiveSession, AiTrace } from "@/lib/types";
import styles from "./live.module.css";

const LEVEL_NAMES = ["冷启动", "起量", "加热", "高热"];
const NAME_COLORS: Record<string, string> = {
  g1: "#FF4D6A",
  g2: "#4D8EFF",
  g3: "#8A5CFF",
  g4: "#3DD68C",
  g5: "#FFB84D",
  g6: "#8A93A6",
};
const QUICK_PHRASES = [
  "大家好，欢迎刚进来的朋友，今天我们聊聊这个话题，干货马上开始。",
  "自我介绍一下：我做这行几年了，踩过的坑今天一次讲完。",
  "评论区扣个 1，我看看多少人是刚起步的新手，我按人数调整节奏。",
  "觉得有用的话点个关注，明天同一时间接着讲下半场。",
  "感谢刚送出礼物的朋友，你的支持就是我讲下去的动力。",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtTs(offsetMs: number): string {
  return fmtClock(offsetMs / 1000);
}
function mergeEvents(prev: LiveEvent[], incoming: LiveEvent[]): LiveEvent[] {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const merged = [...prev];
  for (const e of incoming) if (!seen.has(e.id)) merged.push(e);
  return merged;
}

/** 左栏「关键信息」收录的事件类型：提问 / 礼物 / 系统热度事件 / 观众流失 */
const KEY_TYPES = new Set(["question", "gift", "system", "leave"]);

interface SessionData {
  session: LiveSession;
  bots: BotProfile[];
  events: LiveEvent[];
}

/** AI 引擎输出流的日志块 */
interface AiLogBlock {
  id: string;
  kind: "head" | "sec" | "err";
  title?: string;
  text: string;
}

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const [data, setData] = useState<SessionData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [online, setOnline] = useState(0);
  const [heatHist, setHeatHist] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [moods, setMoods] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [ending, setEnding] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [newCount, setNewCount] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [aiLog, setAiLog] = useState<AiLogBlock[]>([]);
  const [mobileTab, setMobileTab] = useState<"chat" | "key" | "data">("chat");

  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const endedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sayRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;
  const aiLogRef = useRef<HTMLDivElement>(null);
  const aiAtBottomRef = useRef(true);

  const session = data?.session ?? null;
  const bots = data?.bots ?? [];
  const botsById = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);

  /* ---------- 初次加载：场次 + 全量事件 + 观众群 ---------- */
  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const json = (await res.json()) as SessionData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      setData(json);
      setEvents(json.events ?? []);
      const onlineBots = (json.bots ?? []).filter((b) => b.status === "online");
      setOnline(onlineBots.length + json.session.audienceExtra);
      setHeatHist([0, Math.round(json.session.heat * 0.6), json.session.heat]);
      setMoods(Object.fromEntries(onlineBots.map((b) => [b.id, b.mood])));
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(json.session.startedAt).getTime()) / 1000)));
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- 计时（暂停冻结） ---------- */
  useEffect(() => {
    const t = setInterval(() => {
      if (!pausedRef.current) setElapsed((v) => v + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- tick 增量应用 ---------- */
  const applyTick = useCallback(
    (payload: { session: LiveSession; newEvents: LiveEvent[]; bots: { id: string; mood: number }[]; onlineCount: number; aiTrace?: AiTrace }, extra: LiveEvent[] = []) => {
      setData((d) => (d ? { ...d, session: payload.session } : d));
      setEvents((prev) => mergeEvents(prev, [...extra, ...payload.newEvents]));
      setOnline(payload.onlineCount);
      setHeatHist((h) => [...h.slice(-29), payload.session.heat]);
      setMoods((m) => {
        const n = { ...m };
        for (const b of payload.bots) n[b.id] = b.mood;
        return n;
      });
      if (payload.aiTrace) {
        const t = payload.aiTrace;
        const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        const blocks: AiLogBlock[] = [
          { id: `${t.ts}-h`, kind: "head", text: `${stamp} · ${t.model} · ${t.durationMs}ms · ${t.eventCount} 事件 · ${t.fallback ? "模板降级" : "AI 正常"}` },
        ];
        if (t.prompt) blocks.push({ id: `${t.ts}-req`, kind: "sec", title: "发出请求", text: t.prompt });
        if (t.thinking) blocks.push({ id: `${t.ts}-think`, kind: "sec", title: "深度思考", text: t.thinking });
        if (t.output) blocks.push({ id: `${t.ts}-out`, kind: "sec", title: "输出信息", text: t.output });
        if (t.error) blocks.push({ id: `${t.ts}-err`, kind: "err", title: "错误", text: t.error });
        setAiLog((prev) => [...prev, ...blocks].slice(-60));
      }
      const q = payload.newEvents.find((e) => e.type === "question");
      if (q) setBanner(`新提问：${q.content}，点击查看`);
    },
    [],
  );

  /* ---------- 每 10 秒 tick，失败静默重试 ---------- */
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const tick = async () => {
      if (pausedRef.current || endedRef.current) return;
      try {
        const res = await fetch("/api/live/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        });
        if (!res.ok) return; // 静默，下轮重试
        const payload = await res.json();
        if (alive) applyTick(payload);
      } catch {
        /* 网络异常静默 */
      }
    };
    const t = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, applyTick]);

  /* ---------- AI 输出块贴底：新内容自动滚到底部，用户上滑后暂停跟随 ---------- */
  useEffect(() => {
    const el = aiLogRef.current;
    if (el && aiAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [aiLog]);
  const onAiScroll = () => {
    const el = aiLogRef.current;
    if (!el) return;
    aiAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  /* ---------- 新提问横幅 8s 自动消失 ---------- */
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  /* ---------- 卸载/刷新：提示 + 标记中断 ---------- */
  useEffect(() => {
    if (!id) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (endedRef.current) return;
      e.preventDefault();
      e.returnValue = "排练正在进行，离开将中断本场";
      try {
        navigator.sendBeacon(`/api/sessions/${id}/interrupt`);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [id]);

  /* ---------- 弹幕贴底 / 回到底部 ---------- */
  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      setAtBottom(true);
      setNewCount(0);
    } else {
      setAtBottom(false);
    }
  };
  useEffect(() => {
    if (!events.length) return;
    if (atBottomRef.current) {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      setNewCount((c) => c + 1);
    }
  }, [events.length]);

  const backToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    setNewCount(0);
  };

  /* ---------- 发送发言（乐观上屏：消息瞬间显示，POST 后台执行；观众反应由 tick 送达） ---------- */
  const handleSend = async () => {
    const content = input.trim();
    if (!content || paused || ending) return;
    const tempId = `tmp-${Date.now()}`;
    const offsetMs = elapsed * 1000;
    // 1. 乐观上屏：立即显示主播消息并清空输入框
    setEvents((prev) => [
      ...prev,
      { id: tempId, sessionId: id, type: "host", botId: null, content, meta: {}, offsetMs, createdAt: new Date().toISOString() } as LiveEvent,
    ]);
    setInput("");
    // 2. 后台落库；完成后用真实事件替换临时消息
    try {
      const res = await fetch("/api/live/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, content }),
      });
      const json = await res.json();
      if (res.ok && json.hostEvent) {
        setEvents((prev) => {
          const withoutTemp = prev.filter((e) => e.id !== tempId);
          return mergeEvents(withoutTemp, [json.hostEvent as LiveEvent]);
        });
        if (json.session) setData((d) => (d ? { ...d, session: json.session } : d));
      } else {
        throw new Error(json.error ?? "发送失败");
      }
    } catch {
      // 发送失败：临时消息标记为失败，输入框恢复内容便于重发
      setEvents((prev) => prev.filter((e) => e.id !== tempId));
      setInput(content);
      setBanner("发送失败，内容已恢复到输入框，请重试");
    }
  };

  /* ---------- 结束直播（不阻塞：立即关弹窗 → 最多等 3s 接口 → 跳转复盘） ---------- */
  const handleEnd = async () => {
    setEnding(true);
    endedRef.current = true;
    setEndOpen(false); // 弹窗立即关闭，用户无感
    const replayUrl = `/app/replay/${id}`;
    // keepalive 确保即使页面跳转，结束请求也能完成落库
    const post = fetch(`/api/sessions/${id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interrupted: false }),
      signal: AbortSignal.timeout(15000),
      keepalive: true,
    }).catch(() => undefined);
    // 接口通常 1~2s 返回；超过 3s 不再等，跳转后接口自行完成
    await Promise.race([post, new Promise((r) => setTimeout(r, 3000))]);
    router.push(replayUrl);
    // 兜底：客户端路由跳转失败（如服务器重启后旧页面 chunk 404）时，强制整页跳转
    setTimeout(() => {
      if (!window.location.pathname.startsWith(`/app/replay/${id}`)) {
        window.location.assign(replayUrl);
      }
    }, 2500);
  };

  /* ---------- 热度迷你曲线 ---------- */
  const heatCurve = useMemo(() => {
    const pts = heatHist.length >= 2 ? heatHist : [0, 0];
    const max = Math.max(...pts, 1);
    const w = 260;
    const h = 64;
    const n = pts.length;
    const xy = pts.map((v, i) => {
      const x = (i / (n - 1)) * w;
      const y = h - 6 - (v / max) * (h - 14);
      return [x, y] as const;
    });
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { line, area: `${line} L${w},${h} L0,${h} Z`, last: xy[xy.length - 1] };
  }, [heatHist]);

  /* ---------- 情绪概览 ---------- */
  const moodPct = useMemo(() => {
    const onlineBots = bots.filter((b) => b.status === "online");
    if (!onlineBots.length) return null;
    let good = 0;
    let mid = 0;
    let bad = 0;
    for (const b of onlineBots) {
      const m = moods[b.id] ?? b.mood;
      if (m >= 20) good++;
      else if (m <= -20) bad++;
      else mid++;
    }
    const total = onlineBots.length;
    return {
      good: Math.round((good / total) * 100),
      mid: Math.round((mid / total) * 100),
      bad: Math.round((bad / total) * 100),
    };
  }, [bots, moods]);

  /* ---------- 左栏关键信息：提问 / 礼物 / 系统事件 / 流失 ---------- */
  const keyEvents = useMemo(() => events.filter((e) => KEY_TYPES.has(e.type)), [events]);
  const pendingQ = useMemo(
    () =>
      events.filter(
        (e) => e.type === "question" && !answeredIds.has(e.id) && !((e.meta ?? {}) as Record<string, unknown>).answered,
      ).length,
    [events, answeredIds],
  );

  /* ---------- 事件渲染 ---------- */
  function renderEvent(ev: LiveEvent) {
    const meta = (ev.meta ?? {}) as Record<string, unknown>;
    const bot = ev.botId ? botsById.get(ev.botId) : undefined;
    const name = (meta.name as string) ?? bot?.name ?? "观众";
    const g = (meta.gradient as string) ?? bot?.gradient ?? `g${(hashCode(ev.botId ?? ev.id) % 6) + 1}`;
    const color = NAME_COLORS[g] ?? "#8A93A6";

    if (ev.type === "chat") {
      return (
        <div key={ev.id} className={styles.dm}>
          <span className={`avatar avatar-24 ${g}`} style={{ marginTop: 1 }}>{name.slice(0, 1)}</span>
          <div className={styles.dmBody}>
            <span className={styles.dmName} style={{ color }}>{name}</span>
            <span className={styles.dmText}>{ev.content}</span>
          </div>
        </div>
      );
    }
    if (ev.type === "gift") {
      return (
        <div key={ev.id} className={`${styles.dm} ${styles.dmGift}`}>
          <span className={`avatar avatar-24 ${g}`} style={{ marginTop: 1 }}>{name.slice(0, 1)}</span>
          <div className={styles.dmBody}>
            <span className={styles.dmName} style={{ color: NAME_COLORS.g5 }}>{name}</span>
            <span className={`${styles.dmText} ${styles.dmTextGift}`}>{ev.content}</span>
          </div>
        </div>
      );
    }
    if (ev.type === "host") {
      return (
        <div key={ev.id} className={`${styles.dm} ${styles.dmSelf}`}>
          <span className={`avatar avatar-24 ${styles.hostAvatar}`}>主</span>
          <div className={styles.dmBody}>
            <span className={styles.hostName}>
              <span className={styles.hostBadge}>主播</span>
            </span>
            <span className={styles.dmText}>{ev.content}</span>
          </div>
        </div>
      );
    }
    if (ev.type === "question") {
      const isAnswered = answeredIds.has(ev.id) || !!meta.answered;
      return (
        <div key={ev.id} className={`${styles.qCard} ${isAnswered ? styles.qAnswered : styles.qPending}`}>
          <div className={styles.qHead}>
            <span className={`${styles.qTag} ${isAnswered ? styles.qTagOk : ""}`}>提问</span>
            <span className={styles.qUser}>{name} · {fmtTs(ev.offsetMs)}</span>
          </div>
          <div className={styles.qText}>{ev.content}</div>
          <div className={styles.qActions}>
            {isAnswered ? (
              <span className={styles.qAnsweredMark}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                已回应
              </span>
            ) : (
              <button
                className={styles.qMarkBtn}
                onClick={() => setAnsweredIds((s) => new Set(s).add(ev.id))}
              >
                标记已回应
              </button>
            )}
          </div>
        </div>
      );
    }
    if (ev.type === "enter") {
      return (
        <div key={ev.id} className={styles.dmSys}>
          <svg className={styles.sysIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></svg>
          {ev.content}
        </div>
      );
    }
    if (ev.type === "leave") {
      return (
        <div key={ev.id} className={`${styles.dmSys} ${styles.sysExit}`}>
          <svg className={styles.sysIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          {ev.content}
        </div>
      );
    }
    if (ev.type === "system") {
      return (
        <div key={ev.id} className={`${styles.dmSys} ${styles.sysFlow}`}>
          <svg className={styles.sysIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>
          {ev.content}
        </div>
      );
    }
    // follow / mood_change / heat 等以中性系统条目呈现
    return (
      <div key={ev.id} className={styles.dmSys}>
        <svg className={styles.sysIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        {ev.content}
      </div>
    );
  }

  /* ---------- 加载 / 错误态 ---------- */
  return (
    <div className={styles.page}>
      <TopNav />
      {loadErr ? (
        <div className={styles.loadWrap}>
          <div className="error-card">
            <span>{loadErr}</span>
            <button className="pill pill-ghost pill-compact" onClick={() => void load()}>重试</button>
          </div>
        </div>
      ) : !data ? (
        <div className={styles.loadWrap}>
          <div className={`${styles.loadSkeleton} skeleton`} />
        </div>
      ) : (
        <>
          {/* 状态条（沉浸式：无站点导航，左侧返回入口） */}
          <header className={`${styles.topbar} ${paused ? styles.paused : ""}`}>
            <Link href="/app" className={styles.exitLink} aria-label="返回工作台">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              <span className={styles.exitTxt}>工作台</span>
            </Link>
            <span className={styles.liveLabel}>
              <span className="live-dot" />LIVE
            </span>
            <span className={styles.timer}>{fmtClock(elapsed)}</span>
            {paused && (
              <span className={styles.pauseBadge}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                已暂停
              </span>
            )}
            <span className={styles.topic}>{session?.topic}</span>
            <div className={styles.topbarRight}>
              {session && (
                <span className={`badge badge-l${session.heatLevel}`}>
                  <i className="dot" />L{session.heatLevel} {LEVEL_NAMES[session.heatLevel] ?? ""}
                </span>
              )}
              <button className="pill pill-secondary pill-compact" onClick={() => setPaused((v) => !v)}>
                {paused ? "继续" : "暂停"}
              </button>
              <button className="pill pill-ghost pill-ghost-danger pill-compact" onClick={() => setEndOpen(true)}>
                结束直播
              </button>
            </div>
          </header>

          {/* 三栏：左=关键信息 · 中=完整对话流 · 右=数据/AI */}
          <div className={`${styles.grid} ${mobileTab === "key" ? styles.tabKey : mobileTab === "data" ? styles.tabData : ""}`}>
            {/* 左栏：关键信息（提问 / 礼物 / 系统事件 / 流失）+ 情绪概览 */}
            <aside className={styles.colLeft}>
              <div className={styles.keyHead}>
                <span className={styles.keyTitle}>关键信息</span>
                {pendingQ > 0 && <span className={styles.keyBadge}>{pendingQ} 条提问待回应</span>}
              </div>
              {moodPct && (
                <div className={`panel ${styles.moodCard}`}>
                  <div className={styles.moodHead}>
                    <span className="panel-title" style={{ fontSize: 13 }}>观众情绪概览</span>
                    <span className="text-ter num">在线 {online} 人</span>
                  </div>
                  <div className={styles.moodTrack}>
                    <i style={{ width: `${moodPct.good}%`, background: "var(--success)" }} />
                    <i style={{ width: `${moodPct.mid}%`, background: "var(--text-tertiary)" }} />
                    <i style={{ width: `${moodPct.bad}%`, background: "var(--danger)" }} />
                  </div>
                  <div className={styles.moodLegend}>
                    <span><i style={{ background: "var(--success)" }} />满意 <span className={styles.num}>{moodPct.good}%</span></span>
                    <span><i style={{ background: "var(--text-tertiary)" }} />中性 <span className={styles.num}>{moodPct.mid}%</span></span>
                    <span><i style={{ background: "var(--danger)" }} />不耐烦 <span className={styles.num}>{moodPct.bad}%</span></span>
                  </div>
                </div>
              )}
              <div className={styles.keyList}>
                {keyEvents.length === 0 ? (
                  <div className={styles.keyEmpty}>暂无关键事件 · 出现提问、礼物或热度变化时会在这里提示</div>
                ) : (
                  keyEvents.map(renderEvent)
                )}
              </div>
            </aside>

            {/* 中栏：完整对话流 + 发言区 */}
            <main className={styles.colMid}>
              {banner && (
                <div className={styles.questionBanner}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                  {banner}
                </div>
              )}
              <div className={styles.chatList} ref={listRef} onScroll={onListScroll}>
                {events.map(renderEvent)}
              </div>
              {newCount > 0 && (
                <button className={styles.backBottom} onClick={backToBottom}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
                  回到底部 · <span className={styles.num}>{newCount}</span> 条新消息
                </button>
              )}
              <div className={styles.composer}>
                <div className={styles.quickPhrases}>
                  {QUICK_PHRASES.map((p, i) => (
                    <button
                      key={i}
                      className="opt-pill small"
                      onClick={() => {
                        setInput(p);
                        sayRef.current?.focus();
                      }}
                    >
                      {["开场白", "自我介绍", "互动提问", "引导关注", "感谢礼物"][i]}
                    </button>
                  ))}
                </div>
                <div className={styles.composerRow}>
                  <textarea
                    ref={sayRef}
                    className={styles.composerBox}
                    rows={1}
                    maxLength={500}
                    placeholder="开始你的直播…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button
                    className="pill pill-primary breath"
                    style={{ height: 44 }}
                    disabled={!input.trim()}
                    onClick={() => void handleSend()}
                  >
                    发送
                  </button>
                </div>
                <div className={styles.composerFoot}>
                  <span className={styles.num}>{input.length}</span> / 500 · Enter 发送 · Shift+Enter 换行
                </div>
              </div>
            </main>

            {/* 右栏：热度 / 流量池 / 实时数据 */}
            <aside className={styles.colRight}>
              <div className={styles.rightCards}>
                <div className={`rcard ${styles.heatCard}`}>
                  <div className={styles.rcardTitle}>直播间热度</div>
                  <div className={styles.heatRow}>
                    <span className={styles.heatBig}>{session?.heat ?? 0}</span>
                    {session && (
                      <span className={`badge badge-l${session.heatLevel}`}>
                        <i className="dot" />L{session.heatLevel} {LEVEL_NAMES[session.heatLevel] ?? ""}
                      </span>
                    )}
                  </div>
                  <svg viewBox="0 0 260 64" width="100%" height="64" className={styles.heatSvg} aria-hidden="true">
                    <defs>
                      <linearGradient id="heatStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#5C6578" />
                        <stop offset="0.35" stopColor="#4D8EFF" />
                        <stop offset="0.7" stopColor="#8A5CFF" />
                        <stop offset="1" stopColor="#FF4D6A" />
                      </linearGradient>
                      <linearGradient id="heatFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#8A5CFF" stopOpacity="0.08" />
                        <stop offset="1" stopColor="#8A5CFF" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
                      <line x1="0" y1="16" x2="260" y2="16" /><line x1="0" y1="32" x2="260" y2="32" /><line x1="0" y1="48" x2="260" y2="48" />
                    </g>
                    <path d={heatCurve.area} fill="url(#heatFill)" />
                    <path d={heatCurve.line} fill="none" stroke="url(#heatStroke)" strokeWidth="2" strokeLinecap="round" />
                    {heatHist.length >= 2 && (
                      <circle cx={heatCurve.last[0]} cy={heatCurve.last[1]} r="3" fill="#FF4D6A" />
                    )}
                  </svg>
                  <div className="text-ter">实时曲线 · 近 15 分钟</div>
                </div>

                <div className="rcard">
                  <div className={styles.rcardTitle}>流量池</div>
                  <div className={styles.poolRow}>
                    {session && (
                      <span className={`badge badge-l${session.heatLevel}`}>
                        <i className="dot" />L{session.heatLevel} {LEVEL_NAMES[session.heatLevel] ?? ""}池
                      </span>
                    )}
                    <span className="text-ter">稳定推送中</span>
                  </div>
                  <div className={styles.statRows}>
                    <div className={styles.statRow}>
                      <span>推送新增观众</span>
                      <span className={`${styles.statNum} ${styles.statUp}`}>+{session?.stats.enterCount ?? 0}</span>
                    </div>
                    <div className={styles.statRow}>
                      <span>当前热度值</span>
                      <span className={styles.statNum}>{session?.heat ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="rcard">
                  <div className={styles.rcardTitle}>实时数据</div>
                  <div className={styles.statRows}>
                    <div className={styles.statRow}><span>当前在线</span><span className={styles.statNum}>{online}</span></div>
                    <div className={styles.statRow}><span>弹幕数</span><span className={styles.statNum}>{session?.stats.danmakuCount ?? 0}</span></div>
                    <div className={styles.statRow}><span>提问总数</span><span className={styles.statNum}>{session?.stats.questionCount ?? 0}</span></div>
                    <div className={styles.statRow}><span>礼物数</span><span className={styles.statNum}>{session?.stats.giftCount ?? 0}</span></div>
                  </div>
                </div>

                {/* AI 引擎观测：单一输出流，贴底自动跟随 */}
                <div className={`rcard ${styles.aiCard}`}>
                  <div className={styles.aiHead}>
                    <div className={styles.rcardTitle}>AI 引擎</div>
                  </div>
                  <div className={styles.aiOut} ref={aiLogRef} onScroll={onAiScroll}>
                    {aiLog.length === 0 && (
                      <div className={styles.aiEmpty}>等待引擎调度…（每 10 秒一次，开播后自动输出）</div>
                    )}
                    {aiLog.map((b) =>
                      b.kind === "head" ? (
                        <div key={b.id} className={styles.aiLogHead}>{b.text}</div>
                      ) : (
                        <div key={b.id} className={b.kind === "err" ? styles.aiLogErr : styles.aiLogSec}>
                          <div className={styles.aiLogTitle}>── {b.title} ──</div>
                          <pre className={styles.aiPre}>{b.text}</pre>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <p className="disclaimer">AI 虚拟观众 · 模拟直播环境</p>
              </div>
            </aside>
          </div>

          {/* 移动端底部三 tab */}
          <nav className={styles.mobileTabs}>
            {(["chat", "key", "data"] as const).map((t) => (
              <button
                key={t}
                className={`${styles.mTab} ${mobileTab === t ? styles.mTabActive : ""}`}
                onClick={() => setMobileTab(t)}
              >
                {t === "chat" ? "对话" : t === "key" ? "关键" : "数据"}
              </button>
            ))}
          </nav>

          {/* 结束确认模态 */}
          <div className={`modal-mask ${endOpen ? "show" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setEndOpen(false); }}>
            <div className="modal">
              <h3>确定结束这场排练？</h3>
              <p className="modal-desc">结束后将立即生成复盘报告。</p>
              <div className="modal-actions">
                <button className="pill pill-ghost" disabled={ending} onClick={() => setEndOpen(false)}>继续直播</button>
                <button className="pill pill-primary loading" disabled={ending} onClick={() => void handleEnd()}>
                  {ending ? "结束中" : "结束并复盘"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
