import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  OWNER_USERNAME: z.string().min(1).optional(),
  OWNER_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Env tidak valid: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  return parsed.data;
}
