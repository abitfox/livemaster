/**
 * Neon Postgres 连接池（生产走 pooler 地址，事务模式连接池）。
 * pg 默认不使用命名预处理语句，与 PgBouncer 事务池兼容。
 */
import { Pool, type QueryResultRow } from "pg";
import { AuthError } from "@/lib/auth";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("数据库未配置（DATABASE_URL）");

// 去掉 libpq 专属参数（pg 驱动不识别，避免干扰）
const url = raw.replace(/([?&])channel_binding=[^&]*&?/, "$1").replace(/&&+/g, "&").replace(/\?&/, "?");

const globalForDb = globalThis as unknown as { __lmPool?: Pool };
export const pool =
  globalForDb.__lmPool ??
  new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: false },
  });
globalForDb.__lmPool = pool;

/** 执行 SQL，返回行数组 */
export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

/** 执行 SQL，返回单行（无行时为 null） */
export async function queryOne<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export { AuthError };
