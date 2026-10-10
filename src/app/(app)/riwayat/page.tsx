import { desc } from "drizzle-orm";
import { sessionsLog } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import SessionList from "@/components/SessionList";

export default async function RiwayatPage() {
  const rows = await getDb().select().from(sessionsLog).orderBy(desc(sessionsLog.date), desc(sessionsLog.id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Riwayat</h1>
      <SessionList sessions={rows} />
    </div>
  );
}
