import type { NextRequest } from "next/server";
import { buildLineAuthorizeUrl, createLineOauthTicket, getLineLoginCredentials, isLineLoginEnabled, pkceChallenge, sealLineOauthTicket } from "@rentweb/core/customer";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { safeNext } from "../../../../account/safe-next";
import { accountOutcome, callbackUrl, loginError, redirectTo, requestOrigin, setTicketCookie, type Params } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/line/start?next=/checkout[&link=1]
 * Builds the LINE authorize URL (code + PKCE S256 + nonce), stores state / nonce / verifier / next in a sealed
 * short-lived httpOnly cookie and redirects the browser to LINE. A signed-in customer is sent through the same
 * flow in "link" mode (the callback then attaches the LINE id to that customer instead of logging in).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { origin, https } = requestOrigin(req);
  const sp = req.nextUrl.searchParams;
  const next = safeNext(sp.get("next"));
  const runtime = await getRuntime(tenantId);
  if (!runtime) return redirectTo(origin, "/");
  const customer = await getCurrentCustomer(tenantId);
  const mode: "login" | "link" = customer || sp.get("link") === "1" ? "link" : "login";
  if (mode === "link" && !customer) return redirectTo(origin, `/account/login?next=${encodeURIComponent("/account")}`);

  if (!isLineLoginEnabled(runtime.config.settings)) return mode === "link" ? accountOutcome(origin, { error: "not_enabled" }) : loginError(origin, "not_enabled", next);
  const creds = await tenantTx(tenantId, (tx) => getLineLoginCredentials(tx, tenantId));
  if (!creds) return mode === "link" ? accountOutcome(origin, { error: "invalid_credentials" }) : loginError(origin, "invalid_credentials", next);

  const ticket = createLineOauthTicket({ next, mode });
  const url = buildLineAuthorizeUrl({
    channelId: creds.channelId,
    redirectUri: callbackUrl(origin),
    state: ticket.state,
    nonce: ticket.nonce,
    codeChallenge: pkceChallenge(ticket.codeVerifier),
  });
  const res = redirectTo(origin, url);
  setTicketCookie(res, sealLineOauthTicket(ticket), https);
  return res;
}
