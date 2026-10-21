import SessionForm from "@/components/SessionForm";
import { SURAHS } from "@/lib/mushaf/surahs";
import { pages } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { todayISO } from "@/lib/tracker/date";

export default async function CatatPage() {
  const allPages = await getDb()
    .select({ pageNumber: pages.pageNumber, juz: pages.juz, surahStart: pages.surahStart })
    .from(pages)
    .orderBy(pages.pageNumber);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Catat setoran
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Satu setoran per halaman. Simpan, lalu lanjut ke halaman berikutnya.
        </p>
      </div>
      <SessionForm
        today={todayISO()}
        surahs={SURAHS.map((s) => ({ number: s.number, latin: s.latin, arabic: s.arabic }))}
        pages={allPages}
      />
    </div>
  );
}
