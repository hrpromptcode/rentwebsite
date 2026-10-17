import * as React from "react";
import Link from "next/link";
import { Badge } from "@rentweb/ui/components/badge";
import { TiltCard } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { productBadge, type ProductCard as ProductCardData } from "../services/products";
import { L, label } from "../labels";
import { Price, salePercent } from "./price";
import { Stars } from "./rating";

export type CardStyle = "standard" | "editorial" | "minimal" | "hover-swap";

function CardBadges({ p, className }: { p: ProductCardData; className?: string }) {
  const kind = productBadge(p);
  const pct = salePercent(p.price, p.compareAtPrice);
  if (!kind && !pct) return null;
  return (
    <div className={cn("pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5", className)}>
      {kind === "soldout" && <Badge className="bg-foreground text-background">{L.badgeSoldOut}</Badge>}
      {kind === "best" && <Badge variant="accent">{L.badgeBest}</Badge>}
      {kind === "new" && <Badge>{L.badgeNew}</Badge>}
      {kind === "preorder" && <Badge variant="secondary">{L.preorder}</Badge>}
      {pct && kind !== "soldout" && <Badge variant="destructive">{label("badgeSale", { pct })}</Badge>}
    </div>
  );
}

function Picture({ p, aspect, swap, priority }: { p: ProductCardData; aspect: string; swap?: boolean; priority?: boolean }) {
  const first = p.images[0];
  const second = swap ? p.images[1] : undefined;
  const soldOut = p.stock !== null && p.stock <= 0;
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", aspect)}>
      <Img
        src={first?.url ?? ""}
        alt={first?.alt ?? p.name}
        priority={priority}
        className={cn(
          "absolute inset-0 size-full object-cover transition-[transform,opacity] duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]",
          second && "group-hover:opacity-0",
          soldOut && "grayscale",
        )}
      />
      {second && (
        <Img
          src={second.url}
          alt={second.alt ?? p.name}
          className="absolute inset-0 size-full scale-[1.04] object-cover opacity-0 transition-opacity duration-700 ease-[var(--ease-out-expo)] group-hover:opacity-100"
        />
      )}
      <CardBadges p={p} />
    </div>
  );
}

export function ProductCardView({ product: p, style = "standard", index = 0, priority = false, className }: { product: ProductCardData; style?: CardStyle; index?: number; priority?: boolean; className?: string }) {
  const href = `/products/${encodeURIComponent(p.slug)}`;

  if (style === "editorial") {
    return (
      <article className={cn("group relative", className)}>
        <Link href={href} className="block focus-visible:outline-none">
          <div className="relative">
            <Picture p={p} aspect="aspect-[3/4] rounded-[var(--radius-lg)]" swap priority={priority} />
            <span className="heading-display absolute right-3 bottom-3 text-5xl font-semibold text-background mix-blend-difference md:text-6xl" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4 border-t pt-3">
            <div className="min-w-0">
              <h3 className="font-heading text-base leading-snug font-semibold tracking-tight uppercase md:text-lg">{p.name}</h3>
              {p.shortDescription && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{p.shortDescription}</p>}
            </div>
            <Price amount={p.price} compareAt={p.compareAtPrice} className="shrink-0 justify-end text-right" />
          </div>
        </Link>
      </article>
    );
  }

  if (style === "minimal") {
    return (
      <article className={cn("group relative", className)}>
        <Link href={href} className="block">
          <Picture p={p} aspect="aspect-square rounded-[var(--radius-lg)]" priority={priority} />
          <div className="mt-3 flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</h3>
            <Price amount={p.price} compareAt={p.compareAtPrice} size="sm" className="shrink-0 justify-end" />
          </div>
        </Link>
      </article>
    );
  }

  const inner = (
    <Link href={href} className="card group block h-full overflow-hidden">
      <Picture p={p} aspect="aspect-[4/5]" swap={style === "hover-swap"} priority={priority} />
      <div className="p-4">
        {/* 2 lines + the Thai clamp padding (apps/web globals.css) so 1- and 2-line titles keep equal card heights */}
        <h3 className="line-clamp-2 min-h-[calc(2.75rem+0.2em)] font-medium leading-snug">{p.name}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Price amount={p.price} compareAt={p.compareAtPrice} />
          <Stars value={p.ratingAvg} count={p.ratingCount} />
        </div>
      </div>
    </Link>
  );

  if (style === "hover-swap") {
    return (
      <article className={cn("relative h-full", className)}>
        <TiltCard max={4} className="h-full rounded-[var(--radius-xl)]">
          {inner}
        </TiltCard>
      </article>
    );
  }
  return <article className={cn("relative h-full", className)}>{inner}</article>;
}
