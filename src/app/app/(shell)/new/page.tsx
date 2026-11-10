"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BotProfile, Difficulty, LiveSession, Scene } from "@/lib/types";
import { KNOWLEDGE_LABELS } from "@/lib/types";
import s from "./page.module.css";

type Phase = "config" | "generating" | "ready";

const TEMPER_OPTIONS: { value: Difficulty["temper"]; label: string }[] = [
  { value: "gentle", label: "温和" },
  { value: "normal", label: "正常" },
  { value: "harsh", label: "暴躁" },
];
const SILENCE_OPTIONS: { value: Difficulty["silence"]; label: string }[] = [
  { value: "lenient", label: "宽容" },
  { value: "medium", label: "中等" },
  { value: "strict", label: "严格" },
];
const DURATION_OPTIONS = [10, 20, 40, 60];

const EXAMPLES = ["3 天涨粉 1000 的短视频方法论", "TCP 为什么握手要三次"];

const CheckIcon = () => (
  <span className="check">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </span>
);

const ChevIcon = () => (
  <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function PatienceBar({ value }: { value: number }) {
  const cells = [1, 2, 3, 4, 5];
  return (
    <div className={`patience ${value <= 2 ? "low" : ""}`}>
      {cells.map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </div>
  );
}

function NewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeRef = useRef<HTMLInputElement>(null);

  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [scene, setScene] = useState<Scene>(searchParams.get("scene") === "feynman" ? "feynman" : "train");
  const [temper, setTemper] = useState<Difficulty["temper"]>("normal");
  const [silence, setSilence] = useState<Difficulty["silence"]>("medium");
  const [durationMin, setDurationMin] = useState(20);
  const [diffOpen, setDiffOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("config");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    themeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topicOk = topic.trim().length > 0;

  async function generate() {
    if (!topicOk || phase === "generating") return;
    setPhase("generating");
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          scene,
          difficulty: { temper, silence, durationMin },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setSession(data.session as LiveSession);
      setBots(data.bots as BotProfile[]);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
      setPhase("config");
    }
  }

  function goLive() {
    if (session) router.push(`/app/live/${session.id}`);
  }

  const temperLabel = TEMPER_OPTIONS.find((o) => o.value === temper)?.label ?? "";
  const silenceLabel = SILENCE_OPTIONS.find((o) => o.value === silence)?.label ?? "";

  return (
    <div className={s.wrap}>
      <h1 className="page-title">新建排练</h1>

      {/* 第 1 步 · 主题 */}
      <section className={s.step}>
        <div className={s.stepLabel}>
          <b>1</b> 主题
        </div>
        <input
          ref={themeRef}
          className="theme-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="输入你的直播主题或要讲的知识点…"
        />
        <div className={s.examplePills}>
          <span className="text-ter" style={{ alignSelf: "center" }}>试试：</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="opt-pill small" onClick={() => setTopic(ex)}>
              {ex === EXAMPLES[0] ? "3 天涨粉的短视频方法论" : ex}
            </button>
          ))}
        </div>
      </section>

      {/* 第 2 步 · 场景 */}
      <section className={s.step}>
        <div className={s.stepLabel}>
          <b>2</b> 场景
        </div>
        <div className="scene-row">
          <button type="button" className={`scene-card ${scene === "train" ? "selected" : ""}`} onClick={() => setScene("train")}>
            <CheckIcon />
            <h4>主播排练</h4>
            <p>为真实开播而练：带货、知识分享、才艺、聊天直播</p>
          </button>
          <button type="button" className={`scene-card ${scene === "feynman" ? "selected" : ""}`} onClick={() => setScene("feynman")}>
            <CheckIcon />
            <h4>费曼学习</h4>
            <p>把知识讲给「会追问的学生」听，讲不明白的地方会被追问</p>
          </button>
        </div>
      </section>

      {/* 第 3 步 · 观众群（生成后显示） */}
      {(phase === "ready" || phase === "generating") && (
        <section className={s.step}>
          <div className={s.stepLabel}>
            <b>3</b> 观众群
            {phase === "ready" && <span className="text-ter num">已生成 {bots.length} 位</span>}
          </div>

          {phase === "generating" && (
            <>
              <div className="text-sec" style={{ marginBottom: 12 }}>正在根据主题生成观众群…</div>
              <div className={s.botGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`skeleton ${s.skelBot}`}>
                    <span className="avatar avatar-48 skeleton" style={{ background: "var(--bg-panel-raised)" }} />
                    <div className={`skeleton ${s.skelLine}`} />
                    <div className={`skeleton ${s.skelLineShort}`} />
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === "ready" && (
            <div className={s.botGrid}>
              {bots.map((bot, i) => (
                <div key={bot.id} className={s.botCard} style={{ animationDelay: `${i * 40}ms` }}>
                  <span className={`avatar avatar-48 ${bot.gradient}`}>{bot.name.slice(0, 1)}</span>
                  <div className={s.botName}>{bot.name}</div>
                  <div className={s.botPersona}>
                    <span className="tag-pill">{bot.personaLabel}</span>
                  </div>
                  <div className={s.botDesc}>
                    {bot.occupation}
                    {KNOWLEDGE_LABELS[bot.knowledgeLevel] ? ` · ${KNOWLEDGE_LABELS[bot.knowledgeLevel]}` : ""}
                  </div>
                  <PatienceBar value={bot.patience} />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="error-card" style={{ marginTop: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span>生成失败：{error}</span>
              <button type="button" className="pill pill-ghost pill-compact" onClick={generate}>
                重试
              </button>
            </div>
          )}
        </section>
      )}

      {/* 第 4 步 · 难度设置 */}
      <section className={s.step}>
        <div className={s.stepLabel}>
          <b>4</b> 难度设置
        </div>
        <div className={`collapse ${diffOpen ? "open" : ""}`}>
          <button type="button" className="collapse-head" onClick={() => setDiffOpen((v) => !v)}>
            {temperLabel}脾气 / {silenceLabel}冷场敏感 / {durationMin} 分钟
            <ChevIcon />
          </button>
          <div className="collapse-body">
            <div className="collapse-body-inner">
              <div className={s.diffGroup}>
                <div className={s.groupHead}>
                  <span className={s.groupName}>观众脾气</span>
                  <span className="text-ter">影响观众容忍冷场与提问落空的耐心上限</span>
                </div>
                <div className="pill-group">
                  {TEMPER_OPTIONS.map((o) => (
                    <button key={o.value} type="button" className={`opt-pill ${temper === o.value ? "selected" : ""}`} onClick={() => setTemper(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.diffGroup}>
                <div className={s.groupHead}>
                  <span className={s.groupName}>冷场敏感度</span>
                  <span className="text-ter">沉默多久开始判定冷场并扣热度</span>
                </div>
                <div className="pill-group">
                  {SILENCE_OPTIONS.map((o) => (
                    <button key={o.value} type="button" className={`opt-pill ${silence === o.value ? "selected" : ""}`} onClick={() => setSilence(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.diffGroup}>
                <div className={s.groupHead}>
                  <span className={s.groupName}>场次时长</span>
                  <span className="text-ter">到时自动结束并生成复盘</span>
                </div>
                <div className="pill-group">
                  {DURATION_OPTIONS.map((d) => (
                    <button key={d} type="button" className={`opt-pill small ${durationMin === d ? "selected" : ""}`} onClick={() => setDurationMin(d)}>
                      {d} 分钟
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 底部固定操作条 */}
      <div className={s.actionBar}>
        <div className={s.actionBarInner}>
          <span className={s.configSum}>
            {scene === "train" ? "主播排练" : "费曼学习"}
            {phase === "ready" ? ` · ${bots.length} 位观众` : ""}
            {" · "}{temperLabel}脾气 / {silenceLabel}冷场 / {durationMin} 分钟
          </span>
          {phase === "ready" ? (
            <button type="button" className="pill pill-primary" onClick={goLive}>
              开播
            </button>
          ) : (
            <button
              type="button"
              className={`pill pill-primary ${phase === "generating" ? "loading" : ""}`}
              disabled={!topicOk || phase === "generating"}
              title={topicOk ? undefined : "先输入主题"}
              onClick={generate}
            >
              生成观众群
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewRehearsalPage() {
  return (
    <Suspense fallback={null}>
      <NewInner />
    </Suspense>
  );
}
