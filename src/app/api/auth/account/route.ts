import { handle } from "@/lib/api-helpers";
import { requireUserId, clearSessionCookie } from "@/lib/auth";
import { query } from "@/lib/db";

/** DELETE /api/auth/account —— 永久删除账号（级联清除全部数据）并登出 */
export async function DELETE() {
  return handle(async () => {
    const userId = await requireUserId();
    await query("delete from users where id = $1", [userId]); // profiles/sessions/bots/events 级联删除
    await clearSessionCookie();
    return { ok: true };
  });
}
