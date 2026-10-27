import { inArray } from "drizzle-orm";
import { memorizationStatus, sessionsLog, settings as settingsTable } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { guardAndReadJson } from "@/lib/http/csrf";
import { findPage } from "@/lib/mushaf/pages";
import { parseSettings } from "@/lib/settings";
import { recomputeMemorizationStatus } from "@/lib/tracker/derive-status";
import { daysBetween, todayISO } from "@/lib/tracker/date";
import type { Quality, SessionType } from "@/lib/tracker/quality";
import { itemsWithinLimit, murajaahCompleteInput } from "@/lib/tracker/validation";

/**
 * Mencatat murajaah untuk satu atau banyak halaman sekaligus.
 *
 * Jenis log (`sabqi`/`manzil`) ditentukan server dari umur hafalan, bukan dari
 * klien: klien hanya memilih halaman dan kualitas, sehingga tidak mungkin
 * mencatat "manzil" untuk hafalan yang baru kemarin.
 */
export async function completeMurajaahHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const body = await guardAndReadJson(req);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  // Tolak panjang array sebelum Zod menyentuh elemen (audit F-02).
  const rawItems = (body.value as { items?: unknown } | null)?.items;
  if (!itemsWithinLimit(rawItems)) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }
  const parsed = murajaahCompleteInput.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { date } = parsed.data;

  if (date > todayISO()) {
    return Response.json({ error: "Tanggal tidak boleh di masa depan" }, { status: 400 });
  }

  // Dedupe: satu halaman hanya dicatat sekali per request, kualitas terakhir menang.
  const qualities = new Map<number, Quality>();
  for (const item of parsed.data.items) qualities.set(item.pageNumber, item.quality);
  const pageNumbers = [...qualities.keys()];

  // Halaman di luar 1-604 ditolak tanpa menyentuh DB sama sekali.
  if (pageNumbers.some((pageNumber) => !findPage(pageNumber))) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const db = getDb();
  // Satu round-trip: settings + status halaman yang diminta.
  const [settingRows, statuses] = await db.batch([
    db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable),
    db
      .select()
      .from(memorizationStatus)
      .where(inArray(memorizationStatus.pageNumber, pageNumbers)),
  ]);

  const settings = parseSettings(settingRows);
  const known = new Set(statuses.map((s) => s.pageNumber));
  const unknown = pageNumbers.filter((p) => !known.has(p));
  if (unknown.length > 0) {
    return Response.json({ error: `Halaman ${unknown.join(", ")} belum dihafal` }, { status: 400 });
  }

  const rows = statuses.map((status) => {
    const memorizedAt = status.memorizedAt ? todayISO(status.memorizedAt) : date;
    const type: SessionType =
      daysBetween(memorizedAt, date) < settings.sabqiWindowDays ? "sabqi" : "manzil";
    return {
      date,
      pageNumber: status.pageNumber,
      type,
      quality: qualities.get(status.pageNumber)!,
    };
  });

  await db.insert(sessionsLog).values(rows);
  await recomputeMemorizationStatus(db);

  return Response.json(
    {
      created: rows.length,
      items: rows.map((row) => ({ pageNumber: row.pageNumber, type: row.type })),
    },
    { status: 201 },
  );
}
