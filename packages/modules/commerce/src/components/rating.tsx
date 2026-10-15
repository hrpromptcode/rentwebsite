import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/** value is rating × 100 (e.g. 480 = 4.8). */
export function Stars({ value, count, size = "sm", showCount = true, className }: { value: number; count?: number; size?: "sm" | "md"; showCount?: boolean; className?: string }) {
  const rating = Math.max(0, Math.min(5, value / 100));
  if (!count && rating === 0) return null;
  const px = size === "md" ? "size-4.5" : "size-3.5";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label={`คะแนน ${rating.toFixed(1)} จาก 5`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - (i - 1)));
          return (
            <span key={i} className={cn("relative inline-block", px)}>
              <Star className={cn(px, "text-foreground/20")} fill="currentColor" strokeWidth={0} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={cn(px, "text-accent")} fill="currentColor" strokeWidth={0} />
              </span>
            </span>
          );
        })}
      </span>
      {showCount && (
        <span className={cn("tabular-nums text-muted-foreground", size === "md" ? "text-sm" : "text-xs")}>
          {rating.toFixed(1)}
          {count ? ` (${count})` : ""}
        </span>
      )}
    </span>
  );
}
