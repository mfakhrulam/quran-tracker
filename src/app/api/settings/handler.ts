import { settings as settingsTable } from "@/db/schema";
import { getDb } from "@/lib/auth/db";
import { getSessionUserId } from "@/lib/auth/guard";
import { guardAndReadJson } from "@/lib/http/csrf";
import { LABEL_KEYS, NUMERIC_KEYS, loadSettings, type AppSettings } from "@/lib/settings";
import { settingsPatchInput } from "@/lib/tracker/validation";

export async function getSettingsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  return Response.json({ settings: await loadSettings(getDb()) });
}

export async function updateSettingsHandler(req: Request): Promise<Response> {
  const userId = await getSessionUserId(req);
  if (userId === null) return Response.json({ error: "Belum masuk" }, { status: 401 });

  const body = await guardAndReadJson(req);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = settingsPatchInput.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const entries: { key: string; value: string }[] = [];
  const numericKeys = Object.keys(NUMERIC_KEYS) as (keyof typeof NUMERIC_KEYS)[];
  for (const key of numericKeys) {
    const value = parsed.data[key];
    if (value !== undefined) entries.push({ key: NUMERIC_KEYS[key], value: String(value) });
  }

  if (parsed.data.labels) {
    const labelKeys = Object.keys(LABEL_KEYS) as (keyof typeof LABEL_KEYS)[];
    for (const key of labelKeys) {
      entries.push({ key: LABEL_KEYS[key], value: parsed.data.labels[key] });
    }
  }

  const db = getDb();
  for (const entry of entries) {
    await db
      .insert(settingsTable)
      .values(entry)
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: entry.value } });
  }

  const settings: AppSettings = await loadSettings(db);
  return Response.json({ settings });
}
