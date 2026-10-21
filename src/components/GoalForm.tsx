"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Target, WarningCircle } from "@phosphor-icons/react";

export default function GoalForm({ today }: { today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"khatam" | "harian">("khatam");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const deadline = data.get("deadline");
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
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
    setMessage("Target baru tersimpan dan langsung aktif.");
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-[15px] font-bold text-ink">Buat target baru</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Target khatam baru akan menggantikan target khatam yang sedang aktif.
        </p>
      </div>

      <fieldset>
        <legend className="field-label">Jenis target</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(
            [
              { value: "khatam", label: "Khatam", hint: "Sampai 604 halaman" },
              { value: "harian", label: "Harian", hint: "Rutin per hari" },
            ] as const
          ).map((t) => {
            const active = type === t.value;
            return (
              <label
                key={t.value}
                className={[
                  "cursor-pointer rounded-[10px] border px-3 py-2.5 text-center transition-colors",
                  active
                    ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                    : "border-line-strong bg-surface hover:bg-sunken",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  checked={active}
                  onChange={() => setType(t.value)}
                  className="sr-only"
                />
                <span
                  className={`block text-[13px] font-bold ${active ? "text-brand-800" : "text-ink"}`}
                >
                  {t.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-faint">{t.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="targetPages" className="field-label">
            Target halaman
          </label>
          <input
            id="targetPages"
            name="targetPages"
            type="number"
            min={1}
            max={604}
            defaultValue={604}
            required
            className="input tnum"
          />
        </div>
        <div className="field">
          <label htmlFor="startDate" className="field-label">
            Mulai
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={today}
            required
            className="input"
          />
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="deadline" className="field-label">
            Tenggat <span className="font-normal text-ink-faint">(opsional)</span>
          </label>
          <input id="deadline" name="deadline" type="date" min={today} className="input" />
          <p className="field-hint">
            Tanpa tenggat, aplikasi tetap menghitung pace tapi tidak bisa menilai on-track.
          </p>
        </div>
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
      {message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[10px] bg-brand-50 px-3.5 py-3 text-[13px] font-medium text-brand-800"
        >
          <CheckCircle size={16} weight="fill" className="mt-px shrink-0" />
          {message}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full sm:w-auto">
        <Target size={16} weight="bold" />
        {loading ? "Menyimpan..." : "Simpan target"}
      </button>
    </form>
  );
}
