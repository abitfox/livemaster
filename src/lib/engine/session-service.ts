/**
 * 场次服务层：Route Handler 共用的 DB 读写逻辑（service_role + 显式 user_id 校验）。
 */
import { getAdminClient, requireUserId, AuthError } from "@/lib/supabase/admin";
import type {
  AiReport, BotProfile, Difficulty, LiveEvent, LiveSession, Scene, SessionStats,
} from "@/lib/types";

export const EMPTY_STATS: SessionStats = {
  danmakuCount: 0, questionCount: 0, questionAnswered: 0, giftCount: 0,
  followCount: 0, enterCount: 0, leaveCount: 0, hostCount: 0, silenceCount: 0,
};

// DB 行类型（snake_case）与领域类型的映射
type SessionRow = Record<string, unknown>;
type BotRow = Record<string, unknown>;
type EventRow = Record<string, unknown>;

function mapSession(r: SessionRow): LiveSession {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    topic: r.topic as string,
    scene: (r.scene as Scene) ?? "train",
    status: r.status as LiveSession["status"],
    difficulty: (r.difficulty as Difficulty) ?? { temper: "normal", silence: "medium", durationMin: 20 },
    heat: Number(r.heat ?? 10),
    heatLevel: Number(r.heat_level ?? 0),
    levelHoldSec: Number(r.level_hold_sec ?? 0),
    silenceSec: Number(r.silence_sec ?? 0),
    audienceExtra: Number(r.audience_extra ?? 0),
    peakOnline: Number(r.peak_online ?? 0),
    peakHeat: Number(r.peak_heat ?? 0),
    lastTickAt: (r.last_tick_at as string) ?? null,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? null,
    durationSec: (r.duration_sec as number) ?? null,
    stats: { ...EMPTY_STATS, ...((r.stats as SessionStats) ?? {}) },
    aiReport: (r.ai_report as AiReport) ?? null,
  };
}

function mapBot(r: BotRow): BotProfile {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    name: r.name as string,
    persona: r.persona as BotProfile["persona"],
    personaLabel: (r.persona_label as string) ?? "",
    gender: (r.gender as string) ?? "",
    ageRange: (r.age_range as string) ?? "",
    occupation: (r.occupation as string) ?? "",
    knowledgeLevel: (r.knowledge_level as string) ?? "",
    gradient: (r.gradient as string) ?? "g1",
    patience: Number(r.patience ?? 3),
    giftWillingness: Number(r.gift_willingness ?? 2),
    sampleLines: (r.sample_lines as string[]) ?? [],
    mood: Number(r.mood ?? 0),
    status: (r.status as "online" | "left") ?? "online",
    leftReason: (r.left_reason as string) ?? null,
  };
}

function mapEvent(r: EventRow): LiveEvent {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    botId: (r.bot_id as string) ?? null,
    type: r.type as LiveEvent["type"],
    content: r.content as string,
    meta: (r.meta as Record<string, unknown>) ?? {},
    offsetMs: Number(r.offset_ms ?? 0),
    createdAt: r.created_at as string,
  };
}

