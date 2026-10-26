import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { listGoalsHandler, createGoalHandler } from "./handler";

export const GET = listGoalsHandler;

export async function POST(req: Request) {
  const res = await createGoalHandler(req);
  // Target aktif mengubah proyeksi, jadi cache turunan harus dibuang.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
