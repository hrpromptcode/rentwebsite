import type { Metadata } from "next";
import { eq, getAdminDb, tenantDomains } from "@rentweb/db";
import { getLineLoginStatus, isLineLoginEnabled } from "@rentweb/core/customer";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { LineLoginForm } from "./line-form";

export const metadata: Metadata = { title: "LINE Login" };

export default async function LineSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const settings = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const [status, domains] = await Promise.all([
    tenantTx(ctx.tenant.id, (tx) => getLineLoginStatus(tx, ctx.tenant.id)),
    getAdminDb().select({ hostname: tenantDomains.hostname, kind: tenantDomains.kind, status: tenantDomains.status }).from(tenantDomains).where(eq(tenantDomains.tenantId, ctx.tenant.id)),
  ]);
  // one callback URL per host the storefront answers on: the system host + every verified custom domain
  const origins = [ctx.storefrontUrl, ...domains.filter((d) => d.kind === "custom" && d.status === "active").map((d) => `https://${d.hostname}`)];
  const callbackUrls = Array.from(new Set(origins.map((o) => `${o.replace(/\/+$/, "")}/api/auth/line/callback`)));
  return (
    <LineLoginForm
      slug={slug}
      initial={{ enabled: isLineLoginEnabled(settings), channelId: status.channelId ?? "", secretHint: status.secretHint }}
      callbackUrls={callbackUrls}
      storefrontLoginUrl={`${ctx.storefrontUrl}/account/login`}
      canEdit={hasRole(ctx, "admin")}
      mockMode={process.env.NODE_ENV !== "production" && process.env.LINE_MOCK === "1"}
    />
  );
}
