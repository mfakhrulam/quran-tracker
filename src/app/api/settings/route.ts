import { revalidateTag } from "next/cache";
import { PROGRESS_TAG } from "@/lib/tracker/progress-cache";
import { getSettingsHandler, updateSettingsHandler } from "./handler";

export const GET = getSettingsHandler;

export async function PATCH(req: Request) {
  const res = await updateSettingsHandler(req);
  // Parameter murajaah mengubah jalur (sabqi vs manzil) dan jadwal halaman,
  // jadi kartu murajaah di dashboard akan basi tanpa revalidasi ini.
  if (res.ok) revalidateTag(PROGRESS_TAG);
  return res;
}
