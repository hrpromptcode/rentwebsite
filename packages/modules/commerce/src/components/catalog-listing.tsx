import * as React from "react";
import { PackageSearch, SearchX } from "lucide-react";
import { CtaButton, Rise } from "@rentweb/storefront";
import { ListingIntro } from "./listing-intro";
import type { CategoryWithCount } from "../services/categories";
import type { ProductListResult, ProductSort } from "../services/products";
import { L, label } from "../labels";
import { Breadcrumbs, type Crumb } from "./page-header";
import { CategoryPills } from "../sections/category-list";
import { CatalogFilters, type CatalogQuery } from "./catalog-filters";
import { CatalogGrid } from "./catalog-grid";
import { ProductCardView, type CardStyle } from "./product-card";
import { Pagination } from "./pagination";
import { CommerceStyles } from "./commerce-styles";

export interface CatalogListingProps {
  title: string;
  eyebrow?: string;
  description?: string | null;
  crumbs?: Crumb[];
  categories: CategoryWithCount[];
  activeSlug?: string | null;
  /** path the filters submit to (e.g. /products or /collections/apparel) */
  basePath: string;
  query: CatalogQuery & { page?: number; category?: string | null };
  result: ProductListResult;
  cardStyle?: CardStyle;
  columns?: 2 | 3 | 4;
}

/**
 * Card style that feels native to the tenant's preset: editorial presets get the magazine card (mono index, image
 * wipe-swap); neon/dark showcase presets the 3D tilt card; everything else the framed card (sticker on "brutal").
 */
export function cardStyleForPreset(presetKey: string | undefined): CardStyle {
  if (presetKey === "aurora" || presetKey === "porcelain" || presetKey === "zen") return "editorial";
  if (presetKey === "midnight" || presetKey === "quartz" || presetKey === "studio" || presetKey === "obsidian" || presetKey === "neon") return "hover-swap";
  return "standard";
}

export function catalogHref(basePath: string, q: CatalogQuery & { page?: number; category?: string | null }): string {
  const sp = new URLSearchParams();
  if (q.category) sp.set("category", q.category);
  if (q.q) sp.set("q", q.q);
  if (q.sort) sp.set("sort", q.sort);
  if (q.min) sp.set("min", String(q.min));
  if (q.max) sp.set("max", String(q.max));
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Parses listing search params: prices arrive in baht, go out in satang. */
export function parseCatalogParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const num = (k: string) => {
    const n = Number(one(k));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const sortRaw = one("sort") as ProductSort;
  const sort: ProductSort | null = ["newest", "price_asc", "price_desc", "best_selling"].includes(sortRaw) ? sortRaw : null;
  return {
    q: one("q").trim().slice(0, 100) || undefined,
    sort,
    min: num("min"),
    max: num("max"),
    page: num("page") ?? 1,
    category: one("category").trim() || null,
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Listing page ("marketing-light", §5.0): PageIntro with a giant split-reveal title + mono count, category chips with a
 * sliding pill, the filter bar, then the FLIP grid in the tenant's card language. Empty states say why.
 */
export function CatalogListing({ title, eyebrow, description, crumbs, categories, activeSlug, basePath, query, result, cardStyle = "standard" }: CatalogListingProps) {
  const filtered = !!(query.q || query.min || query.max);
  // SS-09: say why the grid is empty — a page past the last one, a filter, an empty category, or a really empty shop
  const pageOut = result.items.length === 0 && result.total > 0;
  const empty = pageOut
    ? { title: L.pageEmpty, hint: L.pageEmptyHint, action: { href: catalogHref(basePath, { ...query, page: 1 }), label: L.firstPage } }
    : filtered
      ? { title: L.noResults, hint: L.noResultsHint, action: { href: basePath, label: L.clearFilters } }
      : activeSlug
        ? { title: L.emptyCategory, hint: L.emptyCategoryHint, action: { href: "/products", label: L.allProducts } }
        : { title: L.emptyCatalog, hint: L.emptyCatalogHint, action: null };
  const hrefFor = (page: number) => catalogHref(basePath, { ...query, page });
  const hidden = basePath === "/products" && query.category ? { category: query.category } : {};
  const startIndex = (result.page - 1) * result.perPage;

  return (
    <section className="container-x pb-20 md:pb-32">
      <CommerceStyles />
      {crumbs && <Breadcrumbs items={crumbs} className="pt-6 md:pt-8" />}
      <ListingIntro eyebrow={eyebrow} title={title} lead={description} count={`(${pad2(result.total)})`} className={crumbs ? "!pt-4 md:!pt-8" : undefined} />

      <Rise delay={0.1} className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        {categories.length > 0 && <CategoryPills categories={categories} activeSlug={activeSlug} allHref="/products" allLabel={L.allCategories} className="min-w-0 lg:flex-1" />}
        <CatalogFilters query={query} action={basePath} clearHref={basePath} hidden={hidden} className="lg:shrink-0" />
      </Rise>

      {result.items.length === 0 ? (
        <>
          <p className="sr-only" aria-live="polite">
            {label("results", { n: result.total })}
          </p>
          <Rise className="relative mx-auto flex max-w-xl flex-col items-center gap-4 overflow-hidden py-14 text-center md:py-20">
            <span aria-hidden className="rwc-bignum pointer-events-none absolute top-0 left-1/2 -z-10 -translate-x-1/2 text-[min(46vw,18rem)] text-foreground/[0.05] select-none">
              0
            </span>
            <span className="rwc-bob flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground">{filtered || pageOut ? <SearchX className="size-8" /> : <PackageSearch className="size-8" />}</span>
            <h2 className="font-heading text-step-3 font-semibold text-balance">{empty.title}</h2>
            <p className="max-w-md text-muted-foreground">{empty.hint}</p>
            {empty.action && <CtaButton href={empty.action.href} label={empty.action.label} variant="outline" size="lg" className="mt-2" />}
          </Rise>
        </>
      ) : (
        <CatalogGrid
          editorial={cardStyle === "editorial"}
          gapClass={cardStyle === "editorial" ? "gap-x-4 gap-y-12 md:gap-x-8 md:gap-y-16" : cardStyle === "minimal" ? "gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-12" : "gap-3 sm:gap-4 md:gap-6"}
          header={
            <p className="rwc-num text-muted-foreground" aria-live="polite">
              {label("results", { n: result.total })}
              {result.pages > 1 && ` · ${label("page", { n: result.page })}/${result.pages}`}
            </p>
          }
          items={result.items.map((p, i) => ({ key: p.id, node: <ProductCardView product={p} style={cardStyle} index={startIndex + i} priority={i < 4} /> }))}
        />
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} className="mt-14 md:mt-20" />
    </section>
  );
}
