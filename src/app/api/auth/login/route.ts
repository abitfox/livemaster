import { handle } from "@/lib/api-helpers";
import { findUserByEmail, verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";

/** POST /api/auth/login —— 邮箱+密码登录 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) throw new Error("请填写邮箱和密码");

    const user = await findUserByEmail(email);
    // 安全口径：不区分「邮箱不存在」与「密码错误」
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new Error("邮箱或密码不正确");
    }

    const token = await createSessionToken(user.id, user.email);
    await setSessionCookie(token);
    return { ok: true, email: user.email };
  });
}
