/**
 * 导演引擎：确定性逻辑（热度/流量池/退出判定）+ AI 批量内容生成。
 * 原则：可复现可复盘的部分用代码，创造性内容用 AI，AI 不可用时降级为本地模板。
 */
import type { BotProfile, Difficulty, LiveEvent, Persona } from "@/lib/types";

// ------------------------------------------------------------
// 热度引擎参数（策划案 4.3③，可调参）
// ------------------------------------------------------------
export const HEAT_LEVELS = [
  { level: 0, name: "冷启动", min: 0, holdSec: 0, onlineMin: 5, onlineMax: 15 },
  { level: 1, name: "起量", min: 55, holdSec: 120, onlineMin: 15, onlineMax: 60 },
  { level: 2, name: "加热", min: 70, holdSec: 180, onlineMin: 60, onlineMax: 250 },
  { level: 3, name: "高热", min: 85, holdSec: 300, onlineMin: 250, onlineMax: 1000 },
] as const;

/** 在线 AI 互动 Bot 上限（用户决策：30~50，超出只计人数） */
export const MAX_ACTIVE_BOTS = 30;

const SILENCE_LIMIT_BY_SENSITIVITY: Record<Difficulty["silence"], number> = {
  lenient: 90,
  medium: 60,
  strict: 40,
};

const EXIT_SPEED_BY_TEMPER: Record<Difficulty["temper"], number> = {
  gentle: 0.5,
  normal: 1,
  harsh: 1.6,
};

export interface EngineStateInput {
  heat: number;
  heatLevel: number;
  levelHoldSec: number;
  silenceSec: number;
  elapsedSec: number;
  onlineBots: BotProfile[];
  recentEvents: { type: string; botId: string | null; content: string; offsetMs: number }[];
  unansweredQuestions: { id: string; botId: string | null; content: string }[];
  hostJustSpoke: boolean;
  hostContent?: string;
  difficulty: Difficulty;
  tickSec: number;
}

export interface DirectorDecision {
  newHeat: number;
  newLevel: number;
  newLevelHoldSec: number;
  newSilenceSec: number;
  /** 流量池升级 → 新 Bot 涌入数量 */
  pushInCount: number;
  /** 本 tick 退出名单（botId + 原因） */
  exits: { botId: string; reason: string }[];
  /** 需要安静一阵的潜水 Bot（不给 AI 发言） */
  speakerIds: string[];
  systemNotes: string[];
}

/** 热度增量计算（纯代码） */
function computeHeatDelta(input: EngineStateInput): number {
  const recent = input.recentEvents;
  const windowMs = input.tickSec * 1000;
  const nowOffset = input.elapsedSec * 1000;
  const recentInTick = recent.filter((e) => nowOffset - e.offsetMs <= windowMs * 2);

  let delta = 0;
  // 弹幕速率贡献
  const chatCount = recentInTick.filter((e) => e.type === "chat").length;
  delta += Math.min(chatCount * 0.8, 6);
  // 礼物强贡献
  const giftCount = recentInTick.filter((e) => e.type === "gift").length;
  delta += giftCount * 4;
  // 主播刚发言：正向但弱于互动
  if (input.hostJustSpoke) delta += 2;
  // 未回应提问是负贡献
  delta -= input.unansweredQuestions.length * 1.5;

  // 冷场衰减：无任何互动时按敏感度加速扣
  if (recentInTick.length === 0 && !input.hostJustSpoke) {
    delta -= 3 + input.silenceSec / 30;
  }
  // 自然衰减：热度向 30 回归的微弱拉力
  if (input.heat > 30) delta -= 0.5;
  return delta;
}

