import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Tag } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img, Section, SectionHeading, type StorefrontCtx } from "@rentweb/storefront";
import type { categoryList } from "@rentweb/storefront/definitions";
import { cn } from "@rentweb/ui/lib/utils";
import { listCategories, type CategoryWithCount } from "../services/categories";
import { label } from "../labels";

type Props = z.output<typeof categoryList.schema>;

export function CategoryTiles({ categories, className }: { categories: CategoryWithCount[]; className?: string }) {
  const n = categories.length;
  return (
    <Stagger className={cn("grid grid-cols-2 gap-3 md:gap-5", n >= 4 ? "lg:grid-cols-4" : n === 3 ? "lg:grid-cols-3" : "", className)} stagger={0.08}>
      {categories.map((c, i) => (
        <StaggerItem key={c.id} className={cn("min-w-0", n === 3 && i === 0 && "col-span-2 lg:col-span-1")}>
          <Link
            href={`/collections/${encodeURIComponent(c.slug)}`}
            className={cn("group relative block overflow-hidden rounded-[var(--radius-xl)] bg-muted text-background", n === 3 && i === 0 ? "aspect-[16/9] lg:aspect-[4/5]" : "aspect-[4/5]")}
          >
            {c.image ? (
              <Img src={c.image} alt={c.name} className="absolute inset-0 size-full object-cover transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.06]" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary via-glow to-accent opacity-80" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-5">
              <div className="min-w-0">
                <h3 className="font-heading text-xl leading-tight font-semibold text-white md:text-2xl">{c.name}</h3>
                <p className="mt-1 text-xs text-white/75 md:text-sm">{label("items", { n: c.productCount })}</p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition group-hover:bg-white group-hover:text-black">
                <ArrowUpRight className="size-5" />
              </span>
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export function CategoryPills({ categories, activeSlug, allHref, allLabel, className }: { categories: CategoryWithCount[]; activeSlug?: string | null; allHref?: string; allLabel?: string; className?: string }) {
  const pill = "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition";
  return (
    <div className={cn("-mx-[clamp(1rem,4vw,2.5rem)] flex gap-2 overflow-x-auto px-[clamp(1rem,4vw,2.5rem)] pb-1 no-scrollbar", className)}>
      {allHref && (
        <Link href={allHref} className={cn(pill, !activeSlug ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
          <Tag className="size-4" />
          {allLabel ?? "ทั้งหมด"}
        </Link>
      )}
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/collections/${encodeURIComponent(c.slug)}`}
          className={cn(pill, activeSlug === c.slug ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          aria-current={activeSlug === c.slug ? "page" : undefined}
        >
          {c.name}
          <span className={cn("rounded-full px-1.5 text-xs tabular-nums", activeSlug === c.slug ? "bg-background/20" : "bg-muted text-muted-foreground")}>{c.productCount}</span>
        </Link>
      ))}
    </div>
  );
}

export function CategoryCircles({ categories, className }: { categories: CategoryWithCount[]; className?: string }) {
  return (
    <Stagger className={cn("flex gap-5 overflow-x-auto pb-2 no-scrollbar md:justify-center md:gap-10", className)} stagger={0.06}>
      {categories.map((c) => (
        <StaggerItem key={c.id} className="shrink-0">
          <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="group flex w-28 flex-col items-center gap-3 text-center md:w-36">
            <span className="relative block size-28 overflow-hidden rounded-full border-2 border-transparent bg-muted transition group-hover:border-primary md:size-36">
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
  const categories = await withTenant(getDb(), tenantId, (tx) => listCategories(tx, tenantId, { limit: p.limit }));
  if (!categories.length) return null;
  return (
    <Section id={id} className={p.variant === "pills" ? "!py-8 md:!py-12" : undefined}>
      <div className="container-x">
        <SectionHeading heading={p.heading} align="left" className={p.variant === "pills" ? "mb-5 md:mb-6" : undefined} />
        {p.variant === "tiles" && <CategoryTiles categories={categories} />}
        {p.variant === "pills" && <CategoryPills categories={categories} />}
        {p.variant === "circles" && <CategoryCircles categories={categories} />}
      </div>
    </Section>
  );
}
