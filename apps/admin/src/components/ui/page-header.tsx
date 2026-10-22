import * as React from "react";
import { ThaiWrap } from "@rentweb/ui/motion/thai-wrap";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Page title block used by every admin screen. Anuphan title with server-side Thai word wrapping (no mid-word breaks),
 * a small eyebrow, a description and right-aligned actions. Enters with a short staggered rise (CSS, only under
 * prefers-reduced-motion: no-preference). Structure is load-bearing for QA: the <h1>'s parent also holds the
 * description (journeys read status badges via `h1 → ..`).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("adm-page-head flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="adm-eyebrow adm-rise mb-2">{eyebrow}</p>}
        <h1 className="adm-title adm-rise font-heading" style={{ "--d": "40ms" } as React.CSSProperties}>
          {typeof title === "string" ? <ThaiWrap text={title} /> : title}
        </h1>
        {description && (
          <p className="adm-rise mt-2 max-w-2xl text-sm text-pretty text-muted-foreground" style={{ "--d": "90ms" } as React.CSSProperties}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="adm-rise flex flex-wrap items-center gap-2 sm:shrink-0" style={{ "--d": "120ms" } as React.CSSProperties}>
          {actions}
        </div>
      )}
    </div>
  );
}

export function SectionTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="font-heading text-base font-semibold tracking-tight sm:text-lg">{children}</h2>
      {action}
    </div>
  );
}
