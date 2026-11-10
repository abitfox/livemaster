/**
 * GLM-5.3-Flash 调用层（移植自 33_KnowledgeGraph/misiki，改为非流式 JSON 输出模式）。
 * 直播 tick 场景不需要流式：一次调用返回一批结构化事件。
 */

const MODEL = process.env.GLM_MODEL ?? "glm-5.3-flash";
const BASE_URL = process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";

// glm-5.3-flash 强制思考且无法关闭（单次大 JSON 生成实测 25~90s），
// 高频调用（建场观众群 / tick 弹幕）改用无思考的轻量模型保证实时性；
// 复盘报告等低频重任务仍用 GLM_MODEL。
const FAST_MODEL = process.env.GLM_FAST_MODEL ?? "glm-4-air";
export { FAST_MODEL };

export function isAiEnabled(): boolean {
  return !!process.env.GLM_API_KEY;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

interface LlmResult {
  content: string;
  usage: LlmUsage | null;
}

/** 非流式调用，返回纯文本。 */
export async function llm(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; thinking?: "low" | "high"; model?: string; timeoutMs?: number } = {},
): Promise<LlmResult> {
  const key = process.env.GLM_API_KEY;
  if (!key) throw new Error("GLM_API_KEY 未配置");
  const body: Record<string, unknown> = {
    model: opts.model ?? MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 2048,
    stream: false,
  };
  if (opts.thinking) body.thinking = { level: opts.thinking };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // AI 挂死不能拖垮请求：超时抛错 → 上层模板降级兜底
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  };
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 }
      : null,
  };
}

/**
 * 调用并解析 JSON 输出。AI 被要求只输出 JSON；
 * 兜底剥离 markdown 代码围栏、截取首个 {...} 或 [...] 块后 parse。
 */
export async function llmJson<T>(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; thinking?: "low" | "high"; model?: string; timeoutMs?: number } = {},
): Promise<{ data: T; usage: LlmUsage | null }> {
  const result = await llm(messages, opts);
  return { data: extractJson<T>(result.content), usage: result.usage };
}

export function extractJson<T>(raw: string): T {
  let s = raw.trim();
  // 剥 ```json ... ``` 围栏
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // 截取首个 { 或 [ 到最后一个 } 或 ]
  const start = Math.min(
    ...["{", "["].map((c) => s.indexOf(c)).filter((i) => i >= 0),
  );
  if (Number.isFinite(start) && start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
  return JSON.parse(s) as T;
}
