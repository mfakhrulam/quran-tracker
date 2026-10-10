"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function update(row: SessionRow, patch: Partial<SessionRow>) {
    setError("");
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
    if (!res.ok) setError("Gagal menyimpan perubahan");
    else router.refresh();
  }

  async function remove(id: number) {
    if (!window.confirm("Hapus setoran ini?")) return;
    setError("");
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  if (sessions.length === 0) return <p className="text-sm text-neutral-600">Belum ada riwayat.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="w-24 text-neutral-600">{s.date}</span>
            <span className="w-16">Hal. {s.pageNumber}</span>
            <select defaultValue={s.type} onChange={(e) => update(s, { type: e.target.value })} className="rounded border border-neutral-300 px-2 py-1">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select defaultValue={s.quality} onChange={(e) => update(s, { quality: e.target.value })} className="rounded border border-neutral-300 px-2 py-1">
              {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
            {s.ayahStart && s.ayahEnd && <span className="text-neutral-500">ayat {s.ayahStart}-{s.ayahEnd}</span>}
            <button onClick={() => remove(s.id)} className="ml-auto rounded border border-red-300 px-2 py-1 text-red-600">Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
