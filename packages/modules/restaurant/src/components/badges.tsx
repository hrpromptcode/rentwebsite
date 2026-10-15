import * as React from "react";
import { Flame } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";

/** Chili icons for spicy level 1-3 (lucide only, no emoji). */
export function SpicyDots({ level, className }: { level: number; className?: string }) {
  if (!level || level <= 0) return null;
  const n = Math.min(3, level);
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-red-600 dark:text-red-400", className)} aria-label={`เผ็ดระดับ ${n}`} title={`เผ็ดระดับ ${n}`}>
      {Array.from({ length: n }).map((_, i) => (
        <Flame key={i} className="size-3.5 fill-current" aria-hidden />
      ))}
    </span>
  );
}

const TAG_STYLE: Record<string, { variant: "default" | "soft" | "success" | "warning" | "muted" | "accent"; className?: string }> = {
  "แนะนำ": { variant: "default" },
  "เผ็ด": { variant: "warning", className: "bg-red-500/12 text-red-700 dark:text-red-300" },
  "มังสวิรัติ": { variant: "success" },
  "ใหม่": { variant: "soft" },
  "ขายดี": { variant: "accent" },
};

/** Menu tag chips: แนะนำ / เผ็ด / มังสวิรัติ / ใหม่ … */
export function TagBadges({ tags, max = 3, className }: { tags: string[]; max?: number; className?: string }) {
  if (!tags?.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {tags.slice(0, max).map((t) => {
        const s = TAG_STYLE[t] ?? { variant: "muted" as const };
        return (
          <Badge key={t} variant={s.variant} className={cn("px-2 py-0 text-[11px] leading-5", s.className)}>
            {t}
          </Badge>
        );
      })}
    </span>
  );
}
