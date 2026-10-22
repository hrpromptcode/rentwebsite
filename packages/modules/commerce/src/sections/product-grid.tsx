import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { CtaButton, Rise, Section, SectionHeading, hasAccentFont, type StorefrontCtx } from "@rentweb/storefront";
import type { productGrid } from "@rentweb/storefront/definitions";
import { listProducts, type ListProductsInput } from "../services/products";
import { ProductGridView } from "../components/product-grid-view";
import { L } from "../labels";

type Props = z.output<typeof productGrid.schema>;

function queryFor(p: Props): ListProductsInput {
  switch (p.source) {
    case "featured":
      return { featured: true, sort: "best_selling" };
    case "newest":
      return { sort: "newest" };
    case "best-sellers":
      return { sort: "best_selling" };
    case "category":
      return { category: p.categorySlug ?? null, sort: "newest" };
    default:
      return {};
  }
}

/**
 * Product grid section (§7.3): split heading with a mono count, magnetic "ดูทั้งหมด", and the card language of the
 * chosen cardStyle (editorial = staggered magazine grid, hover-swap = 3D tilt, standard = sticker cards on "brutal"
 * card shapes).
 */
export async function ProductGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  let list = await withTenant(getDb(), tenantId, (tx) => listProducts(tx, tenantId, { ...queryFor(p), perPage: p.limit }));
  // a brand-new shop with nothing flagged "featured" still gets a grid
  if (!list.items.length && p.source === "featured") list = await withTenant(getDb(), tenantId, (tx) => listProducts(tx, tenantId, { sort: "best_selling", perPage: p.limit }));
  if (!list.items.length) return null;
  const viewAllHref = p.source === "category" && p.categorySlug ? `/collections/${encodeURIComponent(p.categorySlug)}` : "/products";
  const count = `(${String(list.items.length).padStart(2, "0")})`;

  return (
    <Section id={id} type="product-grid">
      <div className="container-x">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-16">
          <SectionHeading eyebrow={p.eyebrow} index={p.eyebrow ? count : undefined} heading={p.heading} subheading={p.subheading} align="left" accent={hasAccentFont(ctx)} className="mb-0 max-w-2xl md:mb-0" />
          {p.showViewAll && (
            <Rise delay={0.15} className="hidden md:block">
              <CtaButton href={viewAllHref} label={L.viewAll} variant="outline" size="lg" />
            </Rise>
          )}
        </div>
        <ProductGridView products={list.items} columns={p.columns} style={p.cardStyle} />
        {p.showViewAll && (
          <div className="mt-10 md:hidden">
            <CtaButton href={viewAllHref} label={L.viewAll} variant="outline" size="lg" className="w-full justify-center" magnetic={false} />
          </div>
        )}
      </div>
    </Section>
  );
}
