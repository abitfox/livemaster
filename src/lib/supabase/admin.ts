import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * 服务端管理客户端（service_role）。
 * 仅在 Route Handler 中使用；所有查询显式按 user_id 过滤做归属校验。
 */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 服务端配置缺失（SUPABASE_SERVICE_ROLE_KEY）");
  cached = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** 从请求会话解析当前用户 id；未登录抛错。 */
export async function requireUserId(): Promise<string> {
  const { createClient } = await import("./server");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AuthError("未登录");
  return data.user.id;
}

export class AuthError extends Error {}
