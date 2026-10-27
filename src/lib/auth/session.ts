import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessions } from "@/db/schema";
import type * as schema from "@/db/schema";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_DAYS = 30;

/**
 * audit F-10: sebelumnya setiap login menambah baris dan tidak ada yang
 * menghapus sesi kedaluwarsa, sehingga tabel `sessions` tumbuh monoton dan
 * token lama tetap berlaku penuh 30 hari. Sekarang login memangkas sesi
 * kedaluwarsa dan membatasi jumlah sesi aktif per pengguna.
 */
export const MAX_SESSIONS_PER_USER = 5;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Hapus sesi yang sudah lewat `expiresAt`. Aman dipanggil kapan saja. */
export async function purgeExpiredSessions(db: LibSQLDatabase<typeof schema>): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/**
 * Sisakan hanya `keep` sesi terbaru milik `userId`, hapus sisanya. Dipanggil
 * setelah sesi baru dibuat sehingga sesi baru selalu ikut terhitung.
 */
async function trimUserSessions(
  db: LibSQLDatabase<typeof schema>,
  userId: number,
  keep: number,
): Promise<void> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(asc(sessions.expiresAt));
  const excess = rows.length - keep;
  if (excess <= 0) return;
  const toDelete = rows.slice(0, excess);
  for (const row of toDelete) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
  }
}

export async function createSession(db: LibSQLDatabase<typeof schema>, userId: number) {
  // Pangkas yang kedaluwarsa lebih dulu supaya hitungan "sesi aktif" akurat.
  await purgeExpiredSessions(db);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt });

  await trimUserSessions(db, userId, MAX_SESSIONS_PER_USER);
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
