import { handle } from "@/lib/api-helpers";
import { after } from "next/server";
import { appendEvents, loadSession, bumpStats } from "@/lib/engine/session-service";
import { requireUserId, AuthError } from "@/lib/auth";

/** 引擎最小冷却：send 触发与定时 tick 共用，保证 AI 调用频率不超标 */
const ENGINE_COOLDOWN_MS = 20_000;

/**
 * POST /api/live/send —— 主播发言（两段式，立即返回）：
 * 1. 落 host 事件 + 统计，马上响应，体感零延迟；
 * 2. 发言加速触发：引擎冷却已过（距上次 tick ≥ 20s）时，响应结束后立即驱动一次
 *    tick（带原话），观众 5~7 秒内贴题反应；冷却中则由下一轮定时 tick 处理。
 *    总调用频率上限不变（≈1~3 次/分钟），由冷却闸门保证。
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

    const lastMs = new Date(session.lastTickAt ?? session.startedAt).getTime();
    if (Date.now() - lastMs >= ENGINE_COOLDOWN_MS) {
      after(async () => {
        try {
          const { runEngineTick } = await import("@/lib/engine/run-tick");
          await runEngineTick(body.sessionId as string, content);
        } catch (e) {
          console.error("[send:tick]", e);
        }
      });
    }

    return { hostEvent, session: { ...newSession, stats } };
  });
}
