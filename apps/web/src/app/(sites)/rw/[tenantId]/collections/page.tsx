import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { CtaButton, Rise } from "@rentweb/storefront";
import { listCategories } from "@rentweb/module-commerce/services";
import { Breadcrumbs, CategoryIndex, CategoryTiles, CommerceStyles, ListingIntro, categoryLayoutFor, withCategoryImages } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "commerce", "collections", { title: L.collections }) : {};
}

export default async function CollectionsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "collections");
  const categories = await tenantTx(tenantId, async (tx) => withCategoryImages(tx, tenantId, await listCategories(tx, tenantId)));
  const layout = categoryLayoutFor(runtime.theme.preset.key);
  const total = categories.reduce((s, c) => s + c.productCount, 0);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CommerceStyles />
      <section className="container-x pb-20 md:pb-32">
        <Breadcrumbs items={[{ label: L.products, href: "/products" }, { label: L.collections }]} className="pt-6 md:pt-8" />
        <ListingIntro eyebrow={runtime.config.name} title={L.collections} count={`(${String(categories.length).padStart(2, "0")})`} lead={(runtime.config.settings.tagline as string | undefined) ?? null} className="!pt-4 md:!pt-8">
          <Rise delay={0.2} className="mt-6 md:mt-8">
            <CtaButton href="/products" label={`${L.products} · ${total}`} variant="outline" size="lg" />
          </Rise>
        </ListingIntro>
        {categories.length ? (
          layout === "index" ? (
            <CategoryIndex categories={categories} bordered={false} />
          ) : (
            <CategoryTiles categories={categories} className="mt-4" />
          )
        ) : (
          <Rise className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <span className="rwc-bob flex size-20 items-center justify-center rounded-full bg-muted">
              <PackageSearch className="size-8" />
            </span>
            <p className="font-heading text-step-2 text-foreground">{L.emptyCatalog}</p>
          </Rise>
        )}
      </section>
    </PageBody>
  );
}
