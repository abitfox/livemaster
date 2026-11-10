/**
 * 直播引擎步进：tick 轮询与主播发言共用。
 * 流程：读状态 → 导演判定（热度/推流/退出）→ AI 批量生成事件 → 落库 → 返回增量。
 */
import { requireUserId, AuthError } from "@/lib/supabase/admin";
import {
  loadSession, loadBots, loadEvents, appendEvents, applyEngineState,
  updateBot, bumpStats, updateOnlinePeak, logUsage,
} from "@/lib/engine/session-service";
import { stepDirector, MAX_ACTIVE_BOTS, buildTickPrompt } from "@/lib/engine/director";
import { templateTickEvents, templateBots } from "@/lib/engine/templates";
import { isAiEnabled, llmJson } from "@/lib/ai/glm";
import type { LiveEvent, TickResponse, BotProfile, EventType } from "@/lib/types";

interface NewEventDraft {
  botId?: string | null;
  type: EventType;
  content: string;
  meta?: Record<string, unknown>;
  offsetMs: number;
}

export async function runEngineTick(sessionId: string, hostContent?: string): Promise<TickResponse> {
  await requireUserId(); // 归属校验
  const session = await loadSession(sessionId);
  if (session.status !== "live") throw new AuthError("场次不在直播中");

  const now = Date.now();
  const elapsedSec = Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 1000));
  const lastTickAt = session.lastTickAt ?? session.startedAt;
  const tickSec = Math.max(5, Math.min(60, Math.round((now - new Date(lastTickAt).getTime()) / 1000)));

  const bots = await loadBots(sessionId);
  const onlineBots = bots.filter((b) => b.status === "online").slice(0, MAX_ACTIVE_BOTS);
  const recentEvents = await loadEvents(sessionId, 40);
  const questions = recentEvents.filter((e) => e.type === "question");
  const answeredIds = new Set(
    recentEvents.filter((e) => e.type === "question" && e.meta?.answered).map((e) => e.botId),
  );
  const unanswered = questions.filter((q) => q.botId && !answeredIds.has(q.botId));

  // ---- 导演判定（纯代码） ----
  const decision = stepDirector({
    heat: session.heat,
    heatLevel: session.heatLevel,
    levelHoldSec: session.levelHoldSec,
    silenceSec: session.silenceSec,
    elapsedSec,
    onlineBots,
    recentEvents: recentEvents.map((e) => ({
      type: e.type, botId: e.botId, content: e.content, offsetMs: e.offsetMs,
    })),
    unansweredQuestions: unanswered.map((q) => ({ id: q.id, botId: q.botId, content: q.content })),
    hostJustSpoke: !!hostContent,
    hostContent,
    difficulty: session.difficulty,
    tickSec,
  });

  const drafts: NewEventDraft[] = [];

  // 推流系统消息 + 新 Bot 涌入
  if (decision.pushInCount > 0) {
    for (const note of decision.systemNotes) {
      drafts.push({ type: "system", content: note, offsetMs: elapsedSec * 1000, meta: { level: decision.newLevel } });
    }
    const newcomers = templateBots(decision.pushInCount, bots.length);
    const db = (await import("@/lib/supabase/admin")).getAdminClient();
    const { PERSONA_LABELS } = await import("@/lib/types");
    const { data: inserted } = await db
      .from("bots")
      .insert(
        newcomers.map((b) => ({
          session_id: sessionId,
          name: b.name,
          persona: b.persona,
          persona_label: PERSONA_LABELS[b.persona],
          gender: b.gender, age_range: b.ageRange, occupation: b.occupation,
          knowledge_level: b.knowledgeLevel, gradient: b.gradient,
          patience: b.patience, gift_willingness: b.giftWillingness,
          sample_lines: b.sampleLines, mood: b.mood, status: "online",
        })),
      )
      .select();
    for (const bot of (inserted ?? []) as Record<string, unknown>[]) {
      drafts.push({
        botId: bot.id as string,
        type: "enter",
        content: `${bot.name} 进入了直播间`,
        offsetMs: elapsedSec * 1000,
        meta: { gradient: bot.gradient, persona: bot.persona_label },
      });
    }
    onlineBots.push(
      ...(inserted ?? []).map((r) => mapBotRow(r)),
    );
  }

  // 观众退出
  for (const exit of decision.exits) {
    const bot = bots.find((b) => b.id === exit.botId);
    await updateBot(sessionId, exit.botId, { status: "left", leftReason: exit.reason });
    drafts.push({
      botId: exit.botId,
      type: "leave",
      content: `${bot?.name ?? "有观众"} 退出了直播间（${exit.reason}）`,
      offsetMs: elapsedSec * 1000,
    });
  }

  // ---- AI 批量生成（失败→模板降级） ----
  const speakerIds = decision.speakerIds.filter(
    (id) => !decision.exits.some((e) => e.botId === id),
  );
  const speakers = onlineBots.filter((b) => speakerIds.includes(b.id));
  const eventsGenerated = await generateTickEvents({
    sessionId,
    topic: session.topic,
    scene: session.scene,
    speakers,
    onlineBots,
    recentEvents,
    hostContent,
    unanswered: unanswered[0]?.content,
    heatLevel: decision.newLevel,
    pushedThisTick: decision.pushInCount > 0,
    elapsedSec,
    drafts,
    speakerIds,
  });

  // 应用引擎状态
  await applyEngineState(sessionId, {
    heat: decision.newHeat,
    heatLevel: decision.newLevel,
    levelHoldSec: decision.newLevelHoldSec,
    silenceSec: decision.newSilenceSec,
    peakHeat: Math.max(session.peakHeat, decision.newHeat),
  });

  // ---- 统计 ----
  const statsInc: Partial<Record<keyof import("@/lib/types").SessionStats, number>> = {};
  for (const d of drafts) {
    if (d.type === "chat") statsInc.danmakuCount = (statsInc.danmakuCount ?? 0) + 1;
    if (d.type === "question") statsInc.questionCount = (statsInc.questionCount ?? 0) + 1;
    if (d.type === "gift") statsInc.giftCount = (statsInc.giftCount ?? 0) + 1;
    if (d.type === "follow") statsInc.followCount = (statsInc.followCount ?? 0) + 1;
    if (d.type === "enter") statsInc.enterCount = (statsInc.enterCount ?? 0) + 1;
    if (d.type === "leave") statsInc.leaveCount = (statsInc.leaveCount ?? 0) + 1;
  }
  if (hostContent) statsInc.hostCount = 1;
  if (decision.newSilenceSec === 0 && session.silenceSec > 0) statsInc.silenceCount = 1;
  const stats = await bumpStats(sessionId, statsInc);

  const insertedEvents = await appendEvents(sessionId, drafts);

  const remainingOnline = onlineBots.filter((b) => !decision.exits.some((e) => e.botId === b.id));
  const onlineCount = remainingOnline.length + session.audienceExtra + decision.pushInCount;
  await updateOnlinePeak(sessionId, onlineCount);

  // 组装响应
  const newSession = await loadSession(sessionId);
  void eventsGenerated;
  return {
    session: { ...newSession, stats },
    newEvents: insertedEvents,
    bots: remainingOnline.map((b) => ({ id: b.id, mood: b.mood, status: "online" })),
    onlineCount,
  };
}

