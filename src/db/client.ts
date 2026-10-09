import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function createDb(url: string, authToken?: string): { client: Client; db: LibSQLDatabase<typeof schema> } {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { client, db };
}
