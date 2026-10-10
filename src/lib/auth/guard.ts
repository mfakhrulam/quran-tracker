import { getDb } from "@/lib/auth/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function getSessionUserId(req: Request): Promise<number | null> {
  const token = readCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (!token) return null;
  const session = await verifySession(getDb(), token);
  return session?.userId ?? null;
}
