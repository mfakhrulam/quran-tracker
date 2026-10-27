import { and, asc, eq, ne } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { sessionsLog } from "@/db/schema";
import type * as schema from "@/db/schema";

/**
 * Invarian tanggal `sabaq` (audit F-07).
 *
 * `memorization_status.memorizedAt` = tanggal `sabaq` PERTAMA untuk sebuah
 * halaman, dan seluruh jadwal murajaah di-replay dari log. Sebelumnya klien
 * bebas mengirim `type: "sabaq"` dengan tanggal apa pun, sehingga satu request
 * bisa memundurkan jangkar hafalan dan mengubah semua interval.
 *
 * Aturan: klien tidak boleh MENAMBAH `sabaq` bertanggal lebih awal daripada
 * `sabaq` paling awal yang sudah ada untuk halaman itu. Log yang sedang diedit
 * dikecualikan dari perbandingan, sehingga koreksi tanggal yang salah ketik
 * pada log paling awal tetap dimungkinkan.
 */
export async function earliestSabaqDate(
  db: LibSQLDatabase<typeof schema>,
  pageNumber: number,
  excludeLogId?: number,
): Promise<string | null> {
  const where =
    excludeLogId === undefined
      ? and(eq(sessionsLog.pageNumber, pageNumber), eq(sessionsLog.type, "sabaq"))
      : and(
          eq(sessionsLog.pageNumber, pageNumber),
          eq(sessionsLog.type, "sabaq"),
          ne(sessionsLog.id, excludeLogId),
        );

  const rows = await db
    .select({ date: sessionsLog.date })
    .from(sessionsLog)
    .where(where)
    .orderBy(asc(sessionsLog.date))
    .limit(1);

  return rows[0]?.date ?? null;
}

/**
 * Mengembalikan pesan error bila `sabaq` pada `date` akan memundurkan jangkar
 * hafalan, atau `null` bila boleh diterima.
 */
export async function checkSabaqAnchor(
  db: LibSQLDatabase<typeof schema>,
  pageNumber: number,
  date: string,
  excludeLogId?: number,
): Promise<string | null> {
  const earliest = await earliestSabaqDate(db, pageNumber, excludeLogId);
  if (earliest !== null && date < earliest) {
    return `Tanggal sabaq tidak boleh sebelum hafalan pertama halaman ini (${earliest})`;
  }
  return null;
}
