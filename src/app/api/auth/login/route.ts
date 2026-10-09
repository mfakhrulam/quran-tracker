import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";

const bodySchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function loginHandler(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkRateLimit(ip).allowed) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const found = await db.select().from(users).where(eq(users.username, parsed.data.username));
  const user = found[0];
  const ok = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;
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

export const POST = loginHandler;
