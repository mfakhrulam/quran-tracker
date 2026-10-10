import { and, eq } from "drizzle-orm";
import { pages, sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { sessionLogInput } from "@/lib/tracker/validation";

export async function listSessionsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const pageNumber = url.searchParams.get("pageNumber");

  const conditions = [];
  if (date) conditions.push(eq(sessionsLog.date, date));
  if (pageNumber) conditions.push(eq(sessionsLog.pageNumber, Number(pageNumber)));

  const db = getDb();
  const rows = await db
    .select()
    .from(sessionsLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sessionsLog.date, sessionsLog.id);
  return Response.json({ sessions: rows });
}

export async function createSessionLogHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const parsed = sessionLogInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const data = parsed.data;

  const db = getDb();
  const page = await db.select().from(pages).where(eq(pages.pageNumber, data.pageNumber));
  if (page.length === 0) return Response.json({ error: "Halaman tidak ditemukan" }, { status: 400 });

  const inserted = await db
    .insert(sessionsLog)
    .values({
      date: data.date,
      pageNumber: data.pageNumber,
      type: data.type,
      quality: data.quality,
      ayahStart: data.ayahStart ?? null,
      ayahEnd: data.ayahEnd ?? null,
      mistakesNote: data.mistakesNote ?? null,
      durationMin: data.durationMin ?? null,
    })
    .returning();

  await recomputeMemorizationStatus(db);
  return Response.json({ session: inserted[0] }, { status: 201 });
}
