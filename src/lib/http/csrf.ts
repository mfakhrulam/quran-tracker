/**
 * Pertahanan CSRF untuk endpoint mutasi.
 *
 * audit F-08: cookie sesi memakai `SameSite=Lax` sehingga request lintas situs
 * tidak membawa sesi — tetapi itu satu-satunya lapisan. Handler menerima body
 * JSON valid walau `Content-Type` adalah `text/plain` (cukup untuk "simple
 * request" tanpa preflight) dan tidak memeriksa `Origin`. Begitu atribut
 * SameSite dilonggarkan, tidak ada lapisan kedua.
 */
import { BAD_JSON_MESSAGE, BodyLimitError, TOO_LARGE_MESSAGE, readJsonBody } from "./body-limit";

export const UNSAFE_CONTENT_TYPE_MESSAGE = "Content-Type harus application/json";
export const CROSS_SITE_MESSAGE = "Permintaan lintas situs ditolak";

export type GuardResult = { ok: true } | { ok: false; status: number; error: string };
export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; error: string };

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Menolak mutasi lintas situs.
 *
 * Perbandingan memakai header `Host` (bukan origin dari `req.url`): di balik
 * server Next, `req.url` tidak selalu membawa origin yang dilihat browser,
 * sehingga membandingkan dengan `req.url` menghasilkan positif palsu pada
 * login biasa — terlihat saat walk-through browser.
 *
 * `Host` + `Origin` tetap aman dipakai berpasangan: browser menetapkan
 * keduanya, dan pada request lintas situs `Host` berisi domain kita sedangkan
 * `Origin` berisi domain penyerang, sehingga keduanya tidak akan cocok.
 *
 * Klien non-browser (curl, test, cron) tidak mengirim `Origin`; ketiadaannya
 * diterima karena tanpa `Origin`/`Sec-Fetch-Site` browser tidak mungkin
 * mengirim cookie sesi lintas situs.
 */
export function checkSameOrigin(req: Request): GuardResult {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { ok: false, status: 403, error: CROSS_SITE_MESSAGE };
  }

  const origin = req.headers.get("origin");
  if (!origin) return { ok: true };

  const expectedHost = (
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  const actualHost = originOf(origin)?.replace(/^https?:\/\//, "").toLowerCase() ?? null;

  // `Origin: null` (sandbox/iframe) tidak punya host: tidak ada alasan sah di app ini.
  if (expectedHost === "" || actualHost === null || actualHost !== expectedHost) {
    return { ok: false, status: 403, error: CROSS_SITE_MESSAGE };
  }
  return { ok: true };
}

/**
 * Endpoint JSON harus menerima `application/json`. Ini yang membuat
 * permintaan lintas situs wajib preflight dan mencegah serangan form biasa.
 */
export function checkJsonContentType(req: Request): GuardResult {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    return { ok: false, status: 415, error: UNSAFE_CONTENT_TYPE_MESSAGE };
  }
  return { ok: true };
}

/** Gabungan guard untuk setiap handler mutasi. Urutan: origin, tipe, lalu body. */
export function guardUnsafeRequest(req: Request): GuardResult {
  const origin = checkSameOrigin(req);
  if (!origin.ok) return origin;
  return checkJsonContentType(req);
}

/**
 * Baca body JSON dengan batas ukuran. Tidak pernah melempar: handler cukup
 * memakai `body.ok` sebelum `schema.safeParse(body.value)`.
 */
export async function readJson(req: Request): Promise<BodyResult> {
  try {
    return { ok: true, value: await readJsonBody(req) };
  } catch (err) {
    if (err instanceof BodyLimitError) {
      return { ok: false, status: 413, error: TOO_LARGE_MESSAGE };
    }
    return { ok: false, status: 400, error: BAD_JSON_MESSAGE };
  }
}

/** Guard + baca body dalam satu langkah, untuk handler mutasi. */
export async function guardAndReadJson(req: Request): Promise<BodyResult> {
  const guard = guardUnsafeRequest(req);
  if (!guard.ok) return guard;
  return readJson(req);
}
