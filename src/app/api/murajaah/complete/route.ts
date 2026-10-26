import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { completeMurajaahHandler } from "./handler";

export async function POST(req: Request) {
  const res = await completeMurajaahHandler(req);
  // Murajaah menulis sessions_log dan mengubah status hafalan + jadwal, jadi
  // cache turunan harus dibuang. Ditempatkan di route (bukan handler) karena
  // tes mengimpor handler tanpa request context.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
