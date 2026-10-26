import { unstable_cache } from "next/cache";
import { memorizationStatus } from "@/db/schema";
import { getDb } from "@/lib/auth/db";

export type CachedStatusRow = typeof memorizationStatus.$inferSelect;

/**
 * Tag untuk seluruh data turunan yang berubah setiap kali `sessions_log`
 * berubah. Setiap mutasi setoran / target / hari libur memanggil
 * `revalidateTag(PROGRESS_TAG)` dari `route.ts`, jadi pembacaan selalu segar
 * tanpa perlu menunggu TTL.
 */
export const PROGRESS_TAG = "progress";

/**
 * Tabel `memorization_status` dibaca di hampir setiap halaman. Di Netlify satu
 * query = satu round-trip lintas region ke Turso, jadi hasilnya di-cache di
 * Netlify Durable Cache (otomatis aktif untuk Next Runtime 5.5+) dengan
 * revalidasi berbasis tag.
 *
 * Seluruh kolom ikut di-cache (bukan hanya pageNumber+status): halaman
 * murajaah dan dashboard butuh `memorizedAt`, `intervalDays`, dan
 * `nextReviewDate` untuk menghitung jadwal tanpa query tambahan. Isinya hanya
 * berubah saat ada setoran baru, sehingga cache ini praktis selalu hit pada
 * navigasi antar halaman.
 */
export const getCachedStatuses = unstable_cache(
  async (): Promise<CachedStatusRow[]> => {
    return getDb().select().from(memorizationStatus);
  },
  ["memorization-status"],
  { tags: [PROGRESS_TAG], revalidate: 300 },
);
