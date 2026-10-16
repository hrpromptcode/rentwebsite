import { Star } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/** 1–5 star rating display. `rating` is the integer number of stars (reviews.rating) or x100 average when `x100`. */
export function Stars({ rating, x100 = false, className, size = "size-4" }: { rating: number; x100?: boolean; className?: string; size?: string }) {
  const value = x100 ? rating / 100 : rating;
  const rounded = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(x100 ? 1 : 0)} จาก 5 ดาว`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= rounded ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} aria-hidden />
      ))}
    </span>
  );
}
