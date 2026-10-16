"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { MenuItemData } from "../services/menu";
import { L } from "../labels";
import { SpicyDots, TagBadges } from "./badges";

/** Tap-anywhere menu card (the whole card is the 44px+ target). */
export function ItemCard({ item, onSelect, className }: { item: MenuItemData; onSelect: (item: MenuItemData) => void; className?: string }) {
  const soldOut = item.soldOut;
  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect(item)}
      data-item-id={item.id}
      aria-label={`${item.name} ${thb(item.price)}${soldOut ? ` (${L.soldOut})` : ""}`}
      className={cn(
        "card group flex w-full gap-3 p-3 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 md:gap-4 md:p-4",
        className,
      )}
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-muted md:size-28">
        {item.image ? (
          <img src={item.image} alt={item.name} loading="lazy" decoding="async" className={cn("size-full object-cover transition duration-700 group-hover:scale-105", soldOut && "grayscale")} />
        ) : null}
        {soldOut && <span className="absolute inset-0 flex items-center justify-center bg-black/55 px-2 text-center text-xs font-semibold text-white">{L.soldOut}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-heading text-base leading-snug font-semibold text-balance md:text-lg">{item.name}</h3>
        {item.nameEn && <p className="truncate text-xs text-muted-foreground">{item.nameEn}</p>}
        {item.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">{item.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <TagBadges tags={item.tags} />
            <SpicyDots level={item.spicyLevel} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-baseline gap-1.5">
              {item.compareAtPrice && item.compareAtPrice > item.price && <span className="text-xs text-muted-foreground line-through">{thb(item.compareAtPrice)}</span>}
              <span className="font-semibold tabular-nums">{thb(item.price)}</span>
            </span>
            {!soldOut && (
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition group-hover:scale-105" aria-hidden>
                <Plus className="size-4" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
