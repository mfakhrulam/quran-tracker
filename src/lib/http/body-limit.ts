/**
 * Lapisan pertahanan permintaan, dipakai oleh semua handler API.
 *
 * audit F-01/F-02: `req.json()` membaca seluruh body ke memori tanpa batas,
 * dan Zod memvalidasi semua elemen array sebelum `.max()` dievaluasi. Keduanya
 * memungkinkan satu request murah menghabiskan memori instance serverless.
 * Cek murah di sini menolak payload sebelum parsing.
 */

/** Batas ukuran body (bytes). Semua endpoint JSON app ini jauh di bawah ini. */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Menolak body yang terlalu besar sebelum dibaca. `Content-Length` adalah
 * pernyataan klien, jadi ini bukan satu-satunya lapisan — `readJsonBody`
 * membatasi jumlah byte yang benar-benar dibaca.
 */
export function bodyTooLarge(req: Request): boolean {
  const len = Number(req.headers.get("content-length") ?? "");
  return Number.isFinite(len) && len > MAX_BODY_BYTES;
}

export class BodyLimitError extends Error {}

/**
 * Membaca JSON dengan batas byte. Setelah header `err` `Request.json()` tidak
 * bisa dibaca dua kali, jadi semua handler memakai helper ini.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  if (bodyTooLarge(req)) throw new BodyLimitError();
  if (req.body === null) throw new SyntaxError("body kosong");
  // `Content-Length` 0/1 atau transfer-encoding chunked: baca dengan counter.
  let bytes = 0;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new BodyLimitError();
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const text = new TextDecoder().decode(concat(chunks));
  return JSON.parse(text);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export const TOO_LARGE_MESSAGE = "Permintaan terlalu besar";
export const BAD_JSON_MESSAGE = "Data tidak valid";
