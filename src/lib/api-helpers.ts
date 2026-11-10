import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export function ok<T>(data: T) {
  return NextResponse.json(data as object);
}

export function fail(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** 统一错误包装：AuthError→401，其余→500 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, 401);
    const msg = e instanceof Error ? e.message : "服务异常";
    console.error("[api]", msg);
    return fail(msg);
  }
}
