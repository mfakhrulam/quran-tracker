import { MUSHAF_PAGES } from "@/lib/mushaf/pages";
import { getCachedStatuses } from "@/lib/tracker/progress-cache";
import { summarizeProgress } from "@/lib/tracker/progress";
import ProgressMap from "@/components/ProgressMap";

export default async function PetaPage() {
  // `pages` dari modul statis + status dari cache ber-tag = nol round-trip ke
  // Turso untuk metadata mushaf. Versi lama mengambil `pages` dan
  // `memorization_status` dua kali (langsung + lewat computeProgress).
  const statuses = await getCachedStatuses();
  const progress = summarizeProgress(MUSHAF_PAGES, statuses);
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const data = MUSHAF_PAGES.map((p) => ({
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
