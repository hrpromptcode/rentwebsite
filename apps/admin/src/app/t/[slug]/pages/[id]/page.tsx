import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, pages } from "@rentweb/db";
import { isUuid } from "@rentweb/core";
import { SectionEditor } from "@/components/editor/section-editor";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";

export const metadata: Metadata = { title: "แก้ไขหน้า" };

export default async function PageEditorPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const [page] = await tenantTx(ctx.tenant.id, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, ctx.tenant.id), eq(pages.id, id))).limit(1));
  if (!page) notFound();

  return (
    <SectionEditor
      tenantSlug={slug}
      pageId={page.id}
      kind={page.kind}
      status={page.status}
      publishedAt={page.publishedAt?.toISOString() ?? null}
      initialSections={page.sections ?? []}
      initialMeta={{ title: page.title, slug: page.slug, showInNav: page.showInNav, seo: page.seo ?? {} }}
      enabledModules={ctx.modules}
      storefrontUrl={ctx.storefrontUrl}
      canPublish={hasRole(ctx, "manager")}
      canDelete={hasRole(ctx, "admin")}
    />
  );
}
