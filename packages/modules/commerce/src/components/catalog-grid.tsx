"use client";

import * as React from "react";
import { LayoutGroup } from "motion/react";
import { Grid2x2, Grid3x3 } from "lucide-react";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

type Density = "dense" | "loose";

const COLS: Record<Density, string> = {
  dense: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  loose: "grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3",
};

/**
 * Listing grid with FLIP reflow (§5.0): cards are keyed by product id inside a LayoutGroup, so a new sort order
 * (soft navigation from the filter form) or the density toggle glides every card to its new slot instead of jumping.
 * `header` (the live results line) sits left of the density toggle.
 */
export function CatalogGrid({ items, header, gapClass, editorial = false }: { items: Array<{ key: string; node: React.ReactNode }>; header?: React.ReactNode; gapClass: string; editorial?: boolean }) {
  const [density, setDensity] = React.useState<Density>("dense");
  const btn = (d: Density, Icon: typeof Grid2x2, text: string) => (
    <button
      type="button"
      onClick={() => setDensity(d)}
      aria-pressed={density === d}
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200",
        density === d ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4.5" aria-hidden />
    </button>
  );
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-foreground/15 pb-2 md:mb-10">
        {header}
        {items.length > 1 && (
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="มุมมองสินค้า">
            {btn("dense", Grid3x3, L.gridDense)}
            {btn("loose", Grid2x2, L.gridLoose)}
          </div>
        )}
      </div>
      <LayoutGroup>
        <Stagger className={cn("grid", COLS[density], gapClass, editorial && density === "dense" && "xl:[&>*:nth-child(4n+2)]:translate-y-[10%] xl:[&>*:nth-child(4n+4)]:translate-y-[5%] xl:pb-[5%]")} stagger={0.07}>
          {items.map((it) => (
            <StaggerItem key={it.key} layout="position" transition={{ layout: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }} className="min-w-0">
              {it.node}
            </StaggerItem>
          ))}
        </Stagger>
      </LayoutGroup>
    </div>
  );
}
