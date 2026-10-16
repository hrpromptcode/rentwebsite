import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCategoryBySlug, listCategories, listProducts } from "@rentweb/module-commerce/services";
import { CatalogListing, cardStyleForPreset, catalogHref, parseCatalogParams } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "commerce", "products", { title: L.products }) : {};
}

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "products");
  const q = parseCatalogParams(await searchParams);

  const data = await tenantTx(tenantId, async (tx) => {
    // SS-09: an unknown ?category= is a 404 like /collections/<unknown>, not "the shop has no products"
    const category = q.category ? await getCategoryBySlug(tx, tenantId, q.category) : null;
    if (q.category && !category) return null;
    const [result, categories] = await Promise.all([
      listProducts(tx, tenantId, { category: q.category, q: q.q, sort: q.sort, minPrice: q.min ? q.min * 100 : null, maxPrice: q.max ? q.max * 100 : null, page: q.page, perPage: 24 }),
      listCategories(tx, tenantId),
    ]);
    return { category, result, categories };
  });
  if (!data) notFound();
  const { result, categories } = data;
  // a page past the last one → the last page
  if (result.total > 0 && q.page > result.pages) redirect(catalogHref("/products", { ...q, page: result.pages }));
  const active = q.category ? (categories.find((c) => c.slug === q.category) ?? data.category) : null;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CatalogListing
        eyebrow={runtime.config.name}
        title={active?.name ?? L.products}
        description={active?.description ?? (runtime.config.settings.tagline as string | undefined) ?? null}
        categories={categories}
        activeSlug={q.category}
        basePath="/products"
        query={q}
        result={result}
        cardStyle={cardStyleForPreset(runtime.theme.preset.key)}
      />
    </PageBody>
  );
}
