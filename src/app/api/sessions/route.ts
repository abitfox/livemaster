import { handle } from "@/lib/api-helpers";
import { createSessionWithBots, listSessions } from "@/lib/engine/session-service";
import type { Difficulty, Scene } from "@/lib/types";

/** GET /api/sessions —— 历史场次列表 */
export async function GET() {
  return handle(async () => {
    const { requireUserId } = await import("@/lib/supabase/admin");
    const userId = await requireUserId();
    return { sessions: await listSessions(userId) };
  });
}

/** POST /api/sessions —— 新建场次 + 生成 Bot 观众群 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as {
      topic?: string;
      scene?: Scene;
      difficulty?: Partial<Difficulty>;
      botCount?: number;
    };
    const topic = (body.topic ?? "").trim();
    if (!topic) throw new Error("主题不能为空");
    const scene: Scene = body.scene === "feynman" ? "feynman" : "train";
    const difficulty: Difficulty = {
      temper: body.difficulty?.temper ?? "normal",
      silence: body.difficulty?.silence ?? "medium",
      durationMin: Math.max(5, Math.min(60, Number(body.difficulty?.durationMin ?? 20))),
    };
    const botCount = Math.max(8, Math.min(15, Number(body.botCount ?? 10)));
    return await createSessionWithBots({ topic, scene, difficulty, botCount });
  });
}
