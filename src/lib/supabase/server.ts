import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 服务端组件 / Route Handler 用的用户态客户端（anon key + 用户 cookie） */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never),
            );
          } catch {
            // Server Component 里调用时 cookie 只读，交给 middleware 刷新即可
          }
        },
      },
    },
  );
}
