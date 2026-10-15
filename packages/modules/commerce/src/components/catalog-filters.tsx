"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import type { ProductSort } from "../services/products";
import { L } from "../labels";

// Keep this a type-only dependency on services: this file ships to the browser and must never pull in @rentweb/db.
const PRODUCT_SORTS: ProductSort[] = ["newest", "price_asc", "price_desc", "best_selling"];

export interface CatalogQuery {
  q?: string;
  sort?: ProductSort | null;
  /** baht (not satang) for the URL */
  min?: number | null;
  max?: number | null;
}

const SORT_LABEL: Record<ProductSort, string> = { newest: L.sortNewest, price_asc: L.sortPriceAsc, price_desc: L.sortPriceDesc, best_selling: L.sortBestSelling };

/** GET form: search, sort (auto-submits), price range. Keeps the URL shareable. */
export function CatalogFilters({ query, clearHref, hidden = {}, className }: { query: CatalogQuery; clearHref: string; hidden?: Record<string, string | undefined>; className?: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [showPrice, setShowPrice] = React.useState(!!(query.min || query.max));
  const active = !!(query.q || query.min || query.max || query.sort);
  const inputClass = "h-11";

  return (
    <form ref={formRef} method="get" className={cn("grid gap-3", className)} role="search">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={query.q ?? ""} placeholder={L.searchPlaceholder} aria-label={L.search} className={cn(inputClass, "pl-10")} enterKeyHint="search" />
        </div>
        <label className="relative inline-flex h-11 items-center">
          <ArrowUpDown className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <span className="sr-only">{L.sort}</span>
          <select
            name="sort"
            defaultValue={query.sort ?? ""}
            onChange={() => formRef.current?.requestSubmit()}
            className="h-11 appearance-none rounded-md border border-input bg-background pr-9 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <option value="">{L.sort}</option>
            {PRODUCT_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3 size-4 text-muted-foreground">
            <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <Button type="button" variant={showPrice ? "secondary" : "outline"} className="h-11" onClick={() => setShowPrice((v) => !v)} aria-expanded={showPrice}>
          <SlidersHorizontal className="size-4" /> {L.priceRange}
        </Button>
        {active && (
          <Button asChild variant="ghost" className="h-11">
            <Link href={clearHref}>
              <X className="size-4" /> {L.clearFilters}
            </Link>
          </Button>
        )}
      </div>
      {showPrice && (
        <div className="flex flex-wrap items-center gap-2">
          <Input name="min" type="number" inputMode="numeric" min={0} defaultValue={query.min ?? ""} placeholder={`${L.priceMin} (฿)`} aria-label={L.priceMin} className={cn(inputClass, "w-36")} />
          <span className="text-muted-foreground">–</span>
          <Input name="max" type="number" inputMode="numeric" min={0} defaultValue={query.max ?? ""} placeholder={`${L.priceMax} (฿)`} aria-label={L.priceMax} className={cn(inputClass, "w-36")} />
          <Button type="submit" className="h-11">
            {L.apply}
          </Button>
        </div>
      )}
      {!showPrice && <button type="submit" className="sr-only">{L.apply}</button>}
    </form>
  );
}
