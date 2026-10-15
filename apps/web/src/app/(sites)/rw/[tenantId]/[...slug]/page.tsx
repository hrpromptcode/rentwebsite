import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RenderSections } from "@rentweb/storefront";
import { getPublishedPage, getRuntime } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const page = await getPublishedPage(tenantId, slug.join("/"));
  if (!page) return {};
  const seo = page.seo as { title?: string; description?: string; ogImage?: string; noindex?: boolean };
  return {
    title: seo.title ?? page.title,
    description: seo.description,
    openGraph: seo.ogImage ? { images: [seo.ogImage] } : undefined,
    robots: seo.noindex ? { index: false } : undefined,
  };
}

export default async function CmsPage({ params }: { params: Params }) {
  const { tenantId, slug } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const page = await getPublishedPage(tenantId, slug.join("/"));
  if (!page) notFound();
  const ctx = await buildCtx(runtime);
  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <RenderSections sections={page.sections} ctx={ctx} />
    </PageBody>
  );
}
