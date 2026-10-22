import * as React from "react";
import Link from "next/link";
import { TiltCard } from "@rentweb/ui/motion";
import { ThaiName } from "./thai-name";
import { Img } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { productBadge, type ProductCard as ProductCardData } from "../services/products";
import { L, label } from "../labels";
import { Price, salePercent } from "./price";
import { Stars } from "./rating";
import { QuickAdd } from "./quick-add";
import { CommerceStyles } from "./commerce-styles";

export type CardStyle = "standard" | "editorial" | "minimal" | "hover-swap";

const pad2 = (n: number) => String(n).padStart(2, "0");

function CardBadges({ p, className }: { p: ProductCardData; className?: string }) {
  const kind = productBadge(p);
  const pct = salePercent(p.price, p.compareAtPrice);
  if (!kind && !pct) return null;
  return (
    <div className={cn("rwc-badges pointer-events-none absolute top-3 left-3 z-[2] flex flex-col items-start gap-1.5", className)}>
      {kind === "soldout" && (
        <span className="rwc-badge" data-kind="soldout">
          {L.badgeSoldOut}
        </span>
      )}
      {kind === "best" && (
        <span className="rwc-badge" data-kind="best">
          {L.badgeBest}
        </span>
      )}
      {kind === "new" && <span className="rwc-badge">{L.badgeNew}</span>}
      {kind === "preorder" && <span className="rwc-badge">{L.preorder}</span>}
      {pct && kind !== "soldout" && (
        <span className="rwc-badge" data-kind="sale">
          {label("badgeSale", { pct })}
        </span>
      )}
    </div>
  );
}

/** Photo frame: primary photo zooms, the 2nd photo wipes in from the bottom on hover / focus (image swap). */
function Media({ p, priority, className, children }: { p: ProductCardData; priority?: boolean; className?: string; children?: React.ReactNode }) {
  const first = p.images[0];
  const second = p.images[1];
  return (
    <div className={cn("rwc-media", className)}>
      {first?.url ? (
        <Img src={first.url} alt={first.alt ?? p.name} priority={priority} className="rwc-img" />
      ) : (
        // no photo yet: a typographic placeholder in the theme colours instead of an empty block
        <div role="img" aria-label={p.name} className="rwc-img rwc-noimg">
          <span aria-hidden className="heading-display">{Array.from(p.name.trim())[0] ?? "·"}</span>
        </div>
      )}
      {second && <Img src={second.url} alt="" className="rwc-img2" />}
      <CardBadges p={p} />
      {children}
    </div>
  );
}

/**
 * Product card in the tenant's card language (§2.5, §5.1, §5.7). Every card is an `<article>` whose first
 * `span.font-semibold.tabular-nums` is the selling price (QA journeys read listing prices that way).
 * - editorial: frameless magazine card, mono index, italic accent numeral, image wipe-swap, quick-add pill
 * - hover-swap: framed card with ≤5° 3D tilt + glare and the image wipe-swap
 * - standard: framed card (sticker card with spring wobble when the theme card shape is "brutal")
 * - minimal: square photo, name + price
 * Server component. Titles go through ThaiName (ThaiWrap + module glue + phrase units; greedy wrap so lines break
 * between phrases, not mid-phrase as text-balance chose); segmentation must not rerun on the client.
 */
export function ProductCardView({
  product: p,
  style = "standard",
  index = 0,
  priority = false,
  quickAdd = true,
  className,
}: {
  product: ProductCardData;
  style?: CardStyle;
  index?: number;
  priority?: boolean;
  quickAdd?: boolean;
  className?: string;
}) {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const soldOut = p.stock !== null && p.stock <= 0;
  const quick = quickAdd && !soldOut ? <QuickAdd productId={p.id} name={p.name} href={href} needsOptions={p.hasVariants} /> : null;
  const common = { "data-soldout": soldOut ? "" : undefined, "data-odd": index % 2 ? "" : undefined };

  if (style === "editorial") {
    return (
      <article className={cn("rwc-card group", className)} data-style="editorial" data-ratio="3/4" {...common}>
        <CommerceStyles />
        <Link href={href} className="block">
          <Media p={p} priority={priority}>
            <span aria-hidden className="rwc-bignum pointer-events-none absolute top-[4cqw] right-[5cqw] z-[1] text-[17cqw] text-white mix-blend-difference transition-[opacity,translate] duration-700 group-hover:-translate-y-2 group-hover:opacity-0">
              {pad2(index + 1)}
            </span>
          </Media>
          <div className="mt-4 grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3">
            <span aria-hidden className="rwc-no text-muted-foreground">
              {pad2(index + 1)}
            </span>
            <h3 className="rwc-title font-heading text-base leading-snug font-medium [text-wrap:wrap] md:text-[1.05rem] @max-[17rem]:col-span-2">
              <ThaiName text={p.name} phrases />
            </h3>
            <Price amount={p.price} compareAt={p.compareAtPrice} size="sm" className="shrink-0 justify-end text-right @max-[17rem]:col-start-2 @max-[17rem]:mt-1 @max-[17rem]:justify-start @max-[17rem]:text-left" />
          </div>
          <div aria-hidden className="rwc-line mt-3" />
          {p.shortDescription && <p className="mt-2.5 line-clamp-1 pl-[2.25rem] text-sm text-muted-foreground @max-[17rem]:hidden">{p.shortDescription}</p>}
        </Link>
        {quick}
      </article>
    );
  }

  if (style === "minimal") {
    return (
      <article className={cn("rwc-card group", className)} data-style="minimal" data-ratio="1/1" {...common}>
        <CommerceStyles />
        <Link href={href} className="block">
          <Media p={p} priority={priority} className="rounded-[var(--radius-lg)]" />
          <div className="mt-3 flex items-start justify-between gap-3">
            <h3 className="rwc-title line-clamp-2 text-sm leading-snug font-medium [text-wrap:wrap]">
              <ThaiName text={p.name} phrases />
            </h3>
            <Price amount={p.price} compareAt={p.compareAtPrice} size="sm" className="shrink-0 justify-end" />
          </div>
        </Link>
        {quick}
      </article>
    );
  }

  const inner = (
    <>
      <Link href={href} className="card rwc-chrome">
        <Media p={p} priority={priority} />
        <div className="flex flex-1 flex-col p-4">
          {/* 2 lines + the Thai clamp padding (apps/web globals.css) so 1- and 2-line titles keep equal card heights */}
          <h3 className="rwc-title line-clamp-2 min-h-[calc(2.75rem+0.2em)] leading-snug font-medium [text-wrap:wrap]">
            <ThaiName text={p.name} phrases />
          </h3>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2">
            <Price amount={p.price} compareAt={p.compareAtPrice} className="rwc-price-accent" />
            <Stars value={p.ratingAvg} count={p.ratingCount} />
          </div>
        </div>
      </Link>
      {quick}
    </>
  );

  if (style === "hover-swap") {
    return (
      <article className={cn("rwc-card group h-full", className)} data-style="hover-swap" {...common}>
        <CommerceStyles />
        <TiltCard max={5} className="relative h-full rounded-[var(--radius-xl)]">
          {inner}
        </TiltCard>
      </article>
    );
  }
  return (
    <article className={cn("rwc-card group h-full", className)} data-style="standard" {...common}>
      <CommerceStyles />
      {inner}
    </article>
  );
}