/** 主导演步进：热度 → 等级 → 推流 → 退出 → 发言人选择 */
export function stepDirector(input: EngineStateInput): DirectorDecision {
  const d: DirectorDecision = {
    newHeat: 0,
    newLevel: input.heatLevel,
    newLevelHoldSec: input.levelHoldSec,
    newSilenceSec: input.silenceSec,
    pushInCount: 0,
    exits: [],
    speakerIds: [],
    systemNotes: [],
  };

  // 1. 热度
  let heat = Math.max(0, Math.min(100, input.heat + computeHeatDelta(input)));
  d.newHeat = Math.round(heat * 10) / 10;

  // 2. 冷场计时
  const recentActive = input.recentEvents.some(
    (e) => input.elapsedSec * 1000 - e.offsetMs <= input.tickSec * 1000 * 2,
  );
  if (recentActive || input.hostJustSpoke) {
    d.newSilenceSec = 0;
  } else {
    d.newSilenceSec = input.silenceSec + input.tickSec;
  }

  // 3. 等级判定（含持续时长条件）
  const cur = HEAT_LEVELS[input.heatLevel];
  const next = HEAT_LEVELS[Math.min(input.heatLevel + 1, 3)];
  if (heat >= next.min) {
    const held = input.levelHoldSec + input.tickSec;
    if (held >= next.holdSec) {
      d.newLevel = next.level;
      d.newLevelHoldSec = 0;
      // 推流：新 Bot 涌入（受上限约束）
      const onlineCount = input.onlineBots.length;
      const room = MAX_ACTIVE_BOTS - onlineCount;
      d.pushInCount = Math.min(3 + next.level * 2, Math.max(room, 0));
      d.systemNotes.push(`流量推送：进入 L${next.level} ${next.name}`);
    } else {
      d.newLevelHoldSec = held;
    }
  } else if (heat < cur.min && input.heatLevel > 0) {
    // 掉级（掉回上一档）
    const prev = HEAT_LEVELS[input.heatLevel - 1];
    d.newLevel = prev.level;
    d.newLevelHoldSec = 0;
  } else {
    d.newLevelHoldSec = input.levelHoldSec;
  }

  // 4. 退出判定：冷场超限 → 低耐心 Bot 走人
  const silenceLimit = SILENCE_LIMIT_BY_SENSITIVITY[input.difficulty.silence];
  const temperSpeed = EXIT_SPEED_BY_TEMPER[input.difficulty.temper];
  if (d.newSilenceSec >= silenceLimit && input.onlineBots.length > 3) {
    // 有效耐心 = 基础耐心 / 脾气速度；冷场越久越多 Bot 达到阈值
    const overSec = d.newSilenceSec - silenceLimit;
    for (const bot of input.onlineBots) {
      const effectivePatience = (bot.patience / temperSpeed) * 12; // 秒化
      if (overSec > effectivePatience && d.exits.length < Math.ceil(input.onlineBots.length / 3)) {
        const reasons =
          bot.persona === "grump" ? "冷场太久了，没意思"
          : bot.persona === "passive" ? "悄悄退出了"
          : bot.persona === "curious" ? "问题没人理，先走了"
          : "安静得有点尴尬";
        d.exits.push({ botId: bot.id, reason: reasons });
      }
    }
  }

  // 5. 发言人选择：优先活跃人格 + mood 高的；潜水党低概率
  const candidates = input.onlineBots.filter(
    (b) => !d.exits.some((e) => e.botId === b.id),
  );
  const weights: Record<Persona, number> = {
    supporter: 5, curious: 4, heckler: 4, scholar: 3, whale: 2, grump: 3, passive: 0.6,
  };
  const scored = candidates
    .map((b) => ({ b, w: weights[b.persona] * (0.6 + Math.random() * 0.8) }))
    .sort((x, y) => y.w - x.w);
  const speakerCount = Math.min(scored.length, 2 + Math.floor(Math.random() * 4));
  d.speakerIds = scored.slice(0, speakerCount).map((s) => s.b.id);

  return d;
}

// ------------------------------------------------------------
// AI Prompt 构造
// ------------------------------------------------------------

