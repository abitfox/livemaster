import { handle } from "@/lib/api-helpers";
import { after } from "next/server";
import { endSession, saveReport, loadEvents, logUsage, bumpStats } from "@/lib/engine/session-service";
import type { AiReport, LiveSession } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** 生成 AI 复盘报告并落库（失败时写降级报告）。后台执行，不阻塞结束响应。 */
async function generateReportInBackground(sessionId: string, session: LiveSession): Promise<void> {
  try {
    const { buildReportPrompt } = await import("@/lib/engine/director");
    const { llmJson } = await import("@/lib/ai/llm");
    const { requireUserId } = await import("@/lib/auth");
    const userId = await requireUserId();
    const events = await loadEvents(sessionId, 400);
    const stats = session.stats;
    const timeline = events
      .filter((e) => ["question", "gift", "leave", "system", "mood_change", "host"].includes(e.type))
      .map((e) => {
        const mm = String(Math.floor(e.offsetMs / 60000)).padStart(2, "0");
        const ss = String(Math.floor((e.offsetMs % 60000) / 1000)).padStart(2, "0");
        return `${mm}:${ss} [${e.type}] ${e.content}`;
      });
    const res = await llmJson<AiReport>(
      buildReportPrompt({
        topic: session.topic,
        scene: session.scene,
        durationSec: session.durationSec ?? 0,
        stats: { ...stats, peakOnline: session.peakOnline, peakHeat: session.peakHeat },
        timelineSummary: timeline,
      }),
      // 思考型模型（deepseek-flash）思考占用 token 预算，给足避免 JSON 截断
      { maxTokens: 4000, timeoutMs: 90_000 },
    );
    const report: AiReport = { ...res.data, generatedAt: new Date().toISOString() };
    await saveReport(sessionId, report);
    await logUsage(userId, sessionId, "report", res.usage);
  } catch (e) {
    console.error("[report]", e);
    const fallback: AiReport = {
      summary: "AI 复盘暂不可用（未配置 LLM_API_KEY 或调用失败），以下为本地统计摘要。",
      highlights: [`峰值在线 ${session.peakOnline} 人，峰值热度 ${session.peakHeat}`],
      problems: [],
      suggestions: ["配置 LLM_API_KEY 后可获得 AI 逐段点评"],
      generatedAt: new Date().toISOString(),
    };
    await saveReport(sessionId, fallback).catch(() => {});
  }
}

/** POST /api/sessions/[id]/end —— 结束直播：立即落状态返回，复盘报告后台生成 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { interrupted?: boolean };
    const session = await endSession(id, !!body.interrupted);

    // 报告未生成时，响应结束后异步生成（复盘页轮询 aiReport 自动刷新）
    if (!session.aiReport) {
      after(async () => {
        await generateReportInBackground(id, session);
      });
    }

    await bumpStats(id, {});
    return { session, report: session.aiReport ?? null };
  });
}
