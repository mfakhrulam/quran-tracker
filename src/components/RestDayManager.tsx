"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RestDayManager({ today, restDays }: { today: string; restDays: { id: number; date: string; reason: string | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/rest-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.get("date"), reason: data.get("reason") || undefined }),
    });
    if (!res.ok) setError("Gagal menambah hari libur");
    else { form.reset(); router.refresh(); }
  }

  async function remove(date: string) {
    setError("");
    const res = await fetch("/api/rest-days", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) setError("Gagal menghapus");
    else router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-5 shadow">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Tanggal libur
          <input name="date" type="date" defaultValue={today} required className="mt-1 rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Alasan (opsional)
          <input name="reason" className="mt-1 rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button className="rounded bg-emerald-600 px-4 py-2 text-white">Tambah</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-neutral-200 text-sm">
        {restDays.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="w-28">{r.date}</span>
            <span className="text-neutral-500">{r.reason ?? "-"}</span>
            <button onClick={() => remove(r.date)} className="ml-auto rounded border border-red-300 px-2 py-1 text-red-600">Hapus</button>
          </li>
        ))}
        {restDays.length === 0 && <li className="py-2 text-neutral-500">Belum ada hari libur.</li>}
      </ul>
    </div>
  );
}