/** 开播前 Bot 群生成 prompt（策划案 4.3①：9 维画像） */
export function buildBotGenPrompt(topic: string, scene: string, count: number): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content:
        "你是模拟直播训练工具的「观众群生成引擎」。根据直播主题与场景生成一批虚拟观众档案，只输出 JSON，不要任何其他文字。\n" +
        `输出格式：{"bots":[{"name":"昵称","persona":"supporter|curious|heckler|passive|scholar|whale|grump","gender":"男|女","ageRange":"18-25|26-35|36-45","occupation":"职业身份","knowledgeLevel":"novice|beginner|enthusiast|expert","gradient":"g1~g6 之间选，尽量分散","patience":1到5,"giftWillingness":0到5,"sampleLines":["2~3句口头禅或语气例句"]}]}\n` +
        "要求：\n" +
        "- 昵称必须像真实中文直播间昵称（如「阿柴不吃香菜」「老K聊币圈」「摸鱼的阿强」），禁止「用户123」式命名\n" +
        "- persona 分布严格按用户消息中的场景要求执行\n" +
        "- sampleLines 要有强烈个人语气特征，是后续弹幕模仿的基调，禁止通用客套话",
    },
    {
      role: "user",
      content:
        scene === "feynman"
          ? `直播主题：「${topic}」。场景：费曼学习——主播是讲解者，观众全部是来学这个主题的「学生」，与主播是师生交流关系。生成 ${count} 个学生观众。要求：\n` +
            "- persona 只能选 curious（好奇提问型）或 scholar（学霸较真型）或 passive（安静旁听型）：curious 约 6~7 成、scholar 约 2 成、passive 其余；禁止 supporter/heckler/whale/grump\n" +
            "- knowledgeLevel 由浅入深分布：novice 与 beginner 占多数、enthusiast 次之、expert 最多 1 人（班里学得好的同学），保证能形成「基础概念→原理→应用」的追问链\n" +
            "- occupation 是正在学这个主题的人（备考学生、转行学习者、刚入门的从业者、在职进修者等），要贴合主题\n" +
            "- sampleLines 是学生听课与课堂提问语气（如「老师这里能再讲细一点吗」「我没跟上，能换个说法吗」「所以结论是XX对吗」「这个和XX是什么关系」），禁止娱乐直播弹幕风\n" +
            "- giftWillingness 大多为 0~1（学生场景礼物极少）"
          : `直播主题：「${topic}」。场景：主播排练（按该主题的真实目标观众画像生成）。生成 ${count} 个观众。要求：\n` +
            "- persona 分布写实：捧场 supporter 和好奇 curious 占多数，杠精 heckler 与易怒 grump 少量但必须存在，潜水党 passive 若干，土豪 whale 至多 1 人\n" +
            "- knowledgeLevel 专家到小白都要有",
    },
  ];
}

