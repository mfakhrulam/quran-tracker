import { getDb } from "@/lib/auth/db";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkSameOrigin } from "@/lib/http/csrf";

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * Logout dipicu oleh `<form method="post">` tanpa body JSON, jadi hanya
 * pemeriksaan same-origin yang berlaku (audit F-08). Redirect memakai path
 * relatif supaya `Host` yang dikendalikan penyerang tidak bisa mengarahkan
 * pengguna ke origin lain (audit F-12).
 */
export async function logoutHandler(req: Request): Promise<Response> {
  const origin = checkSameOrigin(req);
  if (!origin.ok) return Response.json({ error: origin.error }, { status: origin.status });

  const token = readCookie(req.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (token) await deleteSession(getDb(), token);
  const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Set-Cookie": cookie,
    },
  });
}
