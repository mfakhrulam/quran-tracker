import { QUALITY_COLORS, MEMO_STATUSES } from "@/lib/tracker/quality";

export interface MapPage {
  pageNumber: number;
  juz: number;
  surahStart: number;
  status: string;
}

export default function ProgressMap({ pages }: { pages: MapPage[] }) {
  const juzNumbers = [...new Set(pages.map((p) => p.juz))].sort((a, b) => a - b);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-xs">
        {MEMO_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${QUALITY_COLORS[s]}`} /> {s}
          </span>
        ))}
      </div>
      {juzNumbers.map((juz) => (
        <section key={juz}>
          <h2 className="mb-2 text-sm font-medium text-neutral-600">Juz {juz}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-1">
            {pages.filter((p) => p.juz === juz).map((p) => (
              <div
                key={p.pageNumber}
                title={`Hal. ${p.pageNumber} — ${p.status}`}
                className={`flex h-7 items-center justify-center rounded text-[10px] text-neutral-800 ${QUALITY_COLORS[p.status] ?? QUALITY_COLORS.belum}`}
              >
                {p.pageNumber}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
