"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  CaretDown,
  FloppyDisk,
  WarningCircle,
} from "@phosphor-icons/react";

export interface PageInfo {
  pageNumber: number;
  juz: number;
  surahStart: number;
}

const TYPES = [
  { value: "sabaq", label: "Sabaq", hint: "Hafalan baru" },
  { value: "sabqi", label: "Sabqi", hint: "Ulangan baru" },
  { value: "manzil", label: "Manzil", hint: "Murajaah lama" },
];

const QUALITIES = [
  { value: "baru", label: "Baru", dot: "bg-[#9dc4d4]" },
  { value: "lancar", label: "Lancar", dot: "bg-[#6fb894]" },
  { value: "mutqin", label: "Mutqin", dot: "bg-[#216b4b]" },
  { value: "lemah", label: "Lemah", dot: "bg-[#dfae5a]" },
];

interface Props {
  today: string;
  surahs: { number: number; latin: string; arabic: string }[];
  pages: PageInfo[];
}

export default function SessionForm({ today, surahs, pages }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(today);
  const [pageNumber, setPageNumber] = useState("");
  const [type, setType] = useState("sabaq");
  const [quality, setQuality] = useState("lancar");
  const [ayahStart, setAyahStart] = useState("");
  const [ayahEnd, setAyahEnd] = useState("");
  const [note, setNote] = useState("");
  const [showDetail, setShowDetail] = useState(false);

  const pageMeta = useMemo(() => {
    const n = Number(pageNumber);
    if (!Number.isInteger(n) || n < 1 || n > 604) return null;
    return pages.find((p) => p.pageNumber === n) ?? null;
  }, [pageNumber, pages]);

  const surahName = useMemo(() => {
    if (!pageMeta) return null;
    return surahs.find((s) => s.number === pageMeta.surahStart) ?? null;
  }, [pageMeta, surahs]);

  const pageError =
    pageNumber !== "" && (!pageMeta ? "Halaman harus 1 sampai 604." : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const body: Record<string, unknown> = {
      date,
      pageNumber: Number(pageNumber),
      type,
      quality,
    };
    if (ayahStart) body.ayahStart = Number(ayahStart);
    if (ayahEnd) body.ayahEnd = Number(ayahEnd);
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

    setMessage(`Halaman ${pageNumber} tersimpan.`);
    setPageNumber("");
    setAyahStart("");
    setAyahEnd("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="card p-5 sm:p-6">
        {/* Page number -------------------------------------------------- */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="pageNumber" className="field-label">
              Halaman mushaf
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="pageNumber"
                name="pageNumber"
                type="number"
                min={1}
                max={604}
                inputMode="numeric"
                required
                value={pageNumber}
                onChange={(e) => setPageNumber(e.target.value)}
                aria-invalid={Boolean(pageError)}
                aria-describedby="page-help"
                className="input tnum w-24 px-3 py-3 text-center text-[22px] font-bold"
              />
              <span className="text-sm font-medium text-ink-faint">/ 604</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 text-right">
            {pageMeta && surahName ? (
              <div className="rounded-[10px] bg-brand-50 px-3 py-2">
                <p className="font-arabic text-[18px] leading-tight text-brand-800" dir="rtl">
                  {surahName.arabic}
                </p>
                <p className="mt-0.5 truncate text-[12px] font-semibold text-brand-700">
                  {surahName.latin} · Juz {pageMeta.juz}
                </p>
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-line-strong px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink-faint">
                  Nama surah &amp; juz muncul otomatis
                </p>
              </div>
            )}
          </div>
        </div>
        <p id="page-help" className={pageError ? "field-hint text-[#a4342b]" : "field-hint"}>
          {pageError ?? "Nomor halaman sesuai mushaf Madinah 15 baris."}
        </p>

        {/* Type --------------------------------------------------------- */}
        <fieldset className="mt-6">
          <legend className="field-label">Jenis setoran</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <label
                  key={t.value}
                  className={[
                    "cursor-pointer rounded-[10px] border px-2 py-2.5 text-center transition-colors",
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

        {/* Quality ------------------------------------------------------ */}
        <fieldset className="mt-5">
          <legend className="field-label">Kualitas bacaan</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUALITIES.map((q) => {
              const active = quality === q.value;
              return (
                <label
                  key={q.value}
                  className={[
                    "flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 transition-colors",
                    active
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-line-strong bg-surface hover:bg-sunken",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="quality"
                    value={q.value}
                    checked={active}
                    onChange={() => setQuality(q.value)}
                    className="sr-only"
                  />
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${q.dot}`} aria-hidden="true" />
                  <span
                    className={`text-[13px] font-semibold ${active ? "text-brand-800" : "text-ink"}`}
                  >
                    {q.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      {/* Date + detail ------------------------------------------------- */}
      <section className="card p-5 sm:p-6">
        <div className="field">
          <label htmlFor="date" className="field-label">
            Tanggal setoran
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
          <p className="field-hint">Tidak bisa melewati hari ini.</p>
        </div>

        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          className="mt-4 flex w-full items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:text-brand-800"
        >
          <CaretDown
            size={13}
            weight="bold"
            className={`transition-transform ${showDetail ? "rotate-180" : ""}`}
          />
          {showDetail ? "Sembunyikan detail" : "Tambah rentang ayat & catatan"}
        </button>

        {showDetail && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="ayahStart" className="field-label">
                  Ayat awal
                </label>
                <input
                  id="ayahStart"
                  name="ayahStart"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={ayahStart}
                  onChange={(e) => setAyahStart(e.target.value)}
                  placeholder="opsional"
                  className="input tnum"
                />
              </div>
              <div className="field">
                <label htmlFor="ayahEnd" className="field-label">
                  Ayat akhir
                </label>
                <input
                  id="ayahEnd"
                  name="ayahEnd"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={ayahEnd}
                  onChange={(e) => setAyahEnd(e.target.value)}
                  placeholder="opsional"
                  className="input tnum"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="mistakesNote" className="field-label">
                Catatan kesalahan
              </label>
              <textarea
                id="mistakesNote"
                name="mistakesNote"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: waqaf sering terlewat di ayat 12"
                className="input resize-y"
              />
              <p className="field-hint">Berguna untuk murajaah berikutnya.</p>
            </div>
          </div>
        )}
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
          {message} Siap input berikutnya.
        </p>
      )}

      <div className="pt-1">
        <button type="submit" disabled={loading || Boolean(pageError)} className="btn btn-primary w-full">
          <FloppyDisk size={16} weight="bold" />
          {loading ? "Menyimpan..." : "Simpan setoran"}
        </button>
      </div>
    </form>
  );
}
