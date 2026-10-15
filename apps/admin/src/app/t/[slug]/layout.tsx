import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { ImpersonationBanner } from "@/components/shell/impersonation-banner";
import { buildTenantNav } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { getTenantCtx, listUserTenants } from "@/lib/tenant";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  return { title: { default: ctx.tenant.name, template: `%s · ${ctx.tenant.name}` } };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const session = (await getSession())!;
  const tenants = await listUserTenants(session.user.id);
  const nav = buildTenantNav(slug, ctx.modules);

  return (
    <AppShell
      mode="tenant"
      nav={nav}
      user={{ name: session.user.name, email: session.user.email, role: session.user.role ?? "user" }}
      tenants={tenants}
      current={{ id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, status: ctx.tenant.status, role: ctx.role }}
      storefrontUrl={ctx.storefrontUrl}
      banner={ctx.impersonating ? <ImpersonationBanner tenantName={ctx.tenant.name} /> : null}
    >
      {children}
    </AppShell>
  );
}
