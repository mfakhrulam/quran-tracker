import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { updateSessionLogHandler, deleteSessionLogHandler } from "./handler";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await updateSessionLogHandler(req, Number(id));
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await deleteSessionLogHandler(req, Number(id));
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
