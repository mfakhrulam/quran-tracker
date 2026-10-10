import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? "";
  const session = await verifySession(getDb(), token);
  if (!session) redirect("/login");

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </>
  );
}
