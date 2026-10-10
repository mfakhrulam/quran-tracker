import { eq } from "drizzle-orm";
import { restDays } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { restDayInput } from "@/lib/tracker/validation";

export async function createRestDayHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = restDayInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(restDays).where(eq(restDays.date, parsed.data.date));
  if (existing.length > 0) return Response.json({ restDay: existing[0] }, { status: 201 });

  const inserted = await db
    .insert(restDays)
    .values({ date: parsed.data.date, reason: parsed.data.reason ?? null })
    .returning();
  return Response.json({ restDay: inserted[0] }, { status: 201 });
}

export async function deleteRestDayHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = restDayInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  await getDb().delete(restDays).where(eq(restDays.date, parsed.data.date));
  return Response.json({ ok: true });
}
