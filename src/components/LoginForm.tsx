"use client";
import { useState } from "react";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (res.ok) { window.location.href = "/"; return; }
    const data = await res.json().catch(() => ({ error: "Gagal masuk" }));
    setError(data.error ?? "Gagal masuk");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Masuk</h1>
      <input name="username" placeholder="Username" required autoComplete="username"
        className="w-full rounded border border-neutral-300 px-3 py-2" />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password"
        className="w-full rounded border border-neutral-300 px-3 py-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="w-full rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
        {loading ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}
