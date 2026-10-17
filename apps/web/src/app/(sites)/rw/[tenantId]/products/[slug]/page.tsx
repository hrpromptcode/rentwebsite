import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import { serializeJsonLd } from "@rentweb/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareText, Scale, Tag } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { Prose, SectionHeading } from "@rentweb/storefront";
import { getProductBySlug, getRelatedProducts, variantAvailable } from "@rentweb/module-commerce/services";
import { AddToCart, Breadcrumbs, ProductGallery, ProductGridView, ReviewForm, ShareButton, Stars, cardStyleForPreset, dateTh, type BuyBoxProduct, type BuyBoxVariant } from "@rentweb/module-commerce/components";
import { L, label } from "@rentweb/module-commerce/labels";
import { sanitizeHtml, stripHtml } from "@rentweb/module-commerce/lib";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { createReviewAction } from "./actions";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const d = await tenantTx(tenantId, (tx) => getProductBySlug(tx, tenantId, slug));
  if (!d) return {};
  const seo = (d.product.seo ?? {}) as { title?: string; description?: string };
  const description = seo.description ?? d.product.shortDescription ?? stripHtml(d.product.description, 160);
  const image = d.product.images[0]?.url;
  return { title: seo.title ?? d.product.name, description: description || undefined, openGraph: { title: d.product.name, description: description || undefined, images: image ? [image] : undefined, type: "website" } };
}

const htmlClass =
  "leading-relaxed text-foreground/90 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h2]:font-heading [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-heading [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_table]:w-full [&_td]:border-b [&_td]:py-2 [&_th]:border-b [&_th]:py-2 [&_th]:text-left [&_hr]:my-6";

