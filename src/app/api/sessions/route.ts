import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { listSessionsHandler, createSessionLogHandler } from "./handler";

export const GET = listSessionsHandler;

export async function POST(req: Request) {
  const res = await createSessionLogHandler(req);
  // Status hafalan diturunkan ulang oleh handler; buang cache ber-tag supaya
  // pembacaan berikutnya (dashboard/peta) melihat angka baru.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