/** tick 批量事件生成 prompt（策划案 4.4 方案 B） */
export function buildTickPrompt(opts: {
  topic: string;
  scene: string;
  speakers: BotProfile[];
  onlineBots: BotProfile[];
  recentWindow: string[];
  hostContent?: string;
  /** 稍早的主播发言（超出本 tick 反应窗口但仍在消息列表中，避免指令与列表自相矛盾） */
  hostEarlierContent?: string;
  unansweredQuestion?: string;
  heatLevel: number;
  pushedThisTick: boolean;
}): { role: string; content: string }[] {
  const speakerDesc = opts.speakers
    .map(
      (b) =>
        `- id=${b.id} 昵称「${b.name}」人格=${b.personaLabel} 身份=${b.occupation || "未知"} 知识水平=${b.knowledgeLevel} 当前情绪=${b.mood} 语气样例=${JSON.stringify(b.sampleLines)}`,
    )
    .join("\n");

  const feynmanRules =
    opts.scene === "feynman"
      ? "\n- 费曼场景：你是正在听课的「学生」，与主播是师生交流，不是娱乐直播间\n" +
        "- 弹幕与提问必须紧扣主播刚讲的内容，像课堂一样由浅入深：没听懂的概念→请主播解释或打比方→追问背后的原理→问应用场景与边界情况\n" +
        "- 提问要基于该 Bot 的知识水平逐步深入，可以引用主播前面的原话来追问（如「你刚才说XX，那YY是怎么回事」）\n" +
        "- 若主播已回应过某个提问，追问要在回应基础上深化（举一反三/特殊情况/与已学知识的联系），不要重复原问题\n" +
        "- 禁止与主题无关的闲聊；禁止「扣1」「前排围观」式娱乐弹幕；gift 和 mood_change 尽量不用\n"
      : "";

  return [
    {
      role: "system",
      content:
        "你是模拟直播的「观众行为引擎」，扮演直播间里的虚拟观众生成实时互动。只输出 JSON，禁止输出其他任何文字。\n" +
        '输出格式：{"events":[{"botId":"填给定的id","type":"chat|question|gift|mood_change|follow","content":"内容"}]}\n' +
        "规则：\n" +
        "- 只让给定的发言 Bot 说话；弹幕必须贴合每个 Bot 的语气样例与人格（杠精会抬杠但不辱骂；学霸较真；捧场爱夸）\n" +
        "- chat 为普通弹幕（8~40 字）；question 为向主播的提问（要用该 Bot 的知识水平：小白问基础概念、专家问深度细节），question 一次最多 1 条\n" +
        "- mood_change 表示情绪明显变化，content 用第三人称短句（如「越听越激动」），仅在内容确实触发情绪时输出\n" +
        "- gift 仅当 Bot 情绪很好时偶尔出现，content 如「送出了 小心心」\n" +
        "- 禁止辱骂、政治、色情、违禁内容；禁止提任何真实平台名\n" +
        "- 每次 3~6 条事件，别太多" +
        feynmanRules,
    },
    {
      role: "user",
      content:
        `直播主题：「${opts.topic}」（${opts.scene === "feynman" ? "费曼学习场景" : "主播排练场景"}）\n` +
        `当前热度等级：L${opts.heatLevel}${opts.pushedThisTick ? "（刚发生流量推送，新观众涌入，弹幕变热闹）" : ""}\n` +
        (opts.hostContent
          ? `主播刚刚说：「${opts.hostContent}」——观众针对这段话做出反应（提问/赞同/质疑/被逗乐）。`
          : opts.hostEarlierContent
            ? `主播最近一条发言是稍早说的：「${opts.hostEarlierContent}」。观众可以围绕这段内容追问细节、表达赞同或质疑，也可以讨论主题。`
            : "主播还没有发言，观众自由闲聊、讨论主题、或对开场期待一下。") +
        (opts.unansweredQuestion
          ? `\n有一个未被回应的提问：「${opts.unansweredQuestion}」，提问者可能在等待回应；若提问者不在发言名单中，可由其他观众替他催促或表达不满。`
          : "") +
        `\n最近直播间消息：\n${opts.recentWindow.slice(-10).join("\n") || "（开场，还没有消息）"}\n\n可发言的观众：\n${speakerDesc}`,
    },
  ];
}

/** 复盘报告 prompt */
export function buildReportPrompt(opts: {
  topic: string;
  scene: string;
  durationSec: number;
  stats: Record<string, number>;
  timelineSummary: string[];
}): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content:
        "你是直播训练教练，根据一场模拟直播的完整数据生成复盘报告。只输出 JSON。\n" +
        '格式：{"summary":"80字内总评","highlights":["亮点2~3条，引用主播原话"],"problems":[{"time":"mm:ss","desc":"问题描述"}],"suggestions":["可执行建议2~3条"]' +
        (opts.scene === "feynman"
          ? ',"feynman":{"conceptGaps":["没讲透的概念"],"followUpCount":数字}'
          : "") +
        "}\n要求具体到时间点与原话，不要空泛。",
    },
    {
      role: "user",
      content:
        `主题：「${opts.topic}」 时长：${Math.round(opts.durationSec / 60)}分钟\n统计数据：${JSON.stringify(opts.stats)}\n关键事件时间线：\n${opts.timelineSummary.slice(0, 40).join("\n")}`,
    },
  ];
}
