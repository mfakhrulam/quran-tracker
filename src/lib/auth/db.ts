import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createDb } from "@/db/client";
import { loadEnv } from "@/lib/env";
import type * as schema from "@/db/schema";

let cached: LibSQLDatabase<typeof schema> | null = null;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!cached) {
    const env = loadEnv();
    cached = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN).db;
  }
  return cached;
}
