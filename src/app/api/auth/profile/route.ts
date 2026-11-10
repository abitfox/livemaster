import { handle } from "@/lib/api-helpers";
import { requireUserId, getSessionUser, getNickname } from "@/lib/auth";
import { query } from "@/lib/db";

/** GET /api/auth/profile —— 昵称（设置页用） */
export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    if (!user) throw new Error("未登录");
    return { email: user.email, nickname: await getNickname(user.uid, user.email) };
  });
}

/** PATCH /api/auth/profile —— 保存昵称 */
export async function PATCH(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = (await req.json()) as { nickname?: string };
    const name = (body.nickname ?? "").trim().slice(0, 24);
    if (!name) throw new Error("昵称不能为空");
    await query(
      "insert into profiles (user_id, nickname) values ($1, $2) on conflict (user_id) do update set nickname = $2",
      [userId, name],
    );
    return { ok: true, nickname: name };
  });
}
