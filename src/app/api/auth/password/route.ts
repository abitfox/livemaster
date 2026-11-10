import { handle } from "@/lib/api-helpers";
import { requireUserId, findUserById, verifyPassword, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";

/** POST /api/auth/password —— 已登录状态修改密码（需当前密码） */
export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
    const newPwd = body.newPassword ?? "";
    if (newPwd.length < 8) throw new Error("新密码至少 8 位");

    const user = await findUserById(userId);
    if (!user) throw new Error("用户不存在");
    if (!(await verifyPassword(body.currentPassword ?? "", user.password_hash))) {
      throw new Error("当前密码不正确");
    }
    await query("update users set password_hash = $1 where id = $2", [
      await hashPassword(newPwd),
      userId,
    ]);
    return { ok: true };
  });
}
