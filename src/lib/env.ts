import { z } from "zod";

/**
 * audit F-11: `SESSION_SECRET` dulu wajib 32+ karakter tetapi tidak pernah
 * dibaca — sesi memakai token acak yang di-hash SHA-256 di tabel `sessions`,
 * bukan cookie bertanda tangan. Konfigurasi mati seperti itu menyesatkan
 * operator (mengira ada signed cookie, mengira rotasi secret berpengaruh),
 * jadi key-nya dihapus dari schema.
 *
 * Bila suatu saat sesi dipindah ke cookie stateless/HMAC, tambahkan kembali di
 * sini dan benar-benar pakai nilainya di `src/lib/auth/session.ts`.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  OWNER_USERNAME: z.string().min(1).optional(),
  OWNER_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Env tidak valid: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  return parsed.data;
}
