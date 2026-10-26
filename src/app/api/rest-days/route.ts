import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { createRestDayHandler, deleteRestDayHandler } from "./handler";

export async function POST(req: Request) {
  const res = await createRestDayHandler(req);
  // Hari libur mengubah hari efektif dan proyeksi.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}

export async function DELETE(req: Request) {
  const res = await deleteRestDayHandler(req);
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
