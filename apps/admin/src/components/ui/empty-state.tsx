import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Empty list / no results. A small drawn scene (two paper cards, a dashed orbit, the coral "online" dot) with the
 * section's icon on top — drawn with theme tokens only, gently floating under prefers-reduced-motion: no-preference.
 * Text (h3 title, description) is unchanged for QA (`getByText("ยังไม่มีลูกค้า")`).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("adm-empty flex flex-col items-center justify-center rounded-2xl text-center", compact ? "px-4 py-8" : "px-6 py-12 sm:py-14", className)}>
      <div className={cn("adm-empty-art", compact && "is-compact")} aria-hidden="true">
        <svg viewBox="0 0 160 120" focusable="false">
          <ellipse className="ea-shadow" cx="80" cy="110" rx="48" ry="5" />
          <circle className="ea-orbit" cx="80" cy="58" r="52" />
          <g className="ea-back">
            <rect x="38" y="24" width="84" height="62" rx="12" transform="rotate(-9 80 55)" />
          </g>
          <g className="ea-front">
            <rect x="42" y="30" width="84" height="62" rx="12" transform="rotate(5 84 61)" />
            <rect className="ea-line" x="56" y="70" width="36" height="5" rx="2.5" transform="rotate(5 84 61)" />
            <rect className="ea-line is-soft" x="56" y="79" width="52" height="5" rx="2.5" transform="rotate(5 84 61)" />
          </g>
          <circle className="ea-dot" cx="134" cy="22" r="4.5" />
          <circle className="ea-dot2" cx="24" cy="86" r="3" />
        </svg>
        <span className="adm-empty-icon">
          <Icon className="size-5" />
        </span>
      </div>
      <h3 className="mt-3 font-heading text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
