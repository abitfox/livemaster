import { handle } from "@/lib/api-helpers";
import { runEngineTick } from "@/lib/engine/run-tick";
import { appendEvents, loadSession } from "@/lib/engine/session-service";
import { requireUserId, AuthError } from "@/lib/auth";

/** POST /api/live/send —— 主播发言：落 host 事件，并立即触发观众反应 */
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

    // 主播发言立即触发一轮观众反应（同 tick 逻辑，hostContent 驱动）
    const tick = await runEngineTick(body.sessionId, content);
    return {
      hostEvent,
      ...tick,
      newEvents: tick.newEvents, // 观众反应事件（不含 host，host 已单独返回）
    };
  });
}
