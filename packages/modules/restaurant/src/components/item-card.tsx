"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { MenuItemData } from "../services/menu";
import { L } from "../labels";
import { SpicyDots, TagBadges } from "./badges";

export type ItemCardVariant = "row" | "card";

/**
 * Tap-anywhere menu item (the whole item is the 44px+ target; aria-label = name + price).
 * - `row`: editorial menu-book line for /menu — round plate, name · dotted leader · price, English name, description.
 * - `card`: compact card for the operational flows (/order, /t/[qr]) — fast to scan and thumb-friendly.
 */
export function ItemCard({
  item,
  onSelect,
  onPreview,
  variant = "card",
  className,
}: {
  item: MenuItemData;
  onSelect: (item: MenuItemData) => void;
  /** hover / focus → the sticky plate preview on /menu */
  onPreview?: (item: MenuItemData) => void;
  variant?: ItemCardVariant;
  className?: string;
}) {
  const soldOut = item.soldOut;
  const price = (
    <span className="flex shrink-0 items-baseline gap-1.5">
      {item.compareAtPrice && item.compareAtPrice > item.price && <span className="rr-price text-xs text-muted-foreground line-through">{thb(item.compareAtPrice)}</span>}
      <span className="rr-price font-semibold">{thb(item.price)}</span>
    </span>
  );
  const common = {
    type: "button" as const,
    disabled: soldOut,
    onClick: () => onSelect(item),
    onPointerEnter: onPreview ? () => onPreview(item) : undefined,
    onFocus: onPreview ? () => onPreview(item) : undefined,
    "data-item-id": item.id,
    "aria-label": `${item.name} ${thb(item.price)}${soldOut ? ` (${L.soldOut})` : ""}`,
  };

  if (variant === "row") {
    return (
      <button
        {...common}
        className={cn(
          "rr-row group flex w-full items-start gap-4 rounded-[var(--radius-xl)] border border-transparent px-3 py-4 text-left outline-none hover:border-border hover:bg-card hover:shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--foreground)_45%,transparent)] focus-visible:border-border focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 md:gap-5 md:px-4",
          className,
        )}
      >
        <span className="rr-thumb relative block size-20 shrink-0 overflow-hidden rounded-full bg-muted shadow-[0_14px_28px_-16px_color-mix(in_oklab,var(--foreground)_55%,transparent)] ring-4 ring-card md:size-24">
          {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" className={cn("size-full object-cover", soldOut && "grayscale")} /> : null}
          {soldOut && <span className="absolute inset-0 flex items-center justify-center bg-black/55 px-1 text-center text-[11px] font-semibold text-white">{L.soldOut}</span>}
        </span>
        <span className="flex min-w-0 flex-1 flex-col pt-1">
          <span className="flex items-baseline gap-3">
            <h3 className="font-heading text-lg leading-snug font-semibold text-balance md:text-xl">{item.name}</h3>
            <span aria-hidden className="rr-leader hidden sm:block" />
            <span className="hidden sm:flex">{price}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-primary-ink sm:hidden">
              {price}
              {!soldOut && (
                <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="size-3" />
                </span>
              )}
            </span>
            {item.nameEn && <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">{item.nameEn}</span>}
            <SpicyDots level={item.spicyLevel} />
            <TagBadges tags={item.tags.filter((t) => t !== "เผ็ด")} />
          </span>
          {item.description && <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.description}</span>}
        </span>
        {!soldOut && (
          <span aria-hidden className="rr-add mt-1 hidden size-10 shrink-0 items-center justify-center self-center rounded-full border sm:flex border-border bg-background text-primary group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
            <Plus className="size-4" />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      {...common}
      className={cn(
        "rr-row card group flex w-full gap-3 p-3 text-left outline-none hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 md:gap-4 md:p-4",
        className,
      )}
    >
      <span className="rr-thumb relative block size-24 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-muted md:size-28">
        {item.image ? <img src={item.image} alt={item.name} loading="lazy" decoding="async" className={cn("size-full object-cover", soldOut && "grayscale")} /> : null}
        {soldOut && <span className="absolute inset-0 flex items-center justify-center bg-black/55 px-2 text-center text-xs font-semibold text-white">{L.soldOut}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-heading text-base leading-snug font-semibold text-balance md:text-lg">{item.name}</h3>
        {item.nameEn && <span className="truncate text-xs text-muted-foreground">{item.nameEn}</span>}
        {item.description && <span className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">{item.description}</span>}
        <span className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <TagBadges tags={item.tags} />
            <SpicyDots level={item.spicyLevel} />
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {price}
            {!soldOut && (
              <span className="rr-add flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm" aria-hidden>
                <Plus className="size-4" />
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
