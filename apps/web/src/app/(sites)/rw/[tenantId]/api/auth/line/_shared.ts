import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, LINE_OAUTH_COOKIE, LINE_OAUTH_TTL_SEC, isHttpsRequest, type LineLoginErrorCode } from "@rentweb/core/customer";

/**
 * Shared bits of the LINE Login route handlers (/api/auth/line/start + /callback).
 * Both run on the tenant host (the proxy rewrote /api/auth/line/* to rw/[tenantId]/api/auth/line/*).
 */

export type Params = { params: Promise<{ tenantId: string }> };

/** Public origin of this request as the visitor's browser sees it (tenant host, scheme from the proxy headers). */
export function requestOrigin(req: NextRequest): { origin: string; https: boolean; host: string } {
  const h = req.headers;
  const host = (h.get("x-tenant-host") ?? h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /\.localhost(:\d+)?$/.test(host);
  // x-forwarded-proto when a proxy (or Next itself) set it; else https for every non-local host
  const https = h.get("x-forwarded-proto") ? isHttpsRequest(h) : !local;
  return { origin: `${https ? "https" : "http"}://${host}`, https, host };
}

/** Where LINE sends the browser back to – must match the URL registered in the LINE console character by character. */
export function callbackUrl(origin: string): string {
  return `${origin}/api/auth/line/callback`;
}

export function redirectTo(origin: string, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, origin), 302);
  res.headers.set("cache-control", "no-store");
  return res;
}

export function setTicketCookie(res: NextResponse, sealed: string, https: boolean) {
  res.cookies.set(LINE_OAUTH_COOKIE, sealed, { httpOnly: true, sameSite: "lax", secure: https, maxAge: LINE_OAUTH_TTL_SEC, path: "/" });
}

export function clearTicketCookie(res: NextResponse) {
  res.cookies.set(LINE_OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

export function setCustomerSessionCookie(res: NextResponse, token: string, expiresAt: Date, https: boolean) {
  res.cookies.set(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: https, expires: expiresAt, path: "/" });
}

/** Login-page error redirect (keeps ?next so the visitor can retry with OTP and still land where they wanted). */
export function loginError(origin: string, code: LineLoginErrorCode, next?: string | null): NextResponse {
  const q = new URLSearchParams({ error: `line_${code}` });
  if (next && next !== "/account") q.set("next", next);
  return redirectTo(origin, `/account/login?${q.toString()}`);
}

/** Account-page outcome redirect (link / unlink flows of a signed-in customer). */
export function accountOutcome(origin: string, outcome: { ok: "linked" | "unlinked" } | { error: LineLoginErrorCode }): NextResponse {
  const q = new URLSearchParams("ok" in outcome ? { line: outcome.ok } : { line_error: outcome.error });
  return redirectTo(origin, `/account?${q.toString()}`);
}
