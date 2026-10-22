import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";
import { RestaurantStyles } from "./styles";

/**
 * Calm two-column gate for the operational lookup pages (/orders/r/lookup, a locked order or reservation): the page
 * title + how-it-works notes on the left, the small form card on the right (phones: title → form → notes).
 * Server component; theme tokens only.
 */
export function AccessGate({
  eyebrow,
  icon,
  title,
  lead,
  badge,
  notes,
  children,
  className,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  lead: string;
  /** the locked number, shown on the night band above the form */
  badge?: { label: string; value: string };
  notes: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("container-x pt-8 pb-20 md:pt-14 md:pb-28", className)}>
      <RestaurantStyles />
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-10">
        <header className="rr-fade lg:col-span-6 lg:row-start-1">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em] text-primary-ink">
            {icon} {eyebrow}
          </p>
          <h1 className="mt-3 font-heading text-[clamp(2.5rem,1.7rem+3vw,4.5rem)] leading-[1.2] font-semibold text-balance">{title}</h1>
          <p className="mt-4 max-w-lg text-step-0 leading-relaxed text-muted-foreground">{lead}</p>
        </header>

        <div className="rr-fade-2 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-center">
          <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card shadow-[0_30px_70px_-45px_color-mix(in_oklab,var(--foreground)_60%,transparent)]">
            {badge && (
              <div className="rr-night flex items-center justify-between gap-4 px-6 py-5 md:px-8">
                <span className="rr-dim text-sm">{badge.label}</span>
                <span className="rr-num font-heading text-2xl font-semibold">{badge.value}</span>
              </div>
            )}
            <div className="p-6 md:p-8">{children}</div>
          </div>
        </div>

        <ol className="rr-fade-3 grid gap-0 self-start border-t border-border lg:col-span-6 lg:row-start-2">
          {notes.map((n, i) => (
            <li key={n} className="flex gap-5 border-b border-border py-4">
              <span aria-hidden className="rr-mono pt-1 text-primary-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground md:text-base">{n}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
