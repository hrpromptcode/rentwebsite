import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-action POSTs (next-action header) skip the proxy: they authenticate themselves (getTenantCtx /
 * requireSession), and a request that passes through the proxy has its body buffered and truncated at
 * experimental.proxyClientMaxBodySize (10 MB), which broke media uploads near the 10 MB per-file limit
 * with "Unexpected end of form" (ADMIN_B2-15). Their limit is serverActions.bodySizeLimit in next.config.ts.
 */
// (literal values only: Next reads this config statically)
export const config = {
  matcher: [
    { source: "/t/:path*", missing: [{ type: "header", key: "next-action" }] },
    { source: "/console/:path*", missing: [{ type: "header", key: "next-action" }] },
    { source: "/onboarding/:path*", missing: [{ type: "header", key: "next-action" }] },
  ],
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
