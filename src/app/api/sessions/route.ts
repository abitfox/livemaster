import { handle } from "@/lib/api-helpers";
import { createSessionWithBots, listSessions } from "@/lib/engine/session-service";
import type { Difficulty, Scene } from "@/lib/types";

/** GET /api/sessions —— 历史场次列表 */
export async function GET() {
  return handle(async () => {
    const { requireUserId } = await import("@/lib/auth");
    const userId = await requireUserId();
    return { sessions: await listSessions(userId) };
  });
}

/** POST /api/sessions —— 真正建场（点「开播」时调用）。
 *  bots 可选：传入 preview-bots 生成的画像则直接落库（不重复调 AI）；不传则现场生成（兼容旧流程）。 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as {
      topic?: string;
      scene?: Scene;
      difficulty?: Partial<Difficulty>;
      botCount?: number;
      bots?: Array<Record<string, unknown>>;
      botsKind?: string;
      botsUsage?: { promptTokens: number; completionTokens: number } | null;
    };
    const topic = (body.topic ?? "").trim();
    if (!topic) throw new Error("主题不能为空");
    const scene: Scene = body.scene === "feynman" ? "feynman" : "train";
    const difficulty: Difficulty = {
      temper: body.difficulty?.temper ?? "normal",
      silence: body.difficulty?.silence ?? "medium",
      durationMin: Math.max(5, Math.min(60, Number(body.difficulty?.durationMin ?? 20))),
    };
    const botCount = Math.max(8, Math.min(15, Number(body.botCount ?? body.bots?.length ?? 10)));
    return await createSessionWithBots({
      topic,
      scene,
      difficulty,
      botCount,
      bots: Array.isArray(body.bots) ? body.bots : null,
      botsKind: body.botsKind,
      botsUsage: body.botsUsage,
    });
  });
}
