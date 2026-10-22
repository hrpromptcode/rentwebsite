import * as React from "react";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { ProductCard as ProductCardData } from "../services/products";
import { ProductCardView, type CardStyle } from "./product-card";

export const GRID_COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
};

/** Gaps + the editorial "staggered columns" offset (even columns drop by a fraction of their own height). */
export function gridClass(style: CardStyle, columns: 2 | 3 | 4) {
  if (style === "editorial") {
    return cn(
      "gap-x-4 gap-y-12 md:gap-x-8 md:gap-y-20",
      columns === 4 && "pb-[6%] md:[&>*:nth-child(3n+2)]:translate-y-[12%] xl:[&>*:nth-child(3n+2)]:translate-y-0 xl:[&>*:nth-child(4n+2)]:translate-y-[14%] xl:[&>*:nth-child(4n+4)]:translate-y-[7%]",
      columns === 3 && "pb-[6%] md:[&>*:nth-child(3n+2)]:translate-y-[14%]",
      columns === 2 && "md:[&>*:nth-child(even)]:translate-y-[10%]",
    );
  }
  if (style === "minimal") return "gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-12";
  return "gap-3 sm:gap-4 md:gap-6";
}

/** Responsive, stagger-revealed product grid (home sections, related products). */
export function ProductGridView({
  products,
  columns = 4,
  style = "standard",
  startIndex = 0,
  className,
  priorityCount = 4,
  quickAdd = true,
}: {
  products: ProductCardData[];
  columns?: 2 | 3 | 4;
  style?: CardStyle;
  startIndex?: number;
  className?: string;
  priorityCount?: number;
  quickAdd?: boolean;
}) {
  if (!products.length) return null;
  return (
    <Stagger className={cn("grid", GRID_COLS[columns], gridClass(style, columns), className)} stagger={0.09}>
      {products.map((p, i) => (
        <StaggerItem key={p.id} className="min-w-0">
          <ProductCardView product={p} style={style} index={startIndex + i} priority={i < priorityCount} quickAdd={quickAdd} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
