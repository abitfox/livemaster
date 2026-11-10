// ============================================================
// 共享领域类型：客户端与服务端 API 契约的唯一来源
// ============================================================

export type Scene = "train" | "feynman";
export type SessionStatus = "live" | "ended" | "interrupted";

/** 人格 key（persona 表字段） */
export const PERSONAS = [
  "supporter", // 捧场型
  "curious",   // 好奇宝宝
  "heckler",   // 杠精质疑型
  "passive",   // 潜水党
  "scholar",   // 学霸较真型
  "whale",     // 土豪型
  "grump",     // 易怒型
] as const;
export type Persona = (typeof PERSONAS)[number];

export const PERSONA_LABELS: Record<Persona, string> = {
  supporter: "捧场型",
  curious: "好奇宝宝",
  heckler: "杠精质疑",
  passive: "潜水党",
  scholar: "学霸较真",
  whale: "土豪型",
  grump: "易怒型",
};

export const KNOWLEDGE_LABELS: Record<string, string> = {
  novice: "小白",
  beginner: "入门",
  enthusiast: "爱好者",
  expert: "专家",
};

/** 事件类型枚举（策划案 4.3②） */
export type EventType =
  | "chat"
  | "question"
  | "gift"
  | "enter"
  | "leave"
  | "system"
  | "mood_change"
  | "follow"
  | "host"
  | "heat";

export interface Difficulty {
  temper: "gentle" | "normal" | "harsh";     // 观众脾气
  silence: "lenient" | "medium" | "strict";  // 冷场敏感度
  durationMin: number;                        // 场次时长（分钟）
}

export interface BotProfile {
  id: string;
  sessionId: string;
  name: string;
  persona: Persona;
  personaLabel: string;
  gender: string;
  ageRange: string;
  occupation: string;
  knowledgeLevel: string;
  gradient: string; // g1~g6
  patience: number; // 1~5
  giftWillingness: number; // 0~5
  sampleLines: string[];
  mood: number; // -100~100
  status: "online" | "left";
  leftReason: string | null;
}

export interface LiveEvent {
  id: string;
  sessionId: string;
  botId: string | null;
  type: EventType;
  content: string;
  meta: Record<string, unknown>;
  offsetMs: number;
  createdAt: string;
}

export interface SessionStats {
  danmakuCount: number;
  questionCount: number;
  questionAnswered: number;
  giftCount: number;
  followCount: number;
  enterCount: number;
  leaveCount: number;
  hostCount: number;
  silenceCount: number;
}

export interface LiveSession {
  id: string;
  userId: string;
  topic: string;
  scene: Scene;
  status: SessionStatus;
  difficulty: Difficulty;
  heat: number;
  heatLevel: number; // 0~3
  levelHoldSec: number;
  silenceSec: number;
  audienceExtra: number;
  peakOnline: number;
  peakHeat: number;
  lastTickAt: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  stats: SessionStats;
  aiReport: AiReport | null;
}

/** AI 复盘报告（V0.1 简版：亮点/问题/建议；费曼场景追问统计） */
export interface AiReport {
  summary: string;
  highlights: string[];
  problems: { time: string; desc: string }[];
  suggestions: string[];
  feynman?: { conceptGaps: string[]; followUpCount: number };
  generatedAt: string;
}

/** AI 调用观测记录（直播页 AI 引擎面板展示用） */
export interface AiTrace {
  kind: "tick" | "report" | "bots_gen";
  model: string;
  durationMs: number;
  /** 发送给模型的完整 prompt（system + user） */
  prompt: string;
  /** 模型的深度思考过程（reasoning_content） */
  thinking: string;
  /** 模型原始输出 */
  output: string;
  /** 解析出的有效事件数 */
  eventCount: number;
  /** 是否降级为本地模板 */
  fallback: boolean;
  error?: string;
  ts: string;
}

/** tick 响应：客户端据此增量渲染 */
export interface TickResponse {
  session: LiveSession;
  newEvents: LiveEvent[];
  bots: { id: string; mood: number; status: string }[];
  onlineCount: number;
  aiTrace?: AiTrace;
}
