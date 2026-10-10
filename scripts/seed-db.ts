import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createDb } from "../src/db/client";
import { pages, users, settings } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { loadEnv } from "../src/lib/env";
import type * as schema from "../src/db/schema";
import type { PageRow } from "../src/lib/mushaf/parse-tanzil";

export interface SeedOptions { ownerUsername?: string; ownerPassword?: string; pagesPath?: string }

export const DEFAULT_SETTINGS: Record<string, string> = {
  sabqi_window_days: "14",
  manzil_cycle_days: "7",
  daily_load_limit: "2",
  label_sabaq: "Sabaq",
  label_sabqi: "Sabqi",
  label_manzil: "Manzil",
};

export async function seed(db: LibSQLDatabase<typeof schema>, opts: SeedOptions = {}): Promise<void> {
  const path = opts.pagesPath ?? "src/data/pages.json";
  const rows = JSON.parse(readFileSync(path, "utf8")) as PageRow[];
  if (rows.length !== 604) throw new Error(`pages.json harus 604 baris, dapat ${rows.length}`);

  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.insert(pages).values(r).onConflictDoUpdate({
        target: pages.pageNumber,
        set: { juz: r.juz, surahStart: r.surahStart, ayahStart: r.ayahStart, surahEnd: r.surahEnd, ayahEnd: r.ayahEnd },
      });
    }
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }

  if (opts.ownerUsername && opts.ownerPassword) {
    const existing = await db.select().from(users).where(eq(users.username, opts.ownerUsername));
    if (existing.length === 0) {
      await db.insert(users).values({
        username: opts.ownerUsername,
        passwordHash: await hashPassword(opts.ownerPassword),
      });
    }
  }
}

async function main() {
  const env = loadEnv();
  const { client, db } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed(db, { ownerUsername: env.OWNER_USERNAME, ownerPassword: env.OWNER_PASSWORD });
  client.close();
  console.log("Seed selesai.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
