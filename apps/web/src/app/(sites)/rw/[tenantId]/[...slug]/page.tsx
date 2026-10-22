import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import { notFound } from "next/navigation";
import { getPublishedPage, getRuntime } from "@/lib/tenant";
import { cmsPageMetadata } from "@/lib/seo";
import { CmsPageView } from "./cms-page-view";

type Params = Promise<{ tenantId: string; slug: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = rawSlug.map(decodeSlug);
  const [runtime, page] = await Promise.all([getRuntime(tenantId), getPublishedPage(tenantId, slug.join("/"))]);
  if (!runtime || !page) return {};
  return cmsPageMetadata(runtime, page);
}

/** CMS pages (about, contact, work, legal …): PageIntro + sections, see ./cms-page-view.tsx. */
export default async function CmsPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = rawSlug.map(decodeSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const page = await getPublishedPage(tenantId, slug.join("/"));
  if (!page) notFound();
  return <CmsPageView runtime={runtime} page={page} />;
}
