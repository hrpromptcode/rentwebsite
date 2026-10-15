import { getTenantCtx, hasRole } from "@/lib/tenant";
import { GeneralForm } from "./general-form";
import { readGeneral } from "./shared";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  return <GeneralForm slug={slug} initial={readGeneral({ name: ctx.tenant.name, settings: (ctx.tenant.settings ?? {}) as Record<string, unknown> })} storefrontUrl={ctx.storefrontUrl} canEdit={hasRole(ctx, "admin")} />;
}
