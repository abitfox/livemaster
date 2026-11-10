import { handle } from "@/lib/api-helpers";
import { appendEvents, loadSession, bumpStats } from "@/lib/engine/session-service";
import { requireUserId, AuthError } from "@/lib/auth";

/**
 * POST /api/live/send —— 主播发言（两段式，立即返回）：
 * 1. 落 host 事件 + 统计，马上响应，体感零延迟；
 * 2. 观众反应由下一次 tick（≤10s）生成：run-tick 检测到窗口内的 host 事件后
 *    以 hostJustSpoke + 原话驱动导演与 AI——观众需要"反应时间"，也更像真实直播间。
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUserId();
    const body = (await req.json()) as { sessionId?: string; content?: string };
    if (!body.sessionId || !body.content?.trim()) throw new Error("参数缺失");
    const content = body.content.trim().slice(0, 500);

    const session = await loadSession(body.sessionId);
    if (session.status !== "live") throw new AuthError("场次不在直播中");

    const elapsedMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
    const [hostEvent] = await appendEvents(body.sessionId, [
      { type: "host", content, offsetMs: elapsedMs, meta: { name: "主播" } },
    ]);
    const stats = await bumpStats(body.sessionId, { hostCount: 1 });
    const newSession = await loadSession(body.sessionId);

    return { hostEvent, session: { ...newSession, stats } };
  });
}
