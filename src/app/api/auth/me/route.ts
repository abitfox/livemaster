import { handle } from "@/lib/api-helpers";
import { getSessionUser, getNickname } from "@/lib/auth";

/** GET /api/auth/me —— 当前登录用户（未登录返回 user: null） */
export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    if (!user) return { user: null };
    return { user: { email: user.email, nickname: await getNickname(user.uid, user.email) } };
  });
}