function mapBotRow(r: Record<string, unknown>): BotProfile {
  return {
    id: r.id as string, sessionId: r.session_id as string, name: r.name as string,
    persona: r.persona as BotProfile["persona"], personaLabel: (r.persona_label as string) ?? "",
    gender: (r.gender as string) ?? "", ageRange: (r.age_range as string) ?? "",
    occupation: (r.occupation as string) ?? "", knowledgeLevel: (r.knowledge_level as string) ?? "",
    gradient: (r.gradient as string) ?? "g1", patience: Number(r.patience ?? 3),
    giftWillingness: Number(r.gift_willingness ?? 2), sampleLines: (r.sample_lines as string[]) ?? [],
    mood: Number(r.mood ?? 0), status: "online", leftReason: null,
  };
}

async function generateTickEvents(ctx: {
  sessionId: string;
  topic: string;
  scene: string;
  speakers: BotProfile[];
  onlineBots: BotProfile[];
  recentEvents: LiveEvent[];
  hostContent?: string;
  unanswered?: string;
  heatLevel: number;
  pushedThisTick: boolean;
  elapsedSec: number;
  drafts: NewEventDraft[];
  speakerIds: string[];
}): Promise<void> {
  const aiOn = isAiEnabled() && ctx.speakers.length > 0;
  let produced = false;

  if (aiOn) {
    try {
      const prompt = buildTickPrompt({
        topic: ctx.topic,
        scene: ctx.scene,
        speakers: ctx.speakers,
        onlineBots: ctx.onlineBots,
        recentWindow: ctx.recentEvents.map((e) => {
          const who = e.type === "host" ? "主播" : e.botId
            ? ctx.onlineBots.find((b) => b.id === e.botId)?.name ?? "观众"
            : "系统";
          return `${who}: ${e.content}`;
        }),
        hostContent: ctx.hostContent,
        unansweredQuestion: ctx.unanswered,
        heatLevel: ctx.heatLevel,
        pushedThisTick: ctx.pushedThisTick,
      });
      const res = await llmJson<{
        events: { botId: string; type: string; content: string }[];
      }>(prompt, { maxTokens: 1500, thinking: "low" });
      const validTypes: EventType[] = ["chat", "question", "gift", "mood_change", "follow"];
      for (const ev of res.data?.events ?? []) {
        if (!validTypes.includes(ev.type as EventType)) continue;
        const bot = ctx.speakers.find((b) => b.id === ev.botId)
          ?? ctx.onlineBots.find((b) => b.id === ev.botId);
        if (!bot) continue;
        ctx.drafts.push({
          botId: bot.id,
          type: ev.type as EventType,
          content: String(ev.content ?? "").slice(0, 120),
          offsetMs: ctx.elapsedSec * 1000,
          meta: { name: bot.name, gradient: bot.gradient },
        });
        // 情绪联动：mood_change 应用到 Bot
        if (ev.type === "mood_change") {
          await updateBot(ctx.sessionId, bot.id, { mood: bot.mood + 15 });
        }
      }
      produced = true;
      const { requireUserId } = await import("@/lib/supabase/admin");
      const userId = await requireUserId();
      await logUsage(userId, ctx.sessionId, "tick", res.usage);
    } catch (e) {
      console.error("[tick:ai]", e);
      produced = false;
    }
  }

  if (!produced) {
    // 模板降级
    const templates = templateTickEvents(
      ctx.speakerIds.length ? ctx.speakerIds : ctx.speakers.map((s) => s.id),
      ctx.hostContent,
    );
    for (const ev of templates) {
      const bot = ctx.speakers.find((b) => b.id === ev.botId);
      if (!bot) continue;
      ctx.drafts.push({
        botId: bot.id,
        type: ev.type,
        content: ev.content,
        offsetMs: ctx.elapsedSec * 1000,
        meta: { name: bot.name, gradient: bot.gradient, template: true },
      });
    }
  }
}
