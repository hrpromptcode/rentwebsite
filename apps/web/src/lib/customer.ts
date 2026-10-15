import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { CUSTOMER_COOKIE, getCustomerByToken, type CustomerSummary } from "@rentweb/core/customer";
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
  const host = h.get("x-tenant-host") ?? h.get("host") ?? "";
  jar.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !host.includes("localhost"),
    expires: expiresAt,
    path: "/",
  });
}

export async function clearCustomerCookie() {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}
