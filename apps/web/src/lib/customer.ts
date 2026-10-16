import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { clientIp, CUSTOMER_COOKIE, getCustomerByToken, isHttpsRequest, type CustomerSummary } from "@rentweb/core/customer";
import { tenantTx } from "./tenant";

/** Currently signed-in storefront customer for this tenant (per-request cached). */
export const getCurrentCustomer = cache(async (tenantId: string): Promise<CustomerSummary | null> => {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  return tenantTx(tenantId, (tx) => getCustomerByToken(tx, tenantId, token));
});

export async function setCustomerCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  const h = await headers();
  jar.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // from the request protocol (x-forwarded-proto, else the Origin of the server-action POST), not the host name:
    // a custom domain served over plain http still gets a usable cookie, and https never gets a non-secure one
    secure: isHttpsRequest(h, h.get("origin") ?? h.get("referer")),
    expires: expiresAt,
    path: "/",
  });
}

export async function clearCustomerCookie() {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

/**
 * IP + user agent for OTP rate limits and session records. X-Forwarded-For is only trusted when TRUSTED_PROXY
 * declares the reverse proxies in front of the app (see clientIp in @rentweb/core/customer); otherwise X-Real-IP.
 */
export async function requestMeta() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}
