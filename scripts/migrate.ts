import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/db/client";
import { loadEnv } from "../src/lib/env";

const { DATABASE_URL, DATABASE_AUTH_TOKEN } = loadEnv();
const { client, db } = createDb(DATABASE_URL, DATABASE_AUTH_TOKEN);
await migrate(db, { migrationsFolder: "./drizzle" });
client.close();
console.log("Migrasi selesai.");
