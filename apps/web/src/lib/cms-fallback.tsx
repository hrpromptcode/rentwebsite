import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ModuleKey } from "@rentweb/core/modules";
import type { TenantRuntime } from "@rentweb/core/tenant";
import { RenderSections } from "@rentweb/storefront";
import { getPublishedPage } from "./tenant";
import { buildCtx } from "./storefront-ctx";
import { cmsPageMetadata } from "./seo";
import { PageBody } from "@/components/page-body";

/**
 * Module routes (/services, /menu, /products …) own their path only when the module is enabled.
 * Otherwise a tenant may legitimately have a CMS page with that slug (e.g. a corporate site's
 * "services" page), so render it instead of a 404.
 */
export async function cmsFallback(runtime: TenantRuntime, slug: string) {
  const page = await getPublishedPage(runtime.config.id, slug);
  if (!page) notFound();
  const ctx = await buildCtx(runtime);
  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <RenderSections sections={page.sections} ctx={ctx} pageTitle={page.title} />
    </PageBody>
  );
}

/**
 * Metadata counterpart of cmsFallback (SS-13): a module route replaces its static `metadata` export with
 *   export async function generateMetadata({ params }) {
 *     const runtime = await getRuntime((await params).tenantId);
 *     return runtime ? moduleOrCmsMetadata(runtime, "booking", "services", { title: "บริการทั้งหมด" }) : {};
 *   }
 * so the CMS page's title/description/og are used whenever the module is off.
 */
export async function moduleOrCmsMetadata(runtime: TenantRuntime, moduleKey: ModuleKey, slug: string, moduleMetadata: Metadata): Promise<Metadata> {
  if (runtime.config.modules.includes(moduleKey)) return moduleMetadata;
  const page = await getPublishedPage(runtime.config.id, slug);
  return page ? cmsPageMetadata(runtime, page) : moduleMetadata;
}
