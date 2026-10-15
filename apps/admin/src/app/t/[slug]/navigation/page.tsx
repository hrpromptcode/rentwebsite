import type { Metadata } from "next";
import { and, asc, eq, navigation, pages, type NavItem } from "@rentweb/db";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { NavEditor } from "./nav-editor";

export const metadata: Metadata = { title: "เมนูนำทาง" };

export default async function NavigationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const { header, footer, pageLinks } = await tenantTx(ctx.tenant.id, async (tx) => {
    const rows = await tx.select().from(navigation).where(eq(navigation.tenantId, ctx.tenant.id));
    const find = (loc: string) => (rows.find((r) => r.location === loc)?.items ?? []) as NavItem[];
    const pl = await tx
      .select({ slug: pages.slug, title: pages.title, kind: pages.kind })
      .from(pages)
      .where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.status, "published")))
      .orderBy(asc(pages.sort));
    return { header: find("header"), footer: find("footer"), pageLinks: pl.map((p) => ({ label: p.title, href: p.kind === "home" ? "/" : `/${p.slug}` })) };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="เมนูนำทาง" description="จัดการลิงก์ในส่วนหัวและส่วนท้ายของเว็บ รองรับเมนูย่อย 1 ระดับ" />
      <NavEditor slug={slug} initialHeader={header} initialFooter={footer} pageLinks={pageLinks} canEdit={hasRole(ctx, "manager")} storefrontUrl={ctx.storefrontUrl} />
    </div>
  );
}