export default async function ProductPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const [ctx, customer, data] = await Promise.all([
    buildCtx(runtime),
    getCurrentCustomer(tenantId),
    tenantTx(tenantId, async (tx) => {
      const d = await getProductBySlug(tx, tenantId, slug);
      if (!d) return null;
      const related = await getRelatedProducts(tx, tenantId, d.product, 4);
      return { ...d, related };
    }),
  ]);
  if (!data) notFound();
  const { product, variants, reviews, category, stock, related } = data;
  const soldOut = stock !== null && stock <= 0;
  const isHtml = /<[a-z][\s\S]*>/i.test(product.description ?? "");

  const buyProduct: BuyBoxProduct = {
    id: product.id,
    name: product.name,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    hasVariants: product.hasVariants,
    options: product.options ?? [],
    stock,
    type: product.type,
    lowStockThreshold: product.lowStockThreshold,
  };
  const buyVariants: BuyBoxVariant[] = variants.map((v) => ({ id: v.id, title: v.title, optionValues: v.optionValues ?? {}, price: v.price, compareAtPrice: v.compareAtPrice, stock: variantAvailable(product, v), image: v.image }));
  const images = product.images ?? [];
  const url = `${ctx.origin}/products/${encodeURIComponent(product.slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: images.map((i) => i.url),
    description: product.shortDescription ?? stripHtml(product.description, 300) ?? undefined,
    sku: product.sku ?? undefined,
    brand: { "@type": "Brand", name: runtime.config.name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "THB",
      price: (product.price / 100).toFixed(2),
      availability: soldOut ? "https://schema.org/OutOfStock" : product.type === "preorder" ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
    },
    aggregateRating: product.ratingCount > 0 ? { "@type": "AggregateRating", ratingValue: (product.ratingAvg / 100).toFixed(1), reviewCount: product.ratingCount } : undefined,
  };
  const reviewAction = createReviewAction.bind(null, tenantId, product.id, product.slug);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-28 sm:pb-16 md:pb-24">
        <Breadcrumbs items={[{ label: L.products, href: "/products" }, ...(category ? [{ label: category.name, href: `/collections/${encodeURIComponent(category.slug)}` }] : []), { label: product.name }]} className="mb-4 md:mb-6" />

        <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Reveal>
            <ProductGallery images={images} name={product.name} soldOut={soldOut} />
          </Reveal>

          <div className="md:sticky md:top-[calc(var(--header-h,0px)+1rem)] md:self-start">
            <Reveal delay={0.1}>
              {category && (
                <Link href={`/collections/${encodeURIComponent(category.slug)}`} className="inline-flex h-11 items-center gap-1.5 text-xs font-semibold tracking-[0.25em] text-primary-ink uppercase md:h-8">
                  <Tag className="size-3.5" /> {category.name}
                </Link>
              )}
              <h1 className="heading-display mt-1 text-3xl font-semibold text-balance md:text-4xl lg:text-5xl">{product.name}</h1>
              {product.shortDescription && <p className="mt-3 text-base text-muted-foreground md:text-lg">{product.shortDescription}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Stars value={product.ratingAvg} count={product.ratingCount} size="md" />
                {product.soldCount > 0 && <span>{label("sold", { n: product.soldCount.toLocaleString("th-TH") })}</span>}
              </div>
            </Reveal>

            <Reveal delay={0.15} className="mt-6 border-t pt-6">
              <AddToCart product={buyProduct} variants={buyVariants} />
            </Reveal>

            <Reveal delay={0.2} className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
              <ShareButton title={product.name} text={product.shortDescription ?? undefined} className="-ml-3" />
              {product.sku && (
                <span>
                  {L.sku}: <span className="font-mono">{product.sku}</span>
                </span>
              )}
              {product.weightGrams > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Scale className="size-3.5" /> {product.weightGrams.toLocaleString("th-TH")} กรัม
                </span>
              )}
            </Reveal>
          </div>
        </div>

        {product.description && (
          <Reveal className="mt-14 max-w-3xl md:mt-20">
            <h2 className="font-heading text-2xl font-semibold md:text-3xl">{L.description}</h2>
            {isHtml ? <div className={`mt-4 ${htmlClass}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} /> : <Prose text={product.description} className="mt-4 text-foreground/90" />}
          </Reveal>
        )}

        <div className="mt-14 grid gap-8 md:mt-20 lg:grid-cols-[1fr_24rem] lg:items-start">
          <div>
            <Reveal className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">
                {L.reviews}
                {product.ratingCount > 0 && <span className="ml-2 text-base font-normal text-muted-foreground">({product.ratingCount})</span>}
              </h2>
              {product.ratingCount > 0 && <Stars value={product.ratingAvg} count={product.ratingCount} size="md" />}
            </Reveal>
            {reviews.length === 0 ? (
              <Reveal delay={0.05} className="card mt-5 flex items-center gap-3 p-6 text-muted-foreground">
                <MessageSquareText className="size-5 shrink-0" />
                <p>{L.noReviews}</p>
              </Reveal>
            ) : (
              <ul className="mt-5 grid gap-4">
                {reviews.map((r, i) => (
                  <Reveal key={r.id} delay={0.05 * Math.min(i, 4)}>
                    <li className="card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">{r.authorName.slice(0, 1)}</span>
                          <div>
                            <p className="font-medium">{r.authorName}</p>
                            <p className="text-xs text-muted-foreground">{dateTh(r.createdAt)}</p>
                          </div>
                        </div>
                        <Stars value={r.rating * 100} showCount={false} />
                      </div>
                      {r.title && <p className="mt-3 font-medium">{r.title}</p>}
                      {r.body && <p className="mt-1 text-sm leading-relaxed text-foreground/90">{r.body}</p>}
                      {r.reply && (
                        <div className="mt-3 rounded-[var(--radius-md)] bg-muted/60 p-3 text-sm">
                          <p className="text-xs font-semibold text-muted-foreground">ร้านค้าตอบกลับ</p>
                          <p className="mt-1">{r.reply}</p>
                        </div>
                      )}
                    </li>
                  </Reveal>
                ))}
              </ul>
            )}
          </div>
          <Reveal delay={0.1} className="card p-5 md:p-6">
            <h3 className="font-heading text-lg font-semibold">{L.writeReview}</h3>
            <div className="mt-4">
              <ReviewForm action={reviewAction} defaultName={customer?.name} />
            </div>
          </Reveal>
        </div>

        {related.length > 0 && (
          <div className="mt-16 md:mt-24">
            <SectionHeading heading={L.related} align="left" className="mb-6 md:mb-8" />
            <ProductGridView products={related} columns={4} style={cardStyleForPreset(runtime.theme.preset.key)} priorityCount={0} />
          </div>
        )}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    </PageBody>
  );
}
