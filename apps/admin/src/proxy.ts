import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/t/:path*", "/console/:path*", "/onboarding/:path*"],
};

const COOKIE_NAMES = ["rentweb.session_token", "__Secure-rentweb.session_token"];

/**
 * Cheap gate: redirect visitors without a session cookie to /login.
 * Real verification (DB lookup, membership, role) happens in the server layouts.
 */
export default function proxy(req: NextRequest) {
  const hasCookie = COOKIE_NAMES.some((n) => req.cookies.has(n));
  if (hasCookie) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
