import { desc } from "drizzle-orm";
import { sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import SessionList from "@/components/SessionList";
import { computeStreak, todayISO } from "@/lib/tracker/date";
import { restDays } from "@/db/schema";

export default async function RiwayatPage() {
  const db = getDb();
  const [rows, rest] = await Promise.all([
    db.select().from(sessionsLog).orderBy(desc(sessionsLog.date), desc(sessionsLog.id)),
    db.select().from(restDays),
  ]);

  const streak = computeStreak(
    rows.map((r) => r.date),
    todayISO(),
    rest.map((r) => r.date),
  );
  const pagesCovered = new Set(rows.map((r) => r.pageNumber)).size;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">Riwayat</h1>
          <p className="mt-1 text-sm text-ink-soft">Semua setoran, terbaru di atas.</p>
        </div>
        <dl className="flex gap-5">
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Total setoran</dt>
            <dd className="tnum text-[19px] font-bold leading-tight text-ink">{rows.length}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Halaman unik</dt>
            <dd className="tnum text-[19px] font-bold leading-tight text-ink">{pagesCovered}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-ink-faint">Beruntun</dt>
            <dd className="tnum text-[19px] font-bold leading-tight text-brand-700">{streak}</dd>
          </div>
        </dl>
      </div>

      <SessionList sessions={rows} />
    </div>
  );
}
