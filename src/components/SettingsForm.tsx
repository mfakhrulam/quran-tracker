"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, SlidersHorizontal, WarningCircle } from "@phosphor-icons/react";
import { SETTINGS_LIMITS, type AppSettings } from "@/lib/settings";

interface Props {
  settings: AppSettings;
  manzilTotal: number;
  memorizedPages: number;
}

const NUMERIC_FIELDS = [
  {
    key: "sabqiWindowDays" as const,
    label: "Jendela sabqi",
    unit: "hari",
    hint: "Hafalan yang lebih muda dari ini diulang lewat jalur sabqi (interval).",
  },
  {
    key: "manzilCycleDays" as const,
    label: "Siklus manzil",
    unit: "hari",
    hint: "Target seluruh hafalan lama tersentuh dalam rentang ini.",
  },
  {
    key: "dailyLoadLimit" as const,
    label: "Batas harian",
    unit: "halaman",
    hint: "Jumlah halaman murajaah yang ditampilkan per hari. Sabqi didahulukan.",
  },
  {
    key: "intervalCapDays" as const,
    label: "Batas interval",
    unit: "hari",
    hint: "Interval tidak tumbuh melebihi ini agar manzil tetap berputar.",
  },
];

export default function SettingsForm({ settings, manzilTotal, memorizedPages }: Props) {
  const router = useRouter();
  const [values, setValues] = useState({
    sabqiWindowDays: settings.sabqiWindowDays,
    manzilCycleDays: settings.manzilCycleDays,
    dailyLoadLimit: settings.dailyLoadLimit,
    intervalCapDays: settings.intervalCapDays,
  });
  const [labels, setLabels] = useState(settings.labels);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const coverage =
    manzilTotal === 0 ? 0 : Math.ceil(manzilTotal / Math.max(1, values.dailyLoadLimit));
  const warning = manzilTotal > 0 && coverage > values.manzilCycleDays;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, labels }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Gagal menyimpan" }));
      setError(err.error ?? "Gagal menyimpan");
      return;
    }

    setMessage("Pengaturan tersimpan. Daftar murajaah langsung memakai nilai baru.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={17} className="text-ink-faint" />
          <h2 className="text-[15px] font-bold text-ink">Parameter murajaah</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUMERIC_FIELDS.map((field) => {
            const limits = SETTINGS_LIMITS[field.key];
            return (
              <div key={field.key} className="field">
                <label htmlFor={field.key} className="field-label">
                  {field.label} <span className="font-normal text-ink-faint">({field.unit})</span>
                </label>
                <input
                  id={field.key}
                  type="number"
                  min={limits.min}
                  max={limits.max}
                  required
                  value={values[field.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                  }
                  className="input tnum"
                />
                <p className="field-hint">{field.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
          <p>
            <span className="tnum font-bold text-ink">{memorizedPages}</span> halaman dihafal,{" "}
            <span className="tnum font-bold text-ink">{manzilTotal}</span> di antaranya sudah masuk
            jalur manzil.
          </p>
          <p className={warning ? "mt-1 font-medium text-[#8a5a12]" : "mt-1"}>
            {manzilTotal === 0
              ? "Belum ada hafalan lama. Siklus manzil mulai bekerja setelah hafalan melewati jendela sabqi."
              : warning
                ? `Dengan ${values.dailyLoadLimit} halaman/hari, seluruh manzil butuh ${coverage} hari — melebihi siklus ${values.manzilCycleDays} hari.`
                : `Dengan ${values.dailyLoadLimit} halaman/hari, seluruh manzil tersentuh tiap ${coverage} hari, di dalam siklus ${values.manzilCycleDays} hari.`}
          </p>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold text-ink">Nama jenis setoran</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Istilah bisa berbeda antar lembaga. Ubah bila halaqahmu memakai nama lain.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["sabaq", "sabqi", "manzil"] as const).map((key) => (
            <div key={key} className="field">
              <label htmlFor={`label-${key}`} className="field-label">
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
              <input
                id={`label-${key}`}
                value={labels[key]}
                maxLength={24}
                required
                onChange={(e) => setLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                className="input"
              />
            </div>
          ))}
        </div>
      </section>

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
        {loading ? "Menyimpan..." : "Simpan pengaturan"}
      </button>
    </form>
  );
}
