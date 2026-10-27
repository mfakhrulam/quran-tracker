import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, getClientKey, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";
import { guardAndReadJson } from "@/lib/http/csrf";

const bodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function loginHandler(req: Request): Promise<Response> {
  const ip = getClientKey(req);
  if (!checkRateLimit(ip).allowed) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }
  const body = await guardAndReadJson(req);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const found = await db.select().from(users).where(eq(users.username, parsed.data.username));
  const user = found[0];
  const hashToVerify = user ? user.passwordHash : await getDummyHash();
  const ok = await verifyPassword(hashToVerify, parsed.data.password);
  if (!user || !ok) {
    recordFailure(ip);
    return Response.json({ error: "Username atau password salah" }, { status: 401 });
  }
  resetRateLimit(ip);
  const { token, expiresAt } = await createSession(db, user.id);
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Set-Cookie": cookie, "Content-Type": "application/json" } });
}
