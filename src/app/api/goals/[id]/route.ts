import { updateGoalHandler } from "./handler";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return updateGoalHandler(req, Number(id));
}
