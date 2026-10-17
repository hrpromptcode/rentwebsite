import { eq } from "drizzle-orm";
import { tenantDomains, type Tx } from "@rentweb/db";
import { checkCustomDomainDns, domainDnsInstructions, verifyCustomDomain, type DomainDnsResolver } from "@rentweb/core/tenant";

/**
 * Thin wrappers over the custom-domain lifecycle in `@rentweb/core/tenant` (domains.ts, ADMIN_B2-11) so the
 * worker and the admin Domains page use one convention:
 *   TXT  _rentweb.<host>  = the claim's verification token
 *   CNAME <host>          → <slug>.<root>   (or cname.<root>; apex: A record in EDGE_IPS)
 */
export function dnsInstructions(hostname: string, token: string, tenantSlug: string) {
  return domainDnsInstructions(hostname, token, tenantSlug);
}

export async function checkDomainDns(hostname: string, token: string, tenantSlug: string, resolver?: DomainDnsResolver) {
  const r = await checkCustomDomainDns(hostname, token, tenantSlug, resolver);
  return { cnameOk: r.routeOk, txtOk: r.txtOk, detail: r.error ?? "" };
}

/** Re-checks a custom domain (outbox `domain.requested`); returns true when it is active. */
export async function verifyTenantDomain(tx: Tx, domainId: string, resolver?: DomainDnsResolver): Promise<boolean> {
  const [d] = await tx.select({ tenantId: tenantDomains.tenantId }).from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
  if (!d) return false;
  const r = await verifyCustomDomain(tx, d.tenantId, domainId, { resolver });
  return r.ok;
}
