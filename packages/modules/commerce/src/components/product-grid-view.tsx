import * as React from "react";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { ProductCard as ProductCardData } from "../services/products";
import { ProductCardView, type CardStyle } from "./product-card";

const COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
};

/** Responsive, stagger-revealed product grid. Editorial style offsets every other card on md+. */
export function ProductGridView({
  products,
  columns = 4,
  style = "standard",
  startIndex = 0,
  className,
  priorityCount = 4,
}: {
  products: ProductCardData[];
  columns?: 2 | 3 | 4;
  style?: CardStyle;
  startIndex?: number;
  className?: string;
  priorityCount?: number;
}) {
  if (!products.length) return null;
  return (
    <Stagger
      className={cn(
        "grid",
        COLS[columns],
        style === "editorial" ? "gap-x-4 gap-y-10 md:gap-x-8 md:gap-y-16 md:[&>*:nth-child(even)]:translate-y-10" : "gap-4 md:gap-6",
        className,
      )}
      stagger={0.06}
    >
      {products.map((p, i) => (
        <StaggerItem key={p.id} className="min-w-0">
          <ProductCardView product={p} style={style} index={startIndex + i} priority={i < priorityCount} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
