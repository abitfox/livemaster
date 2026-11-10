import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** middleware：校验会话 Cookie 保护 /app 路由（未登录重定向官网并带上弹窗参数） */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get("lm_session")?.value;
  let isLoggedIn = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      isLoggedIn = true;
    } catch {
      isLoggedIn = false;
    }
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/app") && !isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "login");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
