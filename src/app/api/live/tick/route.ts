import { handle } from "@/lib/api-helpers";
import { runEngineTick } from "@/lib/engine/run-tick";

/** POST /api/live/tick —— 客户端轮询驱动导演引擎步进 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { sessionId?: string };
    if (!body.sessionId) throw new Error("缺少 sessionId");
    return await runEngineTick(body.sessionId);
  });
}
