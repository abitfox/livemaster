/**
 * 本地模板降级层：GLM_API_KEY 未配置或调用失败时使用。
 * 保证无 Key 也能完整走通「开播→直播→复盘」闭环（演示/开发模式）。
 */
import type { BotProfile, Persona } from "@/lib/types";

const TEMPLATE_BOTS: Omit<BotProfile, "id" | "sessionId">[] = [
  { name: "摸鱼的阿强", persona: "supporter", personaLabel: "捧场型", gender: "男", ageRange: "26-35", occupation: "程序员", knowledgeLevel: "enthusiast", gradient: "g1", patience: 4, giftWillingness: 2, sampleLines: ["讲得可以", "这段有用，记了", "主播继续"], mood: 0, status: "online", leftReason: null },
  { name: "白嫖怪小美", persona: "curious", personaLabel: "好奇宝宝", gender: "女", ageRange: "18-25", occupation: "大学生", knowledgeLevel: "novice", gradient: "g2", patience: 3, giftWillingness: 0, sampleLines: ["等等，这个是啥意思", "能举个栗子吗", "小白能听懂吗"], mood: 0, status: "online", leftReason: null },
  { name: "杠就完了", persona: "heckler", personaLabel: "杠精质疑", gender: "男", ageRange: "26-35", occupation: "自由职业", knowledgeLevel: "enthusiast", gradient: "g5", patience: 2, giftWillingness: 0, sampleLines: ["我不太同意", "数据来源呢", "感觉说得绝对了"], mood: 0, status: "online", leftReason: null },
  { name: "潜水看戏", persona: "passive", personaLabel: "潜水党", gender: "女", ageRange: "26-35", occupation: "上班族", knowledgeLevel: "beginner", gradient: "g6", patience: 5, giftWillingness: 0, sampleLines: ["……", "继续讲", "嗯"], mood: 0, status: "online", leftReason: null },
  { name: "较真小王", persona: "scholar", personaLabel: "学霸较真", gender: "男", ageRange: "18-25", occupation: "研究生", knowledgeLevel: "expert", gradient: "g4", patience: 4, giftWillingness: 1, sampleLines: ["这里有个概念要澄清", "严格来说应该是", "有没有文献支撑"], mood: 0, status: "online", leftReason: null },
  { name: "土豪哥Rich", persona: "whale", personaLabel: "土豪型", gender: "男", ageRange: "36-45", occupation: "老板", knowledgeLevel: "beginner", gradient: "g1", patience: 3, giftWillingness: 5, sampleLines: ["讲得好！", "有点意思", "主播加油"], mood: 0, status: "online", leftReason: null },
  { name: "暴躁老姐", persona: "grump", personaLabel: "易怒型", gender: "女", ageRange: "26-35", occupation: "运营", knowledgeLevel: "beginner", gradient: "g3", patience: 1, giftWillingness: 0, sampleLines: ["快点讲重点", "怎么又冷场了", "说正事"], mood: 0, status: "online", leftReason: null },
  { name: "爱问的桃子", persona: "curious", personaLabel: "好奇宝宝", gender: "女", ageRange: "18-25", occupation: "新媒体编辑", knowledgeLevel: "novice", gradient: "g2", patience: 3, giftWillingness: 1, sampleLines: ["为什么呀", "然后呢然后呢", "涨知识了"], mood: 0, status: "online", leftReason: null },
  { name: "币圈老K", persona: "supporter", personaLabel: "捧场型", gender: "男", ageRange: "26-35", occupation: "币圈老哥", knowledgeLevel: "enthusiast", gradient: "g5", patience: 3, giftWillingness: 3, sampleLines: ["格局打开", "说得对", "这个逻辑没问题"], mood: 0, status: "online", leftReason: null },
  { name: "夜宵诗人", persona: "passive", personaLabel: "潜水党", gender: "男", ageRange: "18-25", occupation: "学生", knowledgeLevel: "novice", gradient: "g6", patience: 4, giftWillingness: 0, sampleLines: ["路过", "嗯嗯", "听着呢"], mood: 0, status: "online", leftReason: null },
];

export function templateBots(count: number, offset = 0): Omit<BotProfile, "id" | "sessionId">[] {
  const out: Omit<BotProfile, "id" | "sessionId">[] = [];
  for (let i = 0; i < count; i++) {
    const base = TEMPLATE_BOTS[(i + offset) % TEMPLATE_BOTS.length];
    const suffix = i >= TEMPLATE_BOTS.length ? `${Math.floor(i / TEMPLATE_BOTS.length) + 1}号` : "";
    out.push({ ...base, name: suffix ? `${base.name}${suffix}` : base.name });
  }
  return out;
}

const CHAT_TEMPLATES = [
  "主播继续", "这段有干货", "mark 一下", "听着呢", "有点意思", "讲得太快了慢一点",
  "前排围观", "刚进来，讲到哪了", "这句话说到点子上了", "学到了", "支持主播", "上下文有点跟不上",
];

const QUESTION_TEMPLATES = [
  "能举个例子吗？", "这个具体怎么操作？", "新手该从哪一步开始？", "有没有反例？",
  "这个和 XX 的区别是什么？", "实操中最容易踩的坑是什么？",
];

const GIFT_TEMPLATES = ["送出了 小心心", "送出了 粉丝团灯牌", "送出了 火箭"];

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

export interface TemplateEvent {
  botId: string;
  type: "chat" | "question" | "gift" | "mood_change" | "follow";
  content: string;
}

/** 无 AI 时的 tick 事件模板 */
export function templateTickEvents(speakerIds: string[], hostContent?: string): TemplateEvent[] {
  const events: TemplateEvent[] = [];
  const chats = pick(CHAT_TEMPLATES, Math.min(speakerIds.length, 3));
  speakerIds.slice(0, chats.length).forEach((id, i) => {
    events.push({
      botId: id,
      type: "chat",
      content: hostContent
        ? `${pick(["同意", "是的", "有道理", "不太认同", "再展开讲讲"], 1)[0]}——${chats[i]}`
        : chats[i],
    });
  });
  if (Math.random() < 0.3 && speakerIds.length) {
    events.push({ botId: speakerIds[0], type: "question", content: pick(QUESTION_TEMPLATES, 1)[0] });
  }
  if (Math.random() < 0.12 && speakerIds.length) {
    events.push({ botId: speakerIds[speakerIds.length - 1], type: "gift", content: pick(GIFT_TEMPLATES, 1)[0] });
  }
  return events;
}
