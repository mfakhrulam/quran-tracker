import { getDb } from "@/lib/auth/db";
import { loadDailyTasks } from "@/lib/tracker/daily";
import { todayISO } from "@/lib/tracker/date";
import { findPage } from "@/lib/mushaf/pages";
import { SURAHS } from "@/lib/mushaf/surahs";
import MurajaahBoard, { type PageMeta } from "@/components/MurajaahBoard";

export default async function MurajaahPage() {
  const today = todayISO();
  const { plan, settings } = await loadDailyTasks(getDb(), today);

  const pageNumbers = [
    ...new Set([...plan.sabqi, ...plan.manzil, ...plan.done].map((t) => t.pageNumber)),
  ];

  // Metadata mushaf dibaca dari katalog statis, bukan tabel `pages`: query itu
  // yang termahal (~300ms) untuk data 604 baris yang tidak pernah berubah.
  const pageMeta: Record<number, PageMeta> = {};
  for (const pageNumber of pageNumbers) {
    const page = findPage(pageNumber);
    if (!page) continue;
    pageMeta[pageNumber] = {
      surah: SURAHS[page.surahStart - 1]?.latin ?? `Surah ${page.surahStart}`,
      juz: page.juz,
    };
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Murajaah
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Halaman yang perlu diulang hari ini, diurutkan dari yang paling rapuh.
        </p>
      </div>

      <MurajaahBoard today={today} plan={plan} labels={settings.labels} pageMeta={pageMeta} />
    </div>
  );
}
