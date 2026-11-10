/**
 * 直播引擎步进：tick 轮询与主播发言共用。
 * 流程：读状态 → 导演判定（热度/推流/退出）→ AI 批量生成事件 → 落库 → 返回增量。
 */
import { requireUserId, AuthError } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  loadSession, loadBots, loadEvents, appendEvents, applyEngineState,
  updateBot, bumpStats, updateOnlinePeak, logUsage,
} from "@/lib/engine/session-service";
import { stepDirector, MAX_ACTIVE_BOTS, buildTickPrompt } from "@/lib/engine/director";
import { templateTickEvents, templateBots } from "@/lib/engine/templates";
import { isAiEnabled, llmJson, TICK_MODEL } from "@/lib/ai/llm";
import type { LiveEvent, TickResponse, BotProfile, EventType, AiTrace } from "@/lib/types";

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

  // 主播刚发言检测（两段式：send 只落库，反应延迟到本 tick）。
  // 窗口 = 本 tick 时长 + 5s 容差，取最近一条 host 事件作为反应对象。
  const hostRecent = recentEvents
    .filter((e) => e.type === "host" && elapsedSec * 1000 - e.offsetMs <= (tickSec + 5) * 1000)
    .sort((a, b) => b.offsetMs - a.offsetMs)[0];
  // 稍早发言回退：超出反应窗口时，取最近一条 host 事件作为「稍早发言」传给 prompt，
  // 避免出现「主播暂时没说话」与消息列表中主播发言自相矛盾的指令。
  const hostEarlier = !hostContent && !hostRecent
    ? recentEvents.filter((e) => e.type === "host").sort((a, b) => b.offsetMs - a.offsetMs)[0]?.content
    : undefined;
  const hostJustSpoke = !!hostContent || !!hostRecent;
  const hostContentResolved = hostContent ?? hostRecent?.content;
  if (hostJustSpoke) session.silenceSec = 0; // 发言即打破冷场（供后续判定参照）

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
    hostJustSpoke,
    hostContent: hostContentResolved,
    difficulty: session.difficulty,
    tickSec,
  });

  const drafts: NewEventDraft[] = [];

  // 推流系统消息 + 新 Bot 涌入
  if (decision.pushInCount > 0) {
    for (const note of decision.systemNotes) {
      drafts.push({ type: "system", content: note, offsetMs: elapsedSec * 1000, meta: { level: decision.newLevel } });
    }
    const newcomers = templateBots(decision.pushInCount, bots.length, session.scene);
    const { PERSONA_LABELS } = await import("@/lib/types");
    const inserted = await query<Record<string, unknown>>(
      `insert into bots (session_id, name, persona, persona_label, gender, age_range, occupation,
       knowledge_level, gradient, patience, gift_willingness, sample_lines, mood, status)
       select $1::uuid, x.* from (values ${newcomers.map((_, i) =>
         `($${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}, $${i * 12 + 5}, $${i * 12 + 6}, $${i * 12 + 7}, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10}, $${i * 12 + 11}::int, $${i * 12 + 12}::int, $${i * 12 + 13}::jsonb, 0, 'online')`,
       ).join(", ")}) as x (name, persona, persona_label, gender, age_range, occupation,
       knowledge_level, gradient, patience, gift_willingness, sample_lines, mood, status)
       returning *`,
      [
        sessionId,
        ...newcomers.flatMap((b) => [
          b.name, b.persona, PERSONA_LABELS[b.persona], b.gender, b.ageRange, b.occupation,
          b.knowledgeLevel, b.gradient, b.patience, b.giftWillingness, JSON.stringify(b.sampleLines),
        ]),
      ],
    );
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
  const aiTrace = await generateTickEvents({
    sessionId,
    topic: session.topic,
    scene: session.scene,
    speakers,
    onlineBots,
    recentEvents,
    hostContent: hostContentResolved,
    hostEarlierContent: hostEarlier,
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
  if (decision.newSilenceSec === 0 && session.silenceSec > 0) statsInc.silenceCount = 1;
  // hostCount 由 /api/live/send 落库时统计，此处不再重复计数
  const stats = await bumpStats(sessionId, statsInc);

  const insertedEvents = await appendEvents(sessionId, drafts);

  const remainingOnline = onlineBots.filter((b) => !decision.exits.some((e) => e.botId === b.id));
  const onlineCount = remainingOnline.length + session.audienceExtra + decision.pushInCount;
  await updateOnlinePeak(sessionId, onlineCount);

  // 组装响应
  const newSession = await loadSession(sessionId);
  return {
    session: { ...newSession, stats },
    newEvents: insertedEvents,
    bots: remainingOnline.map((b) => ({ id: b.id, mood: b.mood, status: "online" })),
    onlineCount,
    aiTrace: aiTrace ?? undefined,
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
  hostEarlierContent?: string;
  unanswered?: string;
  heatLevel: number;
  pushedThisTick: boolean;
  elapsedSec: number;
  drafts: NewEventDraft[];
  speakerIds: string[];
}): Promise<AiTrace | null> {
  const aiOn = isAiEnabled() && ctx.speakers.length > 0;
  let produced = false;
  let trace: AiTrace | null = null;

  if (aiOn) {
    const t0 = Date.now();
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
        hostEarlierContent: ctx.hostEarlierContent,
        unansweredQuestion: ctx.unanswered,
        heatLevel: ctx.heatLevel,
        pushedThisTick: ctx.pushedThisTick,
      });
      const res = await llmJson<{
        events: { botId: string; type: string; content: string }[];
      }>(prompt, {
        // deepseek-flash 等思考型模型会先输出思考（reasoning_content），思考占用 token 预算；
        // maxTokens 太小会导致 JSON 截断 → 解析失败 → 静默降级模板（表现为弹幕不贴题），预算给足
        maxTokens: 3000,
        model: TICK_MODEL,
        timeoutMs: 20_000,
      });
      const promptText = prompt.map((m) => `【${m.role === "system" ? "系统" : "请求"}】${m.content}`).join("\n\n");
      const validTypes: EventType[] = ["chat", "question", "gift", "mood_change", "follow"];
      let count = 0;
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
        count++;
        // 情绪联动：mood_change 应用到 Bot
        if (ev.type === "mood_change") {
          await updateBot(ctx.sessionId, bot.id, { mood: bot.mood + 15 });
        }
      }
      produced = count > 0;
      trace = {
        kind: "tick",
        model: res.model,
        durationMs: Date.now() - t0,
        prompt: promptText,
        thinking: res.reasoning ?? "",
        output: res.raw,
        eventCount: count,
        fallback: !produced,
        error: produced ? undefined : "模型未产出有效事件",
        ts: new Date().toISOString(),
      };
      const { requireUserId } = await import("@/lib/auth");
      const userId = await requireUserId();
      await logUsage(userId, ctx.sessionId, "tick", res.usage);
    } catch (e) {
      console.error("[tick:ai]", e);
      produced = false;
      trace = {
        kind: "tick",
        model: TICK_MODEL,
        durationMs: Date.now() - t0,
        prompt: "",
        thinking: "",
        output: "",
        eventCount: 0,
        fallback: true,
        error: e instanceof Error ? e.message.slice(0, 200) : "AI 调用失败",
        ts: new Date().toISOString(),
      };
    }
  }

  if (!produced) {
    // 模板降级
    const templates = templateTickEvents(
      ctx.speakerIds.length ? ctx.speakerIds : ctx.speakers.map((s) => s.id),
      ctx.hostContent ?? ctx.hostEarlierContent,
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
    if (!trace) {
      trace = {
        kind: "tick",
        model: "local-template",
        durationMs: 0,
        prompt: "",
        thinking: "",
        output: templates.map((t) => t.content).join("\n"),
        eventCount: templates.length,
        fallback: true,
        error: aiOn ? undefined : "未配置 LLM_API_KEY，走本地模板",
        ts: new Date().toISOString(),
      };
    } else {
      trace.fallback = true;
    }
  }
  return trace;
}
