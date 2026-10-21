"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, Plus, Trash, X, Check } from "@phosphor-icons/react";
import { formatDateShortID } from "@/lib/tracker/date";

export default function RestDayManager({
  today,
  restDays,
}: {
  today: string;
  restDays: { id: number; date: string; reason: string | null }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/rest-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.get("date"), reason: data.get("reason") || undefined }),
    });
    setLoading(false);
    if (!res.ok) setError("Gagal menambah hari libur");
    else {
      form.reset();
      router.refresh();
    }
  }

  async function remove(date: string) {
    setError("");
    setLoading(true);
    const res = await fetch("/api/rest-days", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setLoading(false);
    setPendingDelete(null);
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold text-ink">Hari libur</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Hari libur tidak dihitung sebagai hari efektif, jadi pace dan proyeksi tetap adil.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-line bg-sunken px-5 py-4">
        <div className="field min-w-[150px] flex-1">
          <label htmlFor="rest-date" className="field-label">
            Tanggal
          </label>
          <input id="rest-date" name="date" type="date" defaultValue={today} required className="input" />
        </div>
        <div className="field min-w-[160px] flex-[2]">
          <label htmlFor="rest-reason" className="field-label">
            Alasan <span className="font-normal text-ink-faint">(opsional)</span>
          </label>
          <input
            id="rest-reason"
            name="reason"
            placeholder="Sakit, safar, ujian"
            className="input"
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary shrink-0">
          <Plus size={16} weight="bold" />
          Tambah
        </button>
      </form>

      {error && (
        <p role="alert" className="border-b border-line bg-[#fdf0ee] px-5 py-2.5 text-[13px] font-medium text-[#8f2f26]">
          {error}
        </p>
      )}

      {restDays.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CalendarBlank size={22} className="mx-auto text-ink-faint" />
          <p className="mt-2 text-[13px] font-medium text-ink-soft">Belum ada hari libur ditandai.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {restDays.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-sunken text-ink-faint">
                <CalendarBlank size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">{formatDateShortID(r.date)}</p>
                <p className="truncate text-[12px] text-ink-faint">{r.reason ?? "Tanpa alasan"}</p>
              </div>

              {pendingDelete === r.date ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => remove(r.date)}
                    disabled={loading}
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
                  onClick={() => setPendingDelete(r.date)}
                  aria-label={`Hapus hari libur ${r.date}`}
                  className="btn btn-ghost h-8 w-8 p-0 text-ink-faint hover:text-[#a4342b]"
                >
                  <Trash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
