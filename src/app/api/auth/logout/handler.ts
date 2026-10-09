import { getDb } from "@/lib/auth/db";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function logoutHandler(req: Request): Promise<Response> {
  const token = readCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (token) await deleteSession(getDb(), token);
  const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/login", req.url).toString(),
      "Set-Cookie": cookie,
    },
  });
}
