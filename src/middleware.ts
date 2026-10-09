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
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
