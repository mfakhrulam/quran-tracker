/**
 * Rate limiter percobaan login.
 *
 * audit F-03: kunci lama mempercayai `x-real-ip` dari klien, sehingga penyerang
 * cukup mengganti header untuk mendapat bucket baru setiap request — rate limit
 * efektifnya nol. Urutan kepercayaan sekarang: header platform (Netlify
 * `x-nf-client-connection-ip`), lalu hop terakhir `x-forwarded-for` (proxy
 * menambahkan hop klien di kanan). Tidak ada header mentah berbasis klien yang
 * dipakai, termasuk `x-real-ip`.
 *
 * Map juga dibatasi (`MAX_KEYS`), karena entri lama sebelumnya hanya hilang saat
 * key yang sama diperiksa lagi — variasi key tak terbatas berarti memori tumbuh
 * permanen.
 *
 * Batasan yang tetap berlaku: store ini in-memory per-instance, jadi pada
 * serverless multi-instance sifatnya best-effort (lihat README). Perubahan ini
 * menutup bypass-nya, bukan persistensinya.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;

/** Header yang diisi platform dan tidak dapat dipalsukan klien. */
const TRUSTED_IP_HEADERS = ["x-nf-client-connection-ip"] as const;

export function getClientKey(req: Request): string {
  for (const header of TRUSTED_IP_HEADERS) {
    const value = req.headers.get(header)?.trim();
    if (value) return value;
  }

  // `x-forwarded-for` diisi proxy: entri paling kanan adalah hop yang dilihat
  // proxy terakhir, entri paling kiri mudah dipalsukan klien.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  // `x-real-ip` sengaja TIDAK dipakai: tidak ada header mentah berbasis klien
  // yang boleh menentukan bucket. Tanpa proxy, semua percobaan berbagi satu
  // bucket "local" — yang justru perilaku benar untuk satu instance dev.
  return "local";
}

const attempts = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number): void {
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}

function ensureCapacity(now: number): void {
  if (attempts.size < MAX_KEYS) return;
  sweep(now);
  if (attempts.size < MAX_KEYS) return;
  // Semua entri masih aktif: buang yang paling cepat kedaluwarsa.
  let oldestKey: string | null = null;
  let oldest = Number.POSITIVE_INFINITY;
  for (const [key, entry] of attempts) {
    if (entry.resetAt < oldest) {
      oldest = entry.resetAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) attempts.delete(oldestKey);
}

export function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return { allowed: true };
  if (now > entry.resetAt) {
    attempts.delete(key);
    return { allowed: true };
  }
  return { allowed: entry.count < MAX_ATTEMPTS };
}

export function recordFailure(key: string): void {
  const now = Date.now();
  ensureCapacity(now);
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/** Untuk test: jumlah bucket yang sedang dilacak. */
export function trackedKeyCount(): number {
  return attempts.size;
}
