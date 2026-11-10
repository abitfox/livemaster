import { handle } from "@/lib/api-helpers";
import { findUserByEmail, hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";

/** POST /api/auth/register —— 邮箱+密码注册（不做邮箱验证），成功即登录 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱格式不正确，请检查后重试");
    if (password.length < 8) throw new Error("密码至少 8 位");

    const exists = await findUserByEmail(email);
    if (exists) throw new Error("该邮箱已注册，试试直接登录？");

    const hash = await hashPassword(password);
    const user = await queryOne<{ id: string; email: string }>(
      "insert into users (email, password_hash) values (lower($1), $2) returning id, email",
      [email, hash],
    );
    if (!user) throw new Error("注册失败，请稍后重试");
    await query("insert into profiles (user_id) values ($1) on conflict (user_id) do nothing", [user.id]);

    const token = await createSessionToken(user.id, user.email);
    await setSessionCookie(token);
    return { ok: true, email: user.email };
  });
}
