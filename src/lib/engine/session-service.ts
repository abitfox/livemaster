/**
 * 场次服务层：Route Handler 共用的 DB 读写逻辑（Neon Postgres，显式 user_id 校验）。
 */
import { requireUserId, AuthError } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { FAST_MODEL } from "@/lib/ai/glm";
import type {
  AiReport, BotProfile, Difficulty, LiveEvent, LiveSession, Scene, SessionStats,
} from "@/lib/types";

export const EMPTY_STATS: SessionStats = {
  danmakuCount: 0, questionCount: 0, questionAnswered: 0, giftCount: 0,
  followCount: 0, enterCount: 0, leaveCount: 0, hostCount: 0, silenceCount: 0,
};

type Row = Record<string, unknown>;

function mapSession(r: Row): LiveSession {
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
    startedAt: (r.started_at as Date).toISOString(),
    endedAt: r.ended_at ? (r.ended_at as Date).toISOString() : null,
    durationSec: (r.duration_sec as number) ?? null,
    stats: { ...EMPTY_STATS, ...((r.stats as SessionStats) ?? {}) },
    aiReport: (r.ai_report as AiReport) ?? null,
  };
}

function mapBot(r: Row): BotProfile {
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

function mapEvent(r: Row): LiveEvent {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    botId: (r.bot_id as string) ?? null,
    type: r.type as LiveEvent["type"],
    content: r.content as string,
    meta: (r.meta as Record<string, unknown>) ?? {},
    offsetMs: Number(r.offset_ms ?? 0),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function createSessionWithBots(opts: {
  topic: string;
  scene: Scene;
  difficulty: Difficulty;
  botCount: number;
}): Promise<{ session: LiveSession; bots: BotProfile[] }> {
  const userId = await requireUserId();

  const sRow = await queryOne<Row>(
    `insert into live_sessions (user_id, topic, scene, difficulty, heat, heat_level, last_tick_at)
     values ($1, $2, $3, $4, 10, 0, now()) returning *`,
    [userId, opts.topic, opts.scene, JSON.stringify(opts.difficulty)],
  );
  if (!sRow) throw new Error("创建场次失败");

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
  let profiles: Array<Record<string, unknown>> | null = null;
  let usage: { promptTokens: number; completionTokens: number } | null = null;
  let kind = "bots_gen";

  if (process.env.GLM_API_KEY) {
    try {
      const { buildBotGenPrompt } = await import("@/lib/engine/director");
      const { llmJson } = await import("@/lib/ai/glm");
      const res = await llmJson<{ bots: Array<Record<string, unknown>> }>(
        buildBotGenPrompt(topic, scene, count),
        // glm-5.3-flash 强制思考太慢（实测 25~90s），观众群用轻量模型 + 45s 超时降级
        { maxTokens: 2048, model: FAST_MODEL, timeoutMs: 45_000 },
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
  const rows: Array<Record<string, unknown>> = profiles.slice(0, count).map((b, i) => ({
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
    sample_lines: JSON.stringify(Array.isArray(b.sampleLines) ? b.sampleLines.slice(0, 3) : []),
  }));

  // 多行 INSERT ... RETURNING
  // VALUES 别名列不携带类型，int/jsonb 列需显式 cast
  const CASTS: Record<string, string> = { patience: "::int", gift_willingness: "::int", sample_lines: "::jsonb" };
  const cols = Object.keys(rows[0]);
  const values: unknown[] = [];
  const tuples = rows.map((r, ri) => {
    cols.forEach((c, ci) => values.push(r[c]));
    const base = ri * cols.length;
    return `(${cols.map((c, ci) => `$${base + ci + 1}${CASTS[c] ?? ""}`).join(", ")})`;
  });
  const inserted = await query<Row>(
    // uuid 参数放在所有 tuple 参数之后，避免编号碰撞
    `insert into bots (session_id, ${cols.join(", ")}) select $${values.length + 1}::uuid, x.* from (values ${tuples.join(", ")}) as x (${cols.join(", ")}) returning *`,
    [...values, sessionId],
  );

  await query(
    "insert into ai_usage (user_id, session_id, kind, model, prompt_tokens, completion_tokens) values ($1, $2, $3, $4, $5, $6)",
    [userId, sessionId, kind, process.env.GLM_MODEL ?? "glm-5.3-flash", usage?.promptTokens ?? 0, usage?.completionTokens ?? 0],
  );
  await query(
    "insert into events (session_id, type, content, meta, offset_ms) values ($1, 'system', $2, '{}', 0)",
    [sessionId, "开播 · 观众正在进入直播间"],
  );
  return inserted.map(mapBot);
}

/** 校验归属并加载场次 */
export async function loadSession(sessionId: string): Promise<LiveSession> {
  const userId = await requireUserId();
  const row = await queryOne<Row>(
    "select * from live_sessions where id = $1 and user_id = $2",
    [sessionId, userId],
  );
  if (!row) throw new AuthError("场次不存在或无权访问");
  return mapSession(row);
}

export async function loadBots(sessionId: string): Promise<BotProfile[]> {
  const rows = await query<Row>("select * from bots where session_id = $1 order by joined_at", [sessionId]);
  return rows.map(mapBot);
}

export async function loadEvents(sessionId: string, limit = 200, afterOffsetMs?: number): Promise<LiveEvent[]> {
  if (afterOffsetMs !== undefined) {
    const rows = await query<Row>(
      "select * from events where session_id = $1 and offset_ms > $2 order by offset_ms limit $3",
      [sessionId, Math.round(afterOffsetMs), limit],
    );
    return rows.map(mapEvent);
  }
  const rows = await query<Row>(
    "select * from events where session_id = $1 order by offset_ms limit $2",
    [sessionId, limit],
  );
  return rows.map(mapEvent);
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
  // 逐条插入（单用户场景量小；保留 RETURNING 语义）
  const out: LiveEvent[] = [];
  for (const e of events) {
    const row = await queryOne<Row>(
      "insert into events (session_id, bot_id, type, content, meta, offset_ms) values ($1, $2, $3, $4, $5, $6) returning *",
      [sessionId, e.botId ?? null, e.type, e.content, JSON.stringify(e.meta ?? {}), Math.round(e.offsetMs)],
    );
    if (row) out.push(mapEvent(row));
  }
  return out;
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
  await query(
    `update live_sessions set heat = $1, heat_level = $2, level_hold_sec = $3, silence_sec = $4,
     peak_heat = greatest(peak_heat, $5), last_tick_at = now() where id = $6`,
    [patch.heat, patch.heatLevel, patch.levelHoldSec, patch.silenceSec, patch.peakHeat, sessionId],
  );
}

export async function updateBot(sessionId: string, botId: string, patch: Partial<{ mood: number; status: string; leftReason: string }>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.mood !== undefined) { sets.push(`mood = $${vals.length + 1}`); vals.push(Math.max(-100, Math.min(100, patch.mood))); }
  if (patch.status) { sets.push(`status = $${vals.length + 1}`); vals.push(patch.status); }
  if (patch.status === "left") { sets.push(`left_at = now()`); }
  if (patch.leftReason !== undefined) { sets.push(`left_reason = $${vals.length + 1}`); vals.push(patch.leftReason); }
  if (!sets.length) return;
  vals.push(sessionId, botId);
  await query(`update bots set ${sets.join(", ")} where session_id = $${vals.length - 1} and id = $${vals.length}`, vals);
}

export async function bumpStats(sessionId: string, inc: Partial<Record<keyof SessionStats, number>>): Promise<SessionStats> {
  const row = await queryOne<{ stats: SessionStats }>("select stats from live_sessions where id = $1", [sessionId]);
  const stats: SessionStats = { ...EMPTY_STATS, ...(row?.stats ?? {}) };
  for (const [k, v] of Object.entries(inc)) {
    stats[k as keyof SessionStats] += v ?? 0;
  }
  await query("update live_sessions set stats = $1 where id = $2", [JSON.stringify(stats), sessionId]);
  return stats;
}

export async function updateOnlinePeak(sessionId: string, onlineCount: number): Promise<void> {
  await query("update live_sessions set peak_online = $1 where id = $2 and peak_online < $1", [onlineCount, sessionId]);
}

/** 结束场次：算时长、状态、返回 session */
export async function endSession(sessionId: string, interrupted = false): Promise<LiveSession> {
  const userId = await requireUserId();
  await loadSession(sessionId); // 归属校验
  const row = await queryOne<Row>(
    `update live_sessions set status = $1, ended_at = now(),
     duration_sec = greatest(0, (extract(epoch from (now() - started_at))::int))
     where id = $2 and user_id = $3 returning *`,
    [interrupted ? "interrupted" : "ended", sessionId, userId],
  );
  if (!row) throw new Error("结束场次失败");
  return mapSession(row);
}

export async function saveReport(sessionId: string, report: AiReport): Promise<void> {
  await query("update live_sessions set ai_report = $1 where id = $2", [JSON.stringify(report), sessionId]);
}

export async function listSessions(userId: string): Promise<LiveSession[]> {
  const rows = await query<Row>(
    "select * from live_sessions where user_id = $1 order by started_at desc limit 100",
    [userId],
  );
  return rows.map(mapSession);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const userId = await requireUserId();
  await query("delete from live_sessions where id = $1 and user_id = $2", [sessionId, userId]);
}

export async function logUsage(
  userId: string,
  sessionId: string,
  kind: string,
  usage: { promptTokens: number; completionTokens: number } | null,
): Promise<void> {
  await query(
    "insert into ai_usage (user_id, session_id, kind, model, prompt_tokens, completion_tokens) values ($1, $2, $3, $4, $5, $6)",
    [userId, sessionId, kind, process.env.GLM_MODEL ?? "glm-5.3-flash", usage?.promptTokens ?? 0, usage?.completionTokens ?? 0],
  );
}
