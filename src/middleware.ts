import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const PUBLIC_PREFIXES = ["/login", "/_next", "/api/auth", "/favicon.ico"];

export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  return !hasSession;
}

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (shouldRedirectToLogin(req.nextUrl.pathname, hasSession)) {
    // `NextResponse.redirect` (dan konstruktor NextResponse di runtime
    // middleware) menuntut URL absolut. Origin diambil dari `req.nextUrl`,
    // bukan dari header `Host`, karena `nextUrl` sudah dinormalisasi oleh
    // server. Redirect ke `/login` di origin mana pun tidak memindahkan
    // kredensial: cookie `SameSite=Lax` tidak ikut, dan penyerang hanya bisa
    // mengalihkan requestnya sendiri.
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
