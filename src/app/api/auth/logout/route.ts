import { handle } from "@/lib/api-helpers";
import { clearSessionCookie } from "@/lib/auth";

/** POST /api/auth/logout —— 清除会话 Cookie */
export async function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}
