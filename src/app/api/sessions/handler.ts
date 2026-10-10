import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pages, sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { todayISO, isValidISODate } from "@/lib/tracker/date";
import { sessionLogInput } from "@/lib/tracker/validation";

const listQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidISODate)
    .optional(),
  pageNumber: z.coerce.number().int().min(1).max(604).optional(),
});

export async function listSessionsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = listQuery.safeParse({
    date: url.searchParams.get("date") ?? undefined,
    pageNumber: url.searchParams.get("pageNumber") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { date, pageNumber } = parsed.data;

  const conditions = [];
  if (date) conditions.push(eq(sessionsLog.date, date));
  if (pageNumber) conditions.push(eq(sessionsLog.pageNumber, pageNumber));

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

  if (data.date > todayISO()) return Response.json({ error: "Tanggal tidak boleh di masa depan" }, { status: 400 });

  const db = getDb();
  const page = await db.select().from(pages).where(eq(pages.pageNumber, data.pageNumber));
  if (page.length === 0) return Response.json({ error: "Halaman tidak ditemukan" }, { status: 400 });

  const ayahError = checkAyahRange(data, page[0]);
  if (ayahError) return Response.json({ error: ayahError }, { status: 400 });

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

export function checkAyahRange(
  data: { ayahStart?: number; ayahEnd?: number },
  page: { ayahStart: number; ayahEnd: number },
): string | null {
  if (data.ayahStart !== undefined && (data.ayahStart < page.ayahStart || data.ayahStart > page.ayahEnd)) {
    return "Rentang ayat di luar halaman";
  }
  if (data.ayahEnd !== undefined && (data.ayahEnd < page.ayahStart || data.ayahEnd > page.ayahEnd)) {
    return "Rentang ayat di luar halaman";
  }
  return null;
}
