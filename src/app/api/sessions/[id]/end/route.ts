import { handle } from "@/lib/api-helpers";
import { endSession, saveReport, loadEvents, loadSession, logUsage, bumpStats } from "@/lib/engine/session-service";
import type { AiReport } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** POST /api/sessions/[id]/end —— 结束直播：落状态 + 统计 + 生成 AI 复盘报告 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { interrupted?: boolean };
    const session = await endSession(id, !!body.interrupted);

    // 生成 AI 复盘报告（失败不阻塞结束动作）
    let report: AiReport | null = session.aiReport;
    if (!report) {
      try {
        const { buildReportPrompt } = await import("@/lib/engine/director");
        const { llmJson } = await import("@/lib/ai/glm");
        const { requireUserId } = await import("@/lib/supabase/admin");
        const userId = await requireUserId();
        const events = await loadEvents(id, 400);
        const stats = session.stats;
        const timeline = events
          .filter((e) => ["question", "gift", "leave", "system", "mood_change", "host"].includes(e.type))
          .map((e) => {
            const t = new Date(e.offsetMs).toISOString().slice(14, 19).replace("T", "");
            const mm = String(Math.floor(e.offsetMs / 60000)).padStart(2, "0");
            const ss = String(Math.floor((e.offsetMs % 60000) / 1000)).padStart(2, "0");
            void t;
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
          { maxTokens: 2048, thinking: "low" },
        );
        report = { ...res.data, generatedAt: new Date().toISOString() };
        await saveReport(id, report);
        await logUsage(userId, id, "report", res.usage);
      } catch (e) {
        // 报告生成失败时给降级报告
        report = {
          summary: "AI 复盘暂不可用（未配置 GLM_API_KEY 或调用失败），以下为本地统计摘要。",
          highlights: [`峰值在线 ${session.peakOnline} 人，峰值热度 ${session.peakHeat}`],
          problems: [],
          suggestions: ["配置 GLM_API_KEY 后可获得 AI 逐段点评"],
          generatedAt: new Date().toISOString(),
        };
        await saveReport(id, report);
        console.error("[report]", e);
      }
    }

    await bumpStats(id, {});
    return { session: { ...session, aiReport: report }, report };
  });
}
