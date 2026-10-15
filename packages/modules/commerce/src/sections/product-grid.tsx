import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Magnetic, Reveal } from "@rentweb/ui/motion";
import { Section, SectionHeading, type StorefrontCtx } from "@rentweb/storefront";
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

export async function ProductGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  let list = await withTenant(getDb(), tenantId, (tx) => listProducts(tx, tenantId, { ...queryFor(p), perPage: p.limit }));
  // a brand-new shop with nothing flagged "featured" still gets a grid
  if (!list.items.length && p.source === "featured") list = await withTenant(getDb(), tenantId, (tx) => listProducts(tx, tenantId, { sort: "best_selling", perPage: p.limit }));
  if (!list.items.length) return null;
  const viewAllHref = p.source === "category" && p.categorySlug ? `/collections/${encodeURIComponent(p.categorySlug)}` : "/products";

  return (
    <Section id={id}>
      <div className="container-x">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-12">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 md:mb-0" />
          {p.showViewAll && (
            <Reveal delay={0.15} className="hidden md:block">
              <Magnetic strength={0.15}>
                <Button asChild variant="outline" size="lg">
                  <Link href={viewAllHref}>
                    {L.viewAll}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </Magnetic>
            </Reveal>
          )}
        </div>
        <ProductGridView products={list.items} columns={p.columns} style={p.cardStyle} />
        {p.showViewAll && (
          <div className="mt-8 md:hidden">
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href={viewAllHref}>
                {L.viewAll}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
