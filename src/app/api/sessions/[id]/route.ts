import { handle } from "@/lib/api-helpers";
import { deleteSession, loadBots, loadEvents, loadSession } from "@/lib/engine/session-service";

type Params = { params: Promise<{ id: string }> };

/** GET /api/sessions/[id] —— 场次详情（回放页用：session + bots + 全量事件） */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const [session, bots, events] = await Promise.all([
      loadSession(id),
      loadBots(id),
      loadEvents(id, 1000),
    ]);
    return { session, bots, events };
  });
}

/** DELETE /api/sessions/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    await deleteSession(id);
    return { deleted: true };
  });
}
