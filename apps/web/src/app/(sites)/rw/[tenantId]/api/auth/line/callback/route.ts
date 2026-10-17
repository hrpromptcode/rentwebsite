import type { NextRequest } from "next/server";
import { audit } from "@rentweb/core";
import { LINE_OAUTH_COOKIE, LineLoginError, getLineLoginCredentials, isLineLoginEnabled, openLineOauthTicket, resolveLineIdentity, signInWithLine, type LineLoginErrorCode } from "@rentweb/core/customer";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer, requestMeta } from "@/lib/customer";
import { safeNext } from "../../../../account/safe-next";
import { accountOutcome, callbackUrl, clearTicketCookie, loginError, redirectTo, requestOrigin, setCustomerSessionCookie, type Params } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/line/callback?code=…&state=…  (or ?error=access_denied&state=…)
 * Checks the state against the sealed ticket cookie, exchanges the code (PKCE), verifies the id_token / profile,
 * then either opens a customer session (find-or-create BY lineUserId only) or – when a customer is already signed
 * in – links the LINE id to that customer. Every failure lands on a Thai message, never on a blank page.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { origin, https } = requestOrigin(req);
  const sp = req.nextUrl.searchParams;
  const ticket = openLineOauthTicket(req.cookies.get(LINE_OAUTH_COOKIE)?.value);
  const linkMode = ticket?.mode === "link";
  const next = safeNext(ticket?.next);
  const fail = (code: LineLoginErrorCode) => {
    const res = linkMode ? accountOutcome(origin, { error: code }) : loginError(origin, code, next);
    clearTicketCookie(res);
    return res;
  };

  // 1. state / CSRF
  const state = sp.get("state");
  if (!ticket || !state || state !== ticket.state) return fail("state_mismatch");
  // 2. the visitor pressed "cancel" on LINE (or LINE reported an error)
  const providerError = sp.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "denied" : "token_failed");
  const code = sp.get("code");
  if (!code) return fail("state_mismatch");

  // 3. tenant still allows LINE login and has credentials
  const runtime = await getRuntime(tenantId);
  if (!runtime) return redirectTo(origin, "/");
  if (!isLineLoginEnabled(runtime.config.settings)) return fail("not_enabled");
  const creds = await tenantTx(tenantId, (tx) => getLineLoginCredentials(tx, tenantId));
  if (!creds) return fail("invalid_credentials");

  // 4. code → verified identity
  let identity;
  try {
    identity = await resolveLineIdentity({ ...creds, code, redirectUri: callbackUrl(origin), codeVerifier: ticket.codeVerifier, nonce: ticket.nonce });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn("[line-login] identity failed:", e instanceof Error ? e.message : e);
    return fail(e instanceof LineLoginError ? e.code : "unknown");
  }

  // 5. login or link
  const current = await getCurrentCustomer(tenantId);
  const meta = await requestMeta();
  const result = await tenantTx(tenantId, async (tx) => {
    const r = await signInWithLine(tx, tenantId, identity, { currentCustomerId: current?.id ?? null, ...meta });
    if (r.ok && (r.mode === "linked" || r.isNew)) {
      await audit(tx, {
        tenantId,
        actorType: "customer",
        actorId: r.customer.id,
        action: r.mode === "linked" ? "customer.line.link" : "customer.line.signup",
        targetType: "customer",
        targetId: r.customer.id,
        diff: { lineUserId: identity.userId },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return r;
  });
  if (!result.ok) {
    // a LINE id that belongs to someone else is an account-page problem when linking, a login-page one otherwise
    const res = current ? accountOutcome(origin, { error: result.error }) : loginError(origin, result.error, next);
    clearTicketCookie(res);
    return res;
  }
  if (result.mode === "linked") {
    const res = accountOutcome(origin, { ok: "linked" });
    clearTicketCookie(res);
    return res;
  }
  const res = redirectTo(origin, next);
  setCustomerSessionCookie(res, result.token, result.expiresAt, https);
  clearTicketCookie(res);
  return res;
}
