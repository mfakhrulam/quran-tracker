import {
  QUALITY_COLORS,
  QUALITY_LABELS,
  QUALITY_TEXT,
  MEMO_STATUSES,
} from "@/lib/tracker/quality";
import { SURAHS } from "@/lib/mushaf/surahs";

export interface MapPage {
  pageNumber: number;
  juz: number;
  status: string;
  surahStart: number;
}

interface Props {
  pages: MapPage[];
  byStatus: Record<string, number>;
  totalPages: number;
}

function JuzCell({ p }: { p: MapPage }) {
  const fill = QUALITY_COLORS[p.status] ?? QUALITY_COLORS.belum;
  const text = QUALITY_TEXT[p.status] ?? QUALITY_TEXT.belum;
  return (
    <div
      title={`Halaman ${p.pageNumber} · ${QUALITY_LABELS[p.status] ?? p.status}`}
      aria-label={`Halaman ${p.pageNumber}, status ${QUALITY_LABELS[p.status] ?? p.status}`}
      className={`grid aspect-square place-items-center rounded-[6px] text-[10px] font-semibold tnum transition-transform duration-150 hover:scale-[1.14] hover:shadow-md ${fill} ${text}`}
    >
      {p.pageNumber}
    </div>
  );
}

export default function ProgressMap({ pages, byStatus, totalPages }: Props) {
  const juzNumbers = [...new Set(pages.map((p) => p.juz))].sort((a, b) => a - b);
  const memorized = totalPages - (byStatus.belum ?? 0);

  return (
    <div className="space-y-6">
      {/* Legend + counts ------------------------------------------------- */}
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">Keterangan status</h2>
          <p className="text-[12px] font-medium text-ink-faint">
            <span className="tnum font-bold text-ink">{memorized}</span> dari{" "}
            <span className="tnum">{totalPages}</span> halaman tersentuh
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 md:grid-cols-5">
          {MEMO_STATUSES.map((s) => {
            const count = byStatus[s] ?? 0;
            const pctOfTotal = totalPages > 0 ? (count / totalPages) * 100 : 0;
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={`h-4 w-4 shrink-0 rounded-[4px] ${
                    QUALITY_COLORS[s] ?? QUALITY_COLORS.belum
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold leading-tight text-ink">
                    {QUALITY_LABELS[s] ?? s}
                  </p>
                  <p className="text-[11px] leading-tight text-ink-faint">
                    <span className="tnum font-semibold">{count}</span> hal
                    {s !== "belum" && (
                      <span className="tnum"> · {pctOfTotal.toFixed(1)}%</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Juz grid -------------------------------------------------------- */}
      <div className="space-y-3">
        {juzNumbers.map((juz) => {
          const items = pages.filter((p) => p.juz === juz);
          const done = items.filter((p) => p.status !== "belum").length;
          const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

          return (
            <section key={juz} className="card-flush overflow-hidden">
              <header className="flex items-center gap-3 border-b border-line bg-sunken px-4 py-2.5">
                <h2 className="text-[13px] font-bold text-ink">Juz {juz}</h2>
                <span className="text-[11px] font-medium text-ink-faint">
                  {items[0] ? SURAHS[items[0].surahStart - 1]?.latin : ""}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <div
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-line"
                    role="img"
                    aria-label={`${pct}% juz ${juz} sudah dihafal`}
                  >
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tnum w-14 text-right text-[11.5px] font-semibold text-ink-soft">
                    {done}/{items.length}
                  </span>
                </div>
              </header>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-1.5 p-3">
                {items.map((p) => (
                  <JuzCell key={p.pageNumber} p={p} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="pb-2 text-center text-[12px] text-ink-faint">
        Setiap kotak adalah satu halaman mushaf. Arahkan kursor untuk melihat status.
      </p>
    </div>
  );
}
