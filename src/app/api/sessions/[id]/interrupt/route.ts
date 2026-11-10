import { handle } from "@/lib/api-helpers";
import { loadSession, loadBots, loadEvents, appendEvents, endSession } from "@/lib/engine/session-service";

type Params = { params: Promise<{ id: string }> };

/** POST /api/sessions/[id]/interrupt —— 异常中断（关闭页面等），标记 interrupted */
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const session = await loadSession(id);
    if (session.status === "live") {
      await endSession(id, true);
    }
    return { marked: true };
  });
}

/** GET 事件增量拉取（备用：?after=<offsetMs>） */
export async function GET(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const after = Number(new URL(req.url).searchParams.get("after") ?? "0");
    const [session, bots, events] = await Promise.all([
      loadSession(id),
      loadBots(id),
      loadEvents(id, 100, after || undefined),
    ]);
    void appendEvents; // 保留引用避免 tree-shake 误删
    return { session, bots, events };
  });
}
