"use client";
import { useState } from "react";
import { LockSimple, User, ArrowRight, WarningCircle } from "@phosphor-icons/react";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json().catch(() => ({ error: "Gagal masuk" }));
    setError(data.error ?? "Gagal masuk");
    setLoading(false);
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      {/* Soft brand wash behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,_var(--color-brand-100)_0%,_transparent_65%)] opacity-70"
      />

      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-brand-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_8px_20px_-10px_rgb(23_69_52/0.6)]">
            <span className="font-arabic text-[23px] leading-none">ق</span>
          </span>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-tight text-ink">
            Tracker Hafalan
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Masuk untuk melanjutkan catatan hafalanmu.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card p-6" noValidate>
          <div className="space-y-4">
            <div className="field">
              <label htmlFor="username" className="field-label">
                Username
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="username"
                  name="username"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="input pl-9"
                  placeholder="owner"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <div className="relative">
                <LockSimple
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input pl-9"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-[10px] bg-[#fdf0ee] px-3 py-2.5 text-[13px] font-medium text-[#8f2f26]"
            >
              <WarningCircle size={16} weight="fill" className="mt-px shrink-0" />
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary mt-5 w-full">
            {loading ? "Memproses..." : "Masuk"}
            {!loading && <ArrowRight size={15} weight="bold" />}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-faint">
          Akun dibuat oleh pemilik aplikasi.
          <br />
          Tidak ada pendaftaran publik.
        </p>
      </div>
    </div>
  );
}
