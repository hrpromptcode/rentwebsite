import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { HoverPreview, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { ThaiName } from "../components/thai-name";
import { Img, Section, SectionHeading, presetKey, sized, type StorefrontCtx } from "@rentweb/storefront";
import type { categoryList } from "@rentweb/storefront/definitions";
import { cn } from "@rentweb/ui/lib/utils";
import { listCategories, type CategoryWithCount } from "../services/categories";
import { listProducts } from "../services/products";
import { L, label } from "../labels";
import { CategoryChips } from "../components/category-chips";
import { CommerceStyles } from "../components/commerce-styles";

type Props = z.output<typeof categoryList.schema>;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Categories without their own photo borrow the newest product photo of that category (read-only listing query), so
 * tiles / the hover index never show an empty gradient block for a shop that skipped category images.
 */
export async function withCategoryImages(tx: Parameters<typeof listCategories>[0], tenantId: string, cats: CategoryWithCount[]): Promise<CategoryWithCount[]> {
  return Promise.all(
    cats.map(async (c) => {
      if (c.image || !c.productCount) return c;
      const r = await listProducts(tx, tenantId, { category: c.slug, sort: "newest", perPage: 1 });
      return { ...c, image: r.items[0]?.images[0]?.url ?? null };
    }),
  );
}

/** Presets whose mood is editorial/quiet: "tiles" renders as the hover-reveal index there (§5.1 item 3). */
const INDEX_PRESETS = new Set(["aurora", "midnight", "quartz", "studio", "obsidian", "porcelain", "zen", "loft", "riviera"]);
export const categoryLayoutFor = (preset: string | undefined): "index" | "tiles" => (INDEX_PRESETS.has(preset ?? "") ? "index" : "tiles");

/**
 * Hover-reveal index (§5.1): giant category names as rows, mono index + count; on fine pointers the category photo
 * follows the cursor (HoverPreview) and the other rows dim; on touch each row shows a small thumbnail.
 */
export function CategoryIndex({ categories, className, cursorLabel = "ดูหมวดนี้", bordered = true }: { categories: CategoryWithCount[]; className?: string; cursorLabel?: string; bordered?: boolean }) {
  return (
    <HoverPreview width={300} ratio={0.8} className={className}>
      <CommerceStyles />
      <ul className={cn("rwc-index", !bordered && "border-t-0")}>
      {categories.map((c, i) => (
        <li key={c.id} data-preview-src={c.image ? sized(c.image, 640) : undefined}>
          <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="rwc-index-row" data-cursor="view" data-cursor-label={cursorLabel}>
            <span aria-hidden className="rwc-no text-muted-foreground">
              {pad2(i + 1)}
            </span>
            <span className="min-w-0">
              {/* phones: one step smaller so two-word names ("ของแต่งบ้าน") stay on one line; ThaiWrap = breaks only between words */}
              <span className="rwc-index-name heading-display text-step-3 leading-[1.25] font-semibold sm:text-step-4 md:text-step-5 lg:text-step-6" data-script="thai">
                <ThaiName text={c.name} />
              </span>
            </span>
            <span className="flex items-center gap-3 md:gap-6">
              {c.image && <Img src={sized(c.image, 200)} alt="" className="rwc-index-thumb" />}
              <span className="rwc-no hidden text-muted-foreground sm:inline">{label("items", { n: c.productCount })}</span>
              <ArrowUpRight aria-hidden className="rwc-index-arrow size-6 shrink-0 md:size-9" strokeWidth={1.25} />
            </span>
          </Link>
        </li>
      ))}
      </ul>
    </HoverPreview>
  );
}

export function CategoryTiles({ categories, className }: { categories: CategoryWithCount[]; className?: string }) {
  const n = categories.length;
  return (
    <Stagger className={cn("grid grid-cols-2 gap-3 md:gap-5", n >= 4 ? "lg:grid-cols-4" : n === 3 ? "lg:grid-cols-3" : "", className)} stagger={0.08}>
      <CommerceStyles />
      {categories.map((c, i) => (
        <StaggerItem key={c.id} className={cn("min-w-0", n === 3 && i === 0 && "col-span-2 lg:col-span-1")}>
          <Link
            href={`/collections/${encodeURIComponent(c.slug)}`}
            className={cn("card group relative block overflow-hidden !bg-muted text-background", n === 3 && i === 0 ? "aspect-[16/9] lg:aspect-[4/5]" : "aspect-[4/5]")}
            data-cursor="view"
            data-cursor-label="ดูหมวดนี้"
          >
            {c.image ? (
              <Img src={c.image} alt={c.name} className="absolute inset-0 size-full object-cover transition duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.07]" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary via-glow to-accent opacity-80" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            <span aria-hidden className="rwc-no absolute top-4 left-4 text-white/80">
              {pad2(i + 1)}
            </span>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-5">
              <div className="min-w-0">
                <h3 className="font-heading text-xl leading-tight font-semibold text-white md:text-2xl">{c.name}</h3>
                <p className="mt-1 text-xs text-white/80 md:text-sm">{label("items", { n: c.productCount })}</p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition duration-500 group-hover:rotate-45 group-hover:bg-white group-hover:text-black">
                <ArrowUpRight className="size-5" />
              </span>
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/** Chip row with the sliding active pill (listing pages + the "pills" section variant). */
export function CategoryPills({ categories, activeSlug, allHref, allLabel, allCount, className }: { categories: CategoryWithCount[]; activeSlug?: string | null; allHref?: string; allLabel?: string; allCount?: number; className?: string }) {
  const total = allCount ?? categories.reduce((s, c) => s + c.productCount, 0);
  return (
    <CategoryChips
      className={className}
      ariaLabel={L.collections}
      items={[
        ...(allHref ? [{ key: "__all", href: allHref, label: allLabel ?? "ทั้งหมด", count: total, current: !activeSlug }] : []),
        ...categories.map((c) => ({ key: c.slug, href: `/collections/${encodeURIComponent(c.slug)}`, label: c.name, count: c.productCount, current: activeSlug === c.slug })),
      ]}
    />
  );
}

export function CategoryCircles({ categories, className }: { categories: CategoryWithCount[]; className?: string }) {
  return (
    <Stagger className={cn("flex gap-5 overflow-x-auto pb-2 no-scrollbar md:justify-center md:gap-10", className)} stagger={0.06}>
      {categories.map((c) => (
        <StaggerItem key={c.id} className="shrink-0">
          <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="group flex w-28 flex-col items-center gap-3 text-center md:w-36">
            <span className="relative block size-28 overflow-hidden rounded-full border-2 border-transparent bg-muted transition duration-500 group-hover:-translate-y-1 group-hover:border-primary md:size-36">
              {c.image ? <Img src={c.image} alt={c.name} className="size-full object-cover transition duration-700 group-hover:scale-110" /> : <span className="block size-full bg-gradient-to-br from-primary to-accent opacity-70" />}
            </span>
            <span className="font-heading text-sm font-semibold md:text-base">{c.name}</span>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export async function CategoryListSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const categories = await withTenant(getDb(), tenantId, async (tx) => withCategoryImages(tx, tenantId, await listCategories(tx, tenantId, { limit: p.limit })));
  if (!categories.length) return null;
  const layout = p.variant === "tiles" ? categoryLayoutFor(presetKey(ctx)) : p.variant;
  return (
    <Section id={id} type="category-list" className={p.variant === "pills" ? "!py-8 md:!py-12" : undefined}>
      <div className="container-x">
        <SectionHeading
          heading={p.heading}
          index={layout === "index" ? `(${pad2(categories.length)})` : undefined}
          align="left"
          size={layout === "index" ? "sm" : "md"}
          className={p.variant === "pills" ? "mb-5 md:mb-6" : layout === "index" ? "mb-8 md:mb-12" : undefined}
        />
        {layout === "index" && <CategoryIndex categories={categories} />}
        {layout === "tiles" && <CategoryTiles categories={categories} />}
        {layout === "pills" && <CategoryPills categories={categories} />}
        {layout === "circles" && <CategoryCircles categories={categories} />}
      </div>
    </Section>
  );
}
