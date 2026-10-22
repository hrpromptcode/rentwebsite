"use client";

import * as React from "react";
import Link from "next/link";
import Form from "next/form";
import { AnimatePresence, motion } from "motion/react";
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

/**
 * GET form (next/form: soft navigation, so the grid re-orders with a FLIP instead of reloading): search with a drawn
 * focus line, sort pill (auto-submits), price range drawer. Keeps the URL shareable; works without JS.
 */
export function CatalogFilters({ query, action, clearHref, hidden = {}, className }: { query: CatalogQuery; action: string; clearHref: string; hidden?: Record<string, string | undefined>; className?: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [showPrice, setShowPrice] = React.useState(!!(query.min || query.max));
  const active = !!(query.q || query.min || query.max || query.sort);
  // The sort select auto-submits once JS runs; the fallback submit below only exists for no-JS visitors (RESPONSIVE_B2-09).
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  return (
    <Form ref={formRef} action={action} scroll={false} className={cn("grid gap-3", className)} role="search">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="rwc-field-line relative min-w-0 flex-1 basis-60 lg:w-60 lg:flex-none lg:basis-auto">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-0 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder={L.searchPlaceholder}
            aria-label={L.search}
            enterKeyHint="search"
            className="h-12 rounded-none border-0 border-b border-foreground/25 bg-transparent pr-2 pl-8 text-base shadow-none focus-visible:border-foreground/25 focus-visible:ring-0 md:text-base"
          />
        </div>
        <label className="relative inline-flex h-11 items-center">
          <ArrowUpDown aria-hidden className="pointer-events-none absolute left-4 size-4 text-muted-foreground" />
          <span className="sr-only">{L.sort}</span>
          <select name="sort" defaultValue={query.sort ?? ""} onChange={() => formRef.current?.requestSubmit()} className="rwc-select text-foreground outline-none focus-visible:border-ring">
            <option value="">{L.sort}</option>
            {PRODUCT_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground">
            <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <Button type="button" variant={showPrice ? "secondary" : "outline"} className="h-11 rounded-full px-4" onClick={() => setShowPrice((v) => !v)} aria-expanded={showPrice}>
          <SlidersHorizontal className="size-4" /> {L.priceRange}
        </Button>
        {active && (
          <Button asChild variant="ghost" className="h-11 rounded-full px-3">
            <Link href={clearHref} scroll={false}>
              <X className="size-4" /> {L.clearFilters}
            </Link>
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {showPrice && (
          <motion.div key="price" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <Input name="min" type="number" inputMode="numeric" min={0} defaultValue={query.min ?? ""} placeholder={`${L.priceMin} (฿)`} aria-label={L.priceMin} className="h-11 w-36 rounded-full px-4" />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <Input name="max" type="number" inputMode="numeric" min={0} defaultValue={query.max ?? ""} placeholder={`${L.priceMax} (฿)`} aria-label={L.priceMax} className="h-11 w-36 rounded-full px-4" />
              <Button type="submit" className="h-11 rounded-full px-5">
                {L.apply}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showPrice && !hydrated && (
        <button type="submit" className="sr-only focus:not-sr-only focus:inline-flex focus:h-11 focus:w-fit focus:items-center focus:rounded-md focus:border focus:border-input focus:px-4 focus:text-sm">
          {L.apply}
        </button>
      )}
    </Form>
  );
}
