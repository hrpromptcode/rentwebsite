import { notFound } from "next/navigation";
import type { TenantRuntime } from "@rentweb/core/tenant";
import { RenderSections } from "@rentweb/storefront";
import { getPublishedPage } from "./tenant";
import { buildCtx } from "./storefront-ctx";
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
      <RenderSections sections={page.sections} ctx={ctx} />
    </PageBody>
  );
}
