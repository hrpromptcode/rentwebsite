import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories, listProducts } from "@rentweb/module-commerce/services";
import { CatalogListing, cardStyleForPreset, parseCatalogParams } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: L.products };

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const q = parseCatalogParams(await searchParams);

  const [result, categories] = await tenantTx(tenantId, (tx) =>
    Promise.all([
      listProducts(tx, tenantId, { category: q.category, q: q.q, sort: q.sort, minPrice: q.min ? q.min * 100 : null, maxPrice: q.max ? q.max * 100 : null, page: q.page, perPage: 24 }),
      listCategories(tx, tenantId),
    ]),
  );
  const active = q.category ? (categories.find((c) => c.slug === q.category) ?? null) : null;

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
