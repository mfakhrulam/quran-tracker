import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export default async function Home() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? "";
  const session = await verifySession(getDb(), token);
  if (!session) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Assalamu&apos;alaikum</h1>
      <p className="mt-2 text-neutral-600">Dashboard tracker hafalan akan tampil di sini (Fase 2).</p>
      <form action="/api/auth/logout" method="post" className="mt-6">
        <button className="rounded border border-neutral-300 px-4 py-2">Keluar</button>
      </form>
    </main>
  );
}
