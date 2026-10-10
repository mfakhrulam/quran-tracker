import { pages, memorizationStatus } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import ProgressMap from "@/components/ProgressMap";

export default async function PetaPage() {
  const db = getDb();
  const allPages = await db.select().from(pages).orderBy(pages.pageNumber);
  const statuses = await db.select().from(memorizationStatus);
  const statusByPage = new Map(statuses.map((s) => [s.pageNumber, s.status]));

  const data = allPages.map((p) => ({
    pageNumber: p.pageNumber,
    juz: p.juz,
    surahStart: p.surahStart,
    status: statusByPage.get(p.pageNumber) ?? "belum",
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Peta hafalan</h1>
      <ProgressMap pages={data} />
    </div>
  );
}
