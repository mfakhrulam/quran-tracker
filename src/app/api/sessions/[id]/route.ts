import { updateSessionLogHandler, deleteSessionLogHandler } from "./handler";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return updateSessionLogHandler(req, Number(id));
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return deleteSessionLogHandler(req, Number(id));
}
