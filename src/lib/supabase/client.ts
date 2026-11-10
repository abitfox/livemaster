import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient;

let cached: Client | null = null;

/**
 * 浏览器端 Supabase 客户端（认证状态走 cookie）。
 * 环境变量缺失时返回 null（未配置环境的降级：页面不崩溃，按未登录处理）。
 */
export function createClient(): Client | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("placeholder")) return null;
  try {
    cached = createBrowserClient(url, key);
    return cached;
  } catch {
    return null;
  }
}
