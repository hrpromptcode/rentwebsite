import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

function range(page: number, pages: number): Array<number | "…"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

const cell = "inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] text-sm font-medium transition";

export function Pagination({ page, pages, hrefFor, className }: { page: number; pages: number; hrefFor: (page: number) => string; className?: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="pagination" className={cn("flex items-center justify-center gap-1", className)}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} aria-label={L.prev} className={cn(cell, "hover:bg-muted")}>
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <span className={cn(cell, "opacity-30")} aria-disabled>
          <ChevronLeft className="size-5" />
        </span>
      )}
      {range(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className={cn(cell, "text-muted-foreground")}>
            …
          </span>
        ) : (
          <Link key={p} href={hrefFor(p)} aria-current={p === page ? "page" : undefined} className={cn(cell, p === page ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {p}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={hrefFor(page + 1)} aria-label={L.next} className={cn(cell, "hover:bg-muted")}>
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className={cn(cell, "opacity-30")} aria-disabled>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}
