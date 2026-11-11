import { handle } from "@/lib/api-helpers";
import { generateBotProfiles } from "@/lib/engine/session-service";
import type { Scene } from "@/lib/types";

/**
 * POST /api/sessions/preview-bots —— 两阶段建场第 1 步：
 * 仅生成观众画像（AI/模板降级），不创建场次、不写库。
 * 用户点「开播」时再调 POST /api/sessions 携带画像真正建场。
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { topic?: string; scene?: Scene; botCount?: number };
    const topic = (body.topic ?? "").trim();
    if (!topic) throw new Error("主题不能为空");
    const scene: Scene = body.scene === "feynman" ? "feynman" : "train";
    const botCount = Math.max(8, Math.min(15, Number(body.botCount ?? 10)));
    const { profiles, kind, usage } = await generateBotProfiles(topic, scene, botCount);
    return { bots: profiles.slice(0, botCount), kind, usage };
  });
}
