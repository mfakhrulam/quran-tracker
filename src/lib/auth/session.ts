import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessions } from "@/db/schema";
import type * as schema from "@/db/schema";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: LibSQLDatabase<typeof schema>, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function verifySession(db: LibSQLDatabase<typeof schema>, token: string) {
  if (!token) return null;
  const rows = await db.select().from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return rows[0] ? { userId: rows[0].userId } : null;
}

export async function deleteSession(db: LibSQLDatabase<typeof schema>, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
