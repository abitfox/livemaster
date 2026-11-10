/**
 * 自建认证：bcrypt 密码哈希 + jose JWT 会话（HttpOnly Cookie）。
 * 浏览器侧不持有任何凭证；服务端 Route Handler 通过 requireUserId() 校验。
 */
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { queryOne } from "@/lib/db";

export const SESSION_COOKIE = "lm_session";
const SESSION_DAYS = 30;

export class AuthError extends Error {}

interface SessionPayload {
  uid: string;
  email: string;
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET 未配置（用于签发会话 JWT）");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pwd: string): Promise<string> {
  return bcrypt.hash(pwd, 10);
}

export async function verifyPassword(pwd: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pwd, hash);
}

export async function createSessionToken(uid: string, email: string): Promise<string> {
  return await new SignJWT({ uid, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.uid || !payload.email) return null;
    return { uid: payload.uid as string, email: payload.email as string };
  } catch {
    return null;
  }
}

/** 设置登录 Cookie（Route Handler 中调用） */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/** 从请求 Cookie 解析当前用户；未登录返回 null */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** 从请求会话解析当前用户 id；未登录抛 AuthError（→401） */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("未登录");
  return user.uid;
}

/** 校验邮箱归属的用户行 */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    "select id, email, password_hash from users where lower(email) = lower($1)",
    [email.trim()],
  );
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>("select id, email, password_hash from users where id = $1", [id]);
}

/** 读昵称（无则回退邮箱前缀） */
export async function getNickname(userId: string, email: string): Promise<string> {
  const row = await queryOne<{ nickname: string }>("select nickname from profiles where user_id = $1", [userId]);
  return row?.nickname || email.split("@")[0];
}
