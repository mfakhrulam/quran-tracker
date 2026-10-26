import { createDb } from "../src/db/client";
import { loadEnv } from "../src/lib/env";
import { recomputeMemorizationStatus } from "../src/lib/tracker/derive-status";

const env = loadEnv();
const { client, db } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);

await recomputeMemorizationStatus(db);

client.close();
console.log("Jadwal murajaah dihitung ulang.");
