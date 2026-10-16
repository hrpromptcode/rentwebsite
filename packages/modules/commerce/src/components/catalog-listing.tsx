import * as React from "react";
import Link from "next/link";
import { PackageSearch, SearchX } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import type { CategoryWithCount } from "../services/categories";
import type { ProductListResult, ProductSort } from "../services/products";
import { L, label } from "../labels";
import { PageHeader, type Crumb } from "./page-header";
import { CategoryPills } from "../sections/category-list";
import { CatalogFilters, type CatalogQuery } from "./catalog-filters";
import { ProductGridView } from "./product-grid-view";
import { Pagination } from "./pagination";
import type { CardStyle } from "./product-card";

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

/** Card style that feels native to the tenant's preset: editorial presets get the hover image swap + tilt. */
export function cardStyleForPreset(presetKey: string | undefined): CardStyle {
  return presetKey === "aurora" || presetKey === "midnight" || presetKey === "quartz" ? "hover-swap" : "standard";
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

export function CatalogListing({ title, eyebrow, description, crumbs, categories, activeSlug, basePath, query, result, cardStyle = "standard", columns = 4 }: CatalogListingProps) {
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

  return (
    <section className="container-x pb-16 md:pb-24">
      <PageHeader eyebrow={eyebrow} title={title} description={description} crumbs={crumbs} />

      {categories.length > 0 && (
        <Reveal delay={0.1}>
          <CategoryPills categories={categories} activeSlug={activeSlug} allHref="/products" allLabel={L.allCategories} className="mb-5" />
        </Reveal>
      )}

      <Reveal delay={0.15} className="mb-6 flex flex-col gap-3 md:mb-8">
        <CatalogFilters query={query} clearHref={basePath} hidden={hidden} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {label("results", { n: result.total })}
          {result.pages > 1 && ` · ${label("page", { n: result.page })}/${result.pages}`}
        </p>
      </Reveal>

      {result.items.length === 0 ? (
        <Reveal className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">{filtered || pageOut ? <SearchX className="size-7" /> : <PackageSearch className="size-7" />}</span>
          <h2 className="font-heading text-2xl font-semibold">{empty.title}</h2>
          <p className="text-muted-foreground">{empty.hint}</p>
          {empty.action && (
            <Button asChild variant="outline" size="lg" className="mt-2">
              <Link href={empty.action.href}>{empty.action.label}</Link>
            </Button>
          )}
        </Reveal>
      ) : (
        <ProductGridView products={result.items} columns={columns} style={cardStyle} startIndex={(result.page - 1) * result.perPage} />
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} className="mt-12 md:mt-16" />
    </section>
  );
}
