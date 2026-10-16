import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import { notFound } from "next/navigation";
import { RenderSections } from "@rentweb/storefront";
import { getPublishedPage, getRuntime } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { cmsPageMetadata } from "@/lib/seo";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = rawSlug.map(decodeSlug);
  const [runtime, page] = await Promise.all([getRuntime(tenantId), getPublishedPage(tenantId, slug.join("/"))]);
  if (!runtime || !page) return {};
  return cmsPageMetadata(runtime, page);
}

export default async function CmsPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = rawSlug.map(decodeSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const page = await getPublishedPage(tenantId, slug.join("/"));
  if (!page) notFound();
  const ctx = await buildCtx(runtime);
  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <RenderSections sections={page.sections} ctx={ctx} pageTitle={page.title} />
    </PageBody>
  );
}
