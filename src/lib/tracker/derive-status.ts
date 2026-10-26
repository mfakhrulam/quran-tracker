import { notInArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog, memorizationStatus } from "@/db/schema";
import type * as schema from "@/db/schema";

/**
 * Menurunkan ulang `memorization_status` dari `sessions_log`.
 *
 * `memorization_status` adalah data turunan, bukan sumber kebenaran: status
 * sebuah halaman = kualitas `sabaq` terbaru, `memorizedAt` = tanggal `sabaq`
 * pertama, `lastReviewedAt` = tanggal log terakhir (sabaq/sabqi/manzil).
 *
 * Semua tulis dikirim lewat satu `db.batch()` — satu round-trip HTTP, bukan
 * satu INSERT per halaman. Versi lama melakukan `await insert` di dalam loop,
 * sehingga 604 halaman hafalan = 604 round-trip berurutan (~60 detik di
 * Netlify lintas region).
 */
export async function recomputeMemorizationStatus(
  db: LibSQLDatabase<typeof schema>,
): Promise<void> {
  const logs = await db.select().from(sessionsLog).orderBy(sessionsLog.date, sessionsLog.id);

  const sabaqFirst = new Map<number, string>();
  const sabaqLast = new Map<number, string>();
  const lastReview = new Map<number, string>();

  for (const log of logs) {
    lastReview.set(log.pageNumber, log.date);
    if (log.type === "sabaq") {
      if (!sabaqFirst.has(log.pageNumber)) sabaqFirst.set(log.pageNumber, log.date);
      sabaqLast.set(log.pageNumber, log.quality);
    }
  }

  const writes = [...sabaqLast].map(([pageNumber, quality]) => {
    const memorizedAt = new Date(sabaqFirst.get(pageNumber)!);
    const lastReviewedAt = new Date(lastReview.get(pageNumber)!);
    return db
      .insert(memorizationStatus)
      .values({ pageNumber, status: quality, memorizedAt, lastReviewedAt })
      .onConflictDoUpdate({
        target: memorizationStatus.pageNumber,
        set: { status: quality, memorizedAt, lastReviewedAt },
      });
  });

  const memorizedPageNumbers = [...sabaqLast.keys()];
  const prune =
    memorizedPageNumbers.length === 0
      ? db.delete(memorizationStatus)
      : db.delete(memorizationStatus).where(notInArray(memorizationStatus.pageNumber, memorizedPageNumbers));

  // Satu round-trip: semua upsert + prune dikirim bersama. `batch()` menuntut
  // tuple non-kosong, jadi saat belum ada sabaq sama sekali cukup prune saja.
  if (writes.length === 0) {
    await prune;
    return;
  }
  await db.batch([writes[0], ...writes.slice(1), prune]);
}
