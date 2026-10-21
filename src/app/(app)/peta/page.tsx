import { pages, memorizationStatus } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { computeProgress } from "@/lib/tracker/progress";
import ProgressMap from "@/components/ProgressMap";

export default async function PetaPage() {
  const db = getDb();
  const [allPages, statuses, progress] = await Promise.all([
    db.select().from(pages).orderBy(pages.pageNumber),
    db.select().from(memorizationStatus),
    computeProgress(db),
  ]);
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const data = allPages.map((p) => ({
    pageNumber: p.pageNumber,
    juz: p.juz,
    surahStart: p.surahStart,
    status: statusByPage.get(p.pageNumber) ?? "belum",
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Peta hafalan
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          604 halaman mushaf Madinah, dikelompokkan per juz.
        </p>
      </div>
      <ProgressMap pages={data} byStatus={progress.byStatus} totalPages={progress.totalPages} />
    </div>
  );
}
