import { eq } from "drizzle-orm";
import { sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { findPage } from "@/lib/mushaf/pages";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { todayISO } from "@/lib/tracker/date";
import { sessionLogInput } from "@/lib/tracker/validation";
import { checkAyahRange } from "../handler";

export async function updateSessionLogHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const parsed = sessionLogInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  if (data.date > todayISO()) return Response.json({ error: "Tanggal tidak boleh di masa depan" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(sessionsLog).where(eq(sessionsLog.id, id));
  if (existing.length === 0) return Response.json({ error: "Log tidak ditemukan" }, { status: 404 });

  const page = findPage(data.pageNumber);
  if (!page) return Response.json({ error: "Halaman tidak ditemukan" }, { status: 400 });

  const ayahError = checkAyahRange(data, page);
  if (ayahError) return Response.json({ error: ayahError }, { status: 400 });

  const set: Record<string, unknown> = {
    date: data.date,
    pageNumber: data.pageNumber,
    type: data.type,
    quality: data.quality,
    ayahStart: data.ayahStart ?? null,
    ayahEnd: data.ayahEnd ?? null,
    mistakesNote: data.mistakesNote ?? null,
  };
  if (data.durationMin !== undefined) set.durationMin = data.durationMin;

  const updated = await db.update(sessionsLog).set(set).where(eq(sessionsLog.id, id)).returning();

  await recomputeMemorizationStatus(db);
  return Response.json({ session: updated[0] });
}

export async function deleteSessionLogHandler(req: Request, id: number): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "ID tidak valid" }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(sessionsLog).where(eq(sessionsLog.id, id));
  if (existing.length === 0) return Response.json({ error: "Log tidak ditemukan" }, { status: 404 });

  await db.delete(sessionsLog).where(eq(sessionsLog.id, id));
  await recomputeMemorizationStatus(db);
  return Response.json({ ok: true });
}
