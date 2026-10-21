"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash, WarningCircle, NotePencil, X } from "@phosphor-icons/react";
import {
  QUALITY_COLORS,
  QUALITY_LABELS,
  QUALITY_TEXT,
  SESSION_TYPE_LABELS,
} from "@/lib/tracker/quality";
import { formatDateID } from "@/lib/tracker/date";

export interface SessionRow {
  id: number;
  date: string;
  pageNumber: number;
  type: string;
  quality: string;
  ayahStart: number | null;
  ayahEnd: number | null;
  mistakesNote: string | null;
}

const TYPES = ["sabaq", "sabqi", "manzil"];
const QUALITIES = ["baru", "lancar", "mutqin", "lemah"];

function groupByDate(rows: SessionRow[]): { date: string; items: SessionRow[] }[] {
  const map = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

export default function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"semua" | "sabaq" | "sabqi" | "manzil">("semua");

  const groups = useMemo(() => {
    const filtered = filter === "semua" ? sessions : sessions.filter((s) => s.type === filter);
    return groupByDate(filtered);
  }, [sessions, filter]);

  async function update(row: SessionRow, patch: Partial<SessionRow>) {
    setError("");
    setSavingId(row.id);
    const res = await fetch(`/api/sessions/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: row.date,
        pageNumber: row.pageNumber,
        type: patch.type ?? row.type,
        quality: patch.quality ?? row.quality,
        ayahStart: row.ayahStart ?? undefined,
        ayahEnd: row.ayahEnd ?? undefined,
        mistakesNote: row.mistakesNote ?? undefined,
      }),
    });
    setSavingId(null);
    if (!res.ok) setError("Gagal menyimpan perubahan");
    else router.refresh();
  }

  async function remove(id: number) {
    setError("");
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  if (sessions.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-ink">Belum ada setoran tercatat</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
          Setiap setoran yang kamu simpan akan muncul di sini, lengkap dengan jenis dan
          kualitasnya.
        </p>
        <a href="/catat" className="btn btn-primary mt-5">
          Catat setoran pertama
        </a>
      </div>
    );
  }

  const filters = [
    { value: "semua" as const, label: "Semua" },
    { value: "sabaq" as const, label: "Sabaq" },
    { value: "sabqi" as const, label: "Sabqi" },
    { value: "manzil" as const, label: "Manzil" },
  ];

  return (
    <div className="space-y-5">
      {/* Filters --------------------------------------------------------- */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {filters.map((f) => {
          const active = filter === f.value;
          const count =
            f.value === "semua" ? sessions.length : sessions.filter((s) => s.type === f.value).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={[
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                active
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-line-strong bg-surface text-ink-soft hover:bg-sunken hover:text-ink",
              ].join(" ")}
            >
              {f.label}
              <span className={`ml-1.5 tnum ${active ? "text-white/70" : "text-ink-faint"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[10px] bg-[#fdf0ee] px-3.5 py-3 text-[13px] font-medium text-[#8f2f26]"
        >
          <WarningCircle size={16} weight="fill" className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {groups.length === 0 && (
        <p className="card px-6 py-10 text-center text-[13px] text-ink-soft">
          Tidak ada setoran dengan jenis ini.
        </p>
      )}

      {/* Groups ---------------------------------------------------------- */}
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.date}>
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-bold text-ink">{formatDateID(group.date)}</h2>
              <span className="text-[12px] font-medium text-ink-faint">
                {group.items.length} setoran
              </span>
            </div>

            <ul className="card-flush divide-y divide-line overflow-hidden">
              {group.items.map((s) => (
                <li key={s.id} className="group/row px-3 py-3 sm:px-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold tnum ${
                        QUALITY_COLORS[s.quality] ?? QUALITY_COLORS.belum
                      } ${QUALITY_TEXT[s.quality] ?? QUALITY_TEXT.belum}`}
                    >
                      {s.pageNumber}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                        Halaman {s.pageNumber}
                        {savingId === s.id && (
                          <span className="text-[11px] font-medium text-ink-faint">menyimpan...</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-faint">
                        {SESSION_TYPE_LABELS[s.type] ?? s.type}
                        {s.ayahStart && s.ayahEnd ? ` · ayat ${s.ayahStart}-${s.ayahEnd}` : ""}
                        {s.mistakesNote ? ` · ${s.mistakesNote}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="hidden items-center gap-1.5 sm:flex">
                        <select
                          aria-label={`Jenis setoran halaman ${s.pageNumber}`}
                          value={s.type}
                          onChange={(e) => update(s, { type: e.target.value })}
                          className="input w-auto py-1.5 pl-2 pr-7 text-[12px] font-medium"
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {SESSION_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Kualitas halaman ${s.pageNumber}`}
                          value={s.quality}
                          onChange={(e) => update(s, { quality: e.target.value })}
                          className="input w-auto py-1.5 pl-2 pr-7 text-[12px] font-medium"
                        >
                          {QUALITIES.map((q) => (
                            <option key={q} value={q}>
                              {QUALITY_LABELS[q]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {pendingDelete === s.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            className="btn btn-danger h-8 px-2 text-[12px]"
                          >
                            <Check size={14} weight="bold" />
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            aria-label="Batal hapus"
                            className="btn btn-ghost h-8 w-8 p-0"
                          >
                            <X size={14} weight="bold" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(s.id)}
                          aria-label={`Hapus setoran halaman ${s.pageNumber}`}
                          className="btn btn-ghost h-8 w-8 p-0 text-ink-faint hover:text-[#a4342b]"
                        >
                          <Trash size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile-only type/quality editors */}
                  <div className="mt-2 flex items-center gap-1.5 pl-13 sm:hidden">
                    <select
                      aria-label={`Jenis setoran halaman ${s.pageNumber}`}
                      value={s.type}
                      onChange={(e) => update(s, { type: e.target.value })}
                      className="input w-auto py-1 pl-2 pr-7 text-[12px] font-medium"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SESSION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Kualitas halaman ${s.pageNumber}`}
                      value={s.quality}
                      onChange={(e) => update(s, { quality: e.target.value })}
                      className="input w-auto py-1 pl-2 pr-7 text-[12px] font-medium"
                    >
                      {QUALITIES.map((q) => (
                        <option key={q} value={q}>
                          {QUALITY_LABELS[q]}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[12px] text-ink-faint">
        <NotePencil size={13} />
        Jenis dan kualitas bisa diubah langsung dari daftar ini.
      </p>
    </div>
  );
}
