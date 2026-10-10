"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GoalForm({ today }: { today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const deadline = data.get("deadline");
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: data.get("type"),
        targetPages: Number(data.get("targetPages")),
        startDate: data.get("startDate"),
        deadline: deadline ? String(deadline) : null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 rounded-xl bg-white p-5 shadow sm:grid-cols-2">
      <label className="text-sm">
        Jenis target
        <select name="type" defaultValue="khatam" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
          <option value="khatam">Khatam</option>
          <option value="harian">Harian</option>
        </select>
      </label>
      <label className="text-sm">
        Target halaman
        <input name="targetPages" type="number" min={1} max={604} defaultValue={604} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      <label className="text-sm">
        Mulai
        <input name="startDate" type="date" defaultValue={today} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      <label className="text-sm">
        Tenggat (opsional)
        <input name="deadline" type="date" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? "Menyimpan..." : "Simpan target"}
        </button>
      </div>
    </form>
  );
}
