"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  { value: "sabaq", label: "Sabaq (baru)" },
  { value: "sabqi", label: "Sabqi (ulangan baru)" },
  { value: "manzil", label: "Manzil (murajaah lama)" },
];
const QUALITIES = [
  { value: "baru", label: "Baru" },
  { value: "lancar", label: "Lancar" },
  { value: "mutqin", label: "Mutqin" },
  { value: "lemah", label: "Lemah" },
];

export default function SessionForm({ today, surahs }: { today: string; surahs: { number: number; latin: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = {
      date: data.get("date"),
      pageNumber: Number(data.get("pageNumber")),
      type: data.get("type"),
      quality: data.get("quality"),
    };
    const ayahStart = data.get("ayahStart");
    const ayahEnd = data.get("ayahEnd");
    if (ayahStart) body.ayahStart = Number(ayahStart);
    if (ayahEnd) body.ayahEnd = Number(ayahEnd);
    const note = data.get("mistakesNote");
    if (note) body.mistakesNote = note;

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }
    setMessage("Tersimpan. Siap input berikutnya.");
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Tanggal
          <input name="date" type="date" defaultValue={today} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Halaman (1-604)
          <input name="pageNumber" type="number" min={1} max={604} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Jenis
          <select name="type" defaultValue="sabaq" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Kualitas
          <select name="quality" defaultValue="lancar" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
            {QUALITIES.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Ayat awal (opsional)
          <input name="ayahStart" type="number" min={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          Ayat akhir (opsional)
          <input name="ayahEnd" type="number" min={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">
        Catatan kesalahan (opsional)
        <textarea name="mistakesNote" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      <button disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
        {loading ? "Menyimpan..." : "Simpan setoran"}
      </button>
      <p className="text-xs text-neutral-500">
        Contoh surah: {surahs.slice(0, 3).map((s) => `${s.number}. ${s.latin}`).join(", ")} ...
      </p>
    </form>
  );
}
