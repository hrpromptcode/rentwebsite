import type { Metadata } from "next";
import { asc, eq, getAdminDb, tenantDomains } from "@rentweb/db";
import { rootDomain } from "@rentweb/core/env";
import { domainDnsInstructions } from "@rentweb/core/tenant";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { DomainsPanel } from "./domains-panel";

export const metadata: Metadata = { title: "โดเมน" };

export default async function DomainsSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await getAdminDb()
    .select({
      id: tenantDomains.id,
      hostname: tenantDomains.hostname,
      kind: tenantDomains.kind,
      isPrimary: tenantDomains.isPrimary,
      status: tenantDomains.status,
      verificationToken: tenantDomains.verificationToken,
      sslStatus: tenantDomains.sslStatus,
      lastCheckedAt: tenantDomains.lastCheckedAt,
      verifiedAt: tenantDomains.verifiedAt,
      lastError: tenantDomains.lastError,
    })
    .from(tenantDomains)
    .where(eq(tenantDomains.tenantId, ctx.tenant.id))
    .orderBy(asc(tenantDomains.createdAt));

  return (
    <DomainsPanel
      slug={slug}
      domains={rows.map((r) => ({
        ...r,
        lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        dns: r.kind === "custom" ? domainDnsInstructions(r.hostname, r.verificationToken ?? "", ctx.tenant.slug) : null,
      }))}
      systemHost={ctx.hostname}
      cnameTarget={`${ctx.tenant.slug}.${rootDomain()}`}
      storefrontUrl={ctx.storefrontUrl}
      canEdit={hasRole(ctx, "admin")}
    />
  );
}
