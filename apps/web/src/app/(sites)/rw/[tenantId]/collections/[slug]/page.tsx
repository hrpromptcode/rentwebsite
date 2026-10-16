import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import { notFound, redirect } from "next/navigation";
import { getCategoryBySlug, listCategories, listProducts } from "@rentweb/module-commerce/services";
import { CatalogListing, cardStyleForPreset, catalogHref, parseCatalogParams } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;
type Props = { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const cat = await tenantTx(tenantId, (tx) => getCategoryBySlug(tx, tenantId, slug));
  if (!cat) return {};
  return { title: cat.name, description: cat.description ?? undefined, openGraph: cat.image ? { images: [cat.image] } : undefined };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const q = parseCatalogParams(await searchParams);

  const data = await tenantTx(tenantId, async (tx) => {
    const category = await getCategoryBySlug(tx, tenantId, slug);
    if (!category) return null;
    const [result, categories] = await Promise.all([
      listProducts(tx, tenantId, { category: slug, q: q.q, sort: q.sort, minPrice: q.min ? q.min * 100 : null, maxPrice: q.max ? q.max * 100 : null, page: q.page, perPage: 24 }),
      listCategories(tx, tenantId),
    ]);
    return { category, result, categories };
  });
  if (!data) notFound();
  const { category, result, categories } = data;
  // SS-09: a page past the last one → the last page
  if (result.total > 0 && q.page > result.pages) redirect(catalogHref(`/collections/${encodeURIComponent(slug)}`, { ...q, category: null, page: result.pages }));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CatalogListing
        eyebrow={L.collections}
        title={category.name}
        description={category.description}
        crumbs={[{ label: L.products, href: "/products" }, { label: L.collections, href: "/collections" }, { label: category.name }]}
        categories={categories}
        activeSlug={slug}
        basePath={`/collections/${encodeURIComponent(slug)}`}
        query={{ ...q, category: null }}
        result={result}
        cardStyle={cardStyleForPreset(runtime.theme.preset.key)}
      />
    </PageBody>
  );
}
