import pagesData from "@/data/pages.json";

export interface MushafPage {
  pageNumber: number;
  juz: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

/**
 * Metadata 604 halaman mushaf Madinah, dibundel saat build dari
 * `src/data/pages.json` (hasil `pnpm mushaf:fetch`).
 *
 * Data ini tidak pernah berubah setelah seed, jadi tidak perlu diambil dari
 * Turso. Membacanya dari DB berarti satu round-trip HTTP lintas region pada
 * setiap page load hanya untuk 604 baris konstan.
 */
export const MUSHAF_PAGES = pagesData as MushafPage[];

const BY_PAGE_NUMBER = new Map(MUSHAF_PAGES.map((p) => [p.pageNumber, p]));

export function findPage(pageNumber: number): MushafPage | undefined {
  return BY_PAGE_NUMBER.get(pageNumber);
}

export interface PageLite {
  pageNumber: number;
  juz: number;
}

/** Proyeksi ringan untuk perhitungan progres (tanpa surah/ayat). */
export const PAGE_LITES: PageLite[] = MUSHAF_PAGES.map((p) => ({
  pageNumber: p.pageNumber,
  juz: p.juz,
}));