export async function createSessionWithBots(opts: {
  topic: string;
  scene: Scene;
  difficulty: Difficulty;
  botCount: number;
}): Promise<{ session: LiveSession; bots: BotProfile[] }> {
  const userId = await requireUserId();
  const db = getAdminClient();

  const { data: sRow, error: sErr } = await db
    .from("live_sessions")
    .insert({
      user_id: userId,
      topic: opts.topic,
      scene: opts.scene,
      difficulty: opts.difficulty,
      heat: 10,
      heat_level: 0,
      last_tick_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (sErr) throw new Error(`创建场次失败: ${sErr.message}`);

  // 生成 Bot 群（AI 失败/无 Key → 本地模板）
  const bots = await generateBots(userId, sRow.id as string, opts.topic, opts.scene, opts.botCount);
  return { session: mapSession(sRow), bots };
}

async function generateBots(
  userId: string,
  sessionId: string,
  topic: string,
  scene: Scene,
  count: number,
): Promise<BotProfile[]> {
  const db = getAdminClient();
  let profiles: Array<Record<string, unknown>> | null = null;
  let usage: { promptTokens: number; completionTokens: number } | null = null;
  let kind = "bots_gen";

  if (process.env.GLM_API_KEY) {
    try {
      const { buildBotGenPrompt } = await import("@/lib/engine/director");
      const { llmJson } = await import("@/lib/ai/glm");
      const res = await llmJson<{ bots: Array<Record<string, unknown>> }>(
        buildBotGenPrompt(topic, scene, count),
        { maxTokens: 4096, thinking: "low" },
      );
      profiles = res.data?.bots ?? null;
      usage = res.usage;
      if (profiles && !profiles.length) profiles = null;
    } catch {
      profiles = null; // 降级
    }
  }

  if (!profiles) {
    kind = "bots_gen_template";
    const { templateBots } = await import("@/lib/engine/templates");
    profiles = templateBots(count).map((b) => ({ ...b })) as Array<Record<string, unknown>>;
  }

  const { PERSONA_LABELS } = await import("@/lib/types");
  const rows = profiles.slice(0, count).map((b, i) => ({
    session_id: sessionId,
    name: String(b.name ?? `观众${i + 1}`),
    persona: String(b.persona ?? "passive"),
    persona_label: PERSONA_LABELS[b.persona as keyof typeof PERSONA_LABELS] ?? String(b.persona ?? ""),
    gender: String(b.gender ?? ""),
    age_range: String(b.ageRange ?? b.age_range ?? ""),
    occupation: String(b.occupation ?? ""),
    knowledge_level: String(b.knowledgeLevel ?? b.knowledge_level ?? ""),
    gradient: String(b.gradient ?? `g${(i % 6) + 1}`),
    patience: Math.max(1, Math.min(5, Number(b.patience ?? 3))),
    gift_willingness: Math.max(0, Math.min(5, Number(b.giftWillingness ?? b.gift_willingness ?? 2))),
    sample_lines: Array.isArray(b.sampleLines) ? b.sampleLines.slice(0, 3) : [],
    mood: 0,
    status: "online",
  }));

  const { data, error } = await db.from("bots").insert(rows).select();
  if (error) throw new Error(`Bot 生成失败: ${error.message}`);

  await db.from("ai_usage").insert({
    user_id: userId, session_id: sessionId, kind, model: process.env.GLM_MODEL ?? "glm-5.3-flash",
    prompt_tokens: usage?.promptTokens ?? 0, completion_tokens: usage?.completionTokens ?? 0,
  });

  const { data: sysEv } = await db
    .from("events")
    .insert({ session_id: sessionId, type: "system", content: "开播 · 观众正在进入直播间", offset_ms: 0 })
    .select()
    .single();

  void sysEv;
  return (data ?? []).map(mapBot);
}

/** 校验归属并加载场次 */
export async function loadSession(sessionId: string): Promise<LiveSession> {
  const userId = await requireUserId();
  const db = getAdminClient();
  const { data, error } = await db
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new AuthError("场次不存在或无权访问");
  return mapSession(data);
}

export async function loadBots(sessionId: string): Promise<BotProfile[]> {
  const db = getAdminClient();
  const { data } = await db.from("bots").select("*").eq("session_id", sessionId).order("joined_at");
  return (data ?? []).map(mapBot);
}

export async function loadEvents(sessionId: string, limit = 200, afterOffsetMs?: number): Promise<LiveEvent[]> {
  const db = getAdminClient();
  let q = db.from("events").select("*").eq("session_id", sessionId).order("offset_ms").limit(limit);
  if (afterOffsetMs !== undefined) q = q.gt("offset_ms", afterOffsetMs);
  const { data } = await q;
  return (data ?? []).map(mapEvent);
}

export async function appendEvents(
  sessionId: string,
  events: Array<{
    botId?: string | null;
    type: LiveEvent["type"];
    content: string;
    meta?: Record<string, unknown>;
    offsetMs: number;
  }>,
): Promise<LiveEvent[]> {
  if (!events.length) return [];
  const db = getAdminClient();
  const { data, error } = await db
    .from("events")
    .insert(
      events.map((e) => ({
        session_id: sessionId,
        bot_id: e.botId ?? null,
        type: e.type,
        content: e.content,
        meta: e.meta ?? {},
        offset_ms: Math.round(e.offsetMs),
      })),
    )
    .select();
  if (error) throw new Error(`事件写入失败: ${error.message}`);
  return (data ?? []).map(mapEvent);
}

/** 应用导演步进结果到场次状态 */
export async function applyEngineState(
  sessionId: string,
  patch: {
    heat: number;
    heatLevel: number;
    levelHoldSec: number;
    silenceSec: number;
    peakHeat: number;
  },
): Promise<void> {
  const db = getAdminClient();
  await db
    .from("live_sessions")
    .update({
      heat: patch.heat,
      heat_level: patch.heatLevel,
      level_hold_sec: patch.levelHoldSec,
      silence_sec: patch.silenceSec,
      peak_heat: patch.peakHeat,
      last_tick_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

export async function updateBot(sessionId: string, botId: string, patch: Partial<{ mood: number; status: string; leftReason: string }>): Promise<void> {
  const db = getAdminClient();
  const u: Record<string, unknown> = {};
  if (patch.mood !== undefined) u.mood = Math.max(-100, Math.min(100, patch.mood));
  if (patch.status) { u.status = patch.status; if (patch.status === "left") u.left_at = new Date().toISOString(); }
  if (patch.leftReason !== undefined) u.left_reason = patch.leftReason;
  if (Object.keys(u).length) {
    await db.from("bots").update(u).eq("id", botId).eq("session_id", sessionId);
  }
}

export async function bumpStats(sessionId: string, inc: Partial<Record<keyof SessionStats, number>>): Promise<SessionStats> {
  const db = getAdminClient();
  const { data } = await db.from("live_sessions").select("stats").eq("id", sessionId).single();
  const stats: SessionStats = { ...EMPTY_STATS, ...((data?.stats as object) ?? {}) };
  for (const [k, v] of Object.entries(inc)) {
    stats[k as keyof SessionStats] += v ?? 0;
  }
  await db.from("live_sessions").update({ stats }).eq("id", sessionId);
  return stats;
}

export async function updateOnlinePeak(sessionId: string, onlineCount: number): Promise<void> {
  const db = getAdminClient();
  await db.from("live_sessions").update({ peak_online: onlineCount }).eq("id", sessionId).lt("peak_online", onlineCount);
}

/** 结束场次：算时长、状态、返回 session */
export async function endSession(sessionId: string, interrupted = false): Promise<LiveSession> {
  const userId = await requireUserId();
  const db = getAdminClient();
  const session = await loadSession(sessionId);
  const endedAt = new Date().toISOString();
  const durationSec = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  const { data, error } = await db
    .from("live_sessions")
    .update({ status: interrupted ? "interrupted" : "ended", ended_at: endedAt, duration_sec: durationSec })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`结束场次失败: ${error.message}`);
  return mapSession(data);
}

export async function saveReport(sessionId: string, report: AiReport): Promise<void> {
  const db = getAdminClient();
  await db.from("live_sessions").update({ ai_report: report }).eq("id", sessionId);
}

export async function listSessions(userId: string): Promise<LiveSession[]> {
  const db = getAdminClient();
  const { data } = await db
    .from("live_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(mapSession);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const userId = await requireUserId();
  const db = getAdminClient();
  await db.from("live_sessions").delete().eq("id", sessionId).eq("user_id", userId);
}

export async function logUsage(
  userId: string,
  sessionId: string,
  kind: string,
  usage: { promptTokens: number; completionTokens: number } | null,
): Promise<void> {
  const db = getAdminClient();
  await db.from("ai_usage").insert({
    user_id: userId,
    session_id: sessionId,
    kind,
    model: process.env.GLM_MODEL ?? "glm-5.3-flash",
    prompt_tokens: usage?.promptTokens ?? 0,
    completion_tokens: usage?.completionTokens ?? 0,
  });
}
