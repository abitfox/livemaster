/**
 * 通用 LLM 调用层 —— 供应商无关，兼容所有 OpenAI Chat Completions 风格 API
 * （DeepSeek / 智谱 GLM / Moonshot / 通义 等），通过环境变量一键切换：
 *
 *   LLM_API_KEY     API 密钥
 *   LLM_BASE_URL    API 根地址（不含 /chat/completions）
 *   LLM_MODEL       重任务模型（复盘报告等）
 *   LLM_FAST_MODEL  轻量快速模型（建场观众群）
 *   LLM_TICK_MODEL  tick 弹幕模型（高频，要求秒级响应）
 *
 * 兼容旧变量名 GLM_*（优先读 LLM_*，未设置时回退 GLM_*）。
 * 切换示例（DeepSeek）：
 *   LLM_BASE_URL=https://api.deepseek.com
 *   LLM_MODEL=deepseek-flash  LLM_FAST_MODEL=deepseek-flash  LLM_TICK_MODEL=deepseek-flash
 * 切换示例（智谱）：
 *   LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
 *   LLM_MODEL=glm-5.3-flash  LLM_FAST_MODEL=glm-4-air
 */

const BASE_URL =
  process.env.LLM_BASE_URL ?? process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";
const API_KEY = process.env.LLM_API_KEY ?? process.env.GLM_API_KEY ?? "";

const MODEL = process.env.LLM_MODEL ?? process.env.GLM_MODEL ?? "glm-5.3-flash";
export { MODEL };

// 轻量模型：默认按供应商推断（DeepSeek → deepseek-flash，智谱 → glm-4-air）
const DEFAULT_FAST = BASE_URL.includes("deepseek") ? "deepseek-flash" : "glm-4-air";
export const FAST_MODEL = process.env.LLM_FAST_MODEL ?? process.env.GLM_FAST_MODEL ?? DEFAULT_FAST;
export const TICK_MODEL = process.env.LLM_TICK_MODEL ?? process.env.GLM_TICK_MODEL ?? FAST_MODEL;

// 智谱 glm-5.3-flash 强制思考且不可关闭；其思考等级用专属 thinking 参数。
// 其他供应商（如 DeepSeek）不接受该参数，跳过，避免 400。
const IS_ZHIPU = BASE_URL.includes("bigmodel");

export function isAiEnabled(): boolean {
  return !!API_KEY;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

interface LlmResult {
  content: string;
  /** 思考过程（DeepSeek reasoning_content / 智谱 thinking），仅观测用 */
  reasoning: string | null;
  /** 原始返回文本（观测用） */
  raw: string;
  /** 实际使用的模型 */
  model: string;
  usage: LlmUsage | null;
}

/** 非流式调用，返回纯文本。 */
export async function llm(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; thinking?: "low" | "high"; model?: string; timeoutMs?: number } = {},
): Promise<LlmResult> {
  if (!API_KEY) throw new Error("LLM_API_KEY 未配置");
  const body: Record<string, unknown> = {
    model: opts.model ?? MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 2048,
    stream: false,
  };
  if (opts.thinking && IS_ZHIPU) body.thinking = { level: opts.thinking };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // AI 挂死不能拖垮请求：超时抛错 → 上层模板降级兜底
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  };
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content ?? "",
    reasoning: msg?.reasoning_content ?? null,
    raw: msg?.content ?? "",
    model: String(body.model),
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
): Promise<{ data: T; usage: LlmUsage | null; reasoning: string | null; raw: string; model: string }> {
  const result = await llm(messages, opts);
  return {
    data: extractJson<T>(result.content),
    usage: result.usage,
    reasoning: result.reasoning,
    raw: result.raw,
    model: result.model,
  };
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
