import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import { serializeJsonLd } from "@rentweb/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareText, Scale } from "lucide-react";
import { Reveal, VelocityMarquee } from "@rentweb/ui/motion";
import { Eyebrow, Prose, RevealHeading, SectionHeading } from "@rentweb/storefront";
import { getProductBySlug, getRelatedProducts, variantAvailable } from "@rentweb/module-commerce/services";
import {
  AddToCart,
  Breadcrumbs,
  CommerceStyles,
  ProductGallery,
  ProductGridView,
  ReviewForm,
  ShareButton,
  Stars,
  cardStyleForPreset,
  dateTh,
  type BuyBoxProduct,
  type BuyBoxVariant,
} from "@rentweb/module-commerce/components";
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
  "text-step-0 leading-[1.8] text-foreground/90 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h2]:font-heading [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-heading [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_table]:w-full [&_td]:border-b [&_td]:py-2 [&_th]:border-b [&_th]:py-2 [&_th]:text-left [&_hr]:my-6";

const glen = (s: string) => [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s.replace(/\s+/g, ""))].length;

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
  const expressive = runtime.theme.effects.motionLevel === "expressive";

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
  const n = glen(product.name);
  const titleSize = n <= 14 ? "text-step-5" : n <= 26 ? "text-step-4" : "text-step-3";
  const rating = product.ratingAvg / 100;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CommerceStyles />
      <section className="container-x pb-28 sm:pb-20 md:pb-28">
        <Breadcrumbs items={[{ label: L.products, href: "/products" }, ...(category ? [{ label: category.name, href: `/collections/${encodeURIComponent(category.slug)}` }] : []), { label: product.name }]} className="pt-5 pb-4 md:pt-8 md:pb-8" />

        <div className="grid gap-8 md:grid-cols-12 md:gap-10 lg:gap-16">
          <Reveal className="md:col-span-6 lg:col-span-7">
            <ProductGallery images={images} name={product.name} soldOut={soldOut} className="lg:pr-[6%]" />
          </Reveal>

          <div className="md:sticky md:top-[calc(var(--header-h,0px)+1.5rem)] md:col-span-6 md:self-start lg:col-span-5">
            <Reveal delay={0.05}>
              {category && (
                <Link href={`/collections/${encodeURIComponent(category.slug)}`} className="inline-flex min-h-11 min-w-11 items-center pr-2 md:min-h-8 md:min-w-0">
                  <Eyebrow text={category.name} index="—" rule={false} />
                </Link>
              )}
              <RevealHeading as="h1" text={product.name} trigger="mount" mode="lines" className={`heading-display mt-2 font-semibold text-balance ${titleSize}`} />
              {product.shortDescription && <p className="mt-4 max-w-prose text-step-1 leading-relaxed text-muted-foreground">{product.shortDescription}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Stars value={product.ratingAvg} count={product.ratingCount} size="md" />
                {product.soldCount > 0 && <span className="rwc-num">{label("sold", { n: product.soldCount.toLocaleString("th-TH") })}</span>}
              </div>
            </Reveal>

            <Reveal delay={0.12} className="mt-7 border-t border-foreground/15 pt-7">
              <AddToCart product={buyProduct} variants={buyVariants} />
            </Reveal>

            <Reveal delay={0.18} className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-foreground/15 pt-4 text-sm text-muted-foreground">
              <ShareButton title={product.name} text={product.shortDescription ?? undefined} className="-ml-3" />
              {product.sku && (
                <span>
                  {L.sku}: <span className="font-mono text-foreground/80">{product.sku}</span>
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
      </section>

      {expressive && (
        <div aria-hidden className="overflow-hidden border-y border-foreground/10 py-5 md:py-8">
          <VelocityMarquee items={[product.name, category?.name ?? runtime.config.name]} outline="alternate" size="md" speed={36} separator="✦" />
        </div>
      )}

      <section className="container-x py-16 md:py-28">
        {product.description && (
          <div className="grid gap-8 md:grid-cols-12 md:gap-10">
            <div className="md:col-span-4">
              <div className="md:sticky md:top-[calc(var(--header-h,0px)+2rem)]">
                <Eyebrow index="01" text={L.details} />
                <RevealHeading as="h2" text={L.description} className="mt-4 font-heading text-step-4 font-semibold" />
              </div>
            </div>
            <Reveal className="md:col-span-8 lg:col-span-7">
              {isHtml ? <div className={htmlClass} dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} /> : <Prose text={product.description} className="text-step-0 leading-[1.8] text-foreground/90" />}
              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 border-t border-foreground/15 text-sm">
                {category && (
                  <>
                    <dt className="border-b border-foreground/10 py-3 text-muted-foreground">{L.category}</dt>
                    <dd className="border-b border-foreground/10 py-3">{category.name}</dd>
                  </>
                )}
                {product.sku && (
                  <>
                    <dt className="border-b border-foreground/10 py-3 text-muted-foreground">{L.sku}</dt>
                    <dd className="border-b border-foreground/10 py-3 font-mono">{product.sku}</dd>
                  </>
                )}
                {product.weightGrams > 0 && (
                  <>
                    <dt className="border-b border-foreground/10 py-3 text-muted-foreground">{L.weight}</dt>
                    <dd className="border-b border-foreground/10 py-3">{product.weightGrams.toLocaleString("th-TH")} กรัม</dd>
                  </>
                )}
              </dl>
            </Reveal>
          </div>
        )}

        <div className={`grid gap-10 md:grid-cols-12 md:gap-10 ${product.description ? "mt-20 md:mt-32" : ""}`}>
          <div className="md:col-span-4">
            <div className="md:sticky md:top-[calc(var(--header-h,0px)+2rem)]">
              <Eyebrow index="02" text={label("reviewsCount", { n: product.ratingCount })} />
              <h2 className="mt-4 font-heading text-step-4 font-semibold">{L.reviews}</h2>
              <Reveal className="mt-6 flex items-end gap-4">
                <span className="rwc-bignum text-[clamp(4.5rem,9vw,8rem)]">{product.ratingCount > 0 ? rating.toFixed(1) : "—"}</span>
                <span className="pb-2 text-sm text-muted-foreground">
                  {L.ratingOutOf}
                  <br />
                  {label("reviewsCount", { n: product.ratingCount })}
                </span>
              </Reveal>
              {product.ratingCount > 0 && <Stars value={product.ratingAvg} showCount={false} size="md" className="mt-3" />}
            </div>
          </div>
          <div className="grid gap-8 md:col-span-8 lg:col-span-7">
            {reviews.length === 0 ? (
              <Reveal className="flex items-center gap-3 border-y border-foreground/15 py-6 text-muted-foreground">
                <MessageSquareText className="size-5 shrink-0" />
                <p>{L.noReviews}</p>
              </Reveal>
            ) : (
              <ul className="grid border-t border-foreground/15">
                {reviews.map((r, i) => (
                  <Reveal key={r.id} as="li" delay={0.05 * Math.min(i, 4)} className="border-b border-foreground/15 py-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-full bg-foreground font-semibold text-background">{r.authorName.slice(0, 1)}</span>
                        <div>
                          <p className="font-medium">{r.authorName}</p>
                          <p className="text-xs text-muted-foreground">{dateTh(r.createdAt)}</p>
                        </div>
                      </div>
                      <Stars value={r.rating * 100} showCount={false} />
                    </div>
                    {r.title && <p className="mt-4 font-heading text-step-1 font-medium">“{r.title}”</p>}
                    {r.body && <p className="mt-2 leading-relaxed text-foreground/85">{r.body}</p>}
                    {r.reply && (
                      <div className="mt-4 border-l-2 border-primary pl-4 text-sm">
                        <p className="text-xs font-semibold text-muted-foreground">ร้านค้าตอบกลับ</p>
                        <p className="mt-1">{r.reply}</p>
                      </div>
                    )}
                  </Reveal>
                ))}
              </ul>
            )}
            <Reveal delay={0.1} className="card p-5 md:p-7">
              <h3 className="font-heading text-lg font-semibold">{L.writeReview}</h3>
              <div className="mt-4">
                <ReviewForm action={reviewAction} defaultName={customer?.name} />
              </div>
            </Reveal>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-24 md:mt-36">
            <SectionHeading eyebrow={category?.name} index="03" heading={L.related} align="left" className="mb-8 md:mb-12" />
            <ProductGridView products={related} columns={4} style={cardStyleForPreset(runtime.theme.preset.key)} priorityCount={0} />
          </div>
        )}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    </PageBody>
  );
}
