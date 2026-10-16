import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Reveal, TextReveal } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="breadcrumb" className={cn("flex min-w-0 items-center gap-1 overflow-x-auto text-xs text-muted-foreground no-scrollbar md:text-sm", className)}>
      {/* RA-10: crumb links are 44px tall touch targets on phones */}
      {items.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
          {c.href && i < items.length - 1 ? (
            <Link href={c.href} className="inline-flex min-h-11 shrink-0 items-center transition hover:text-foreground md:min-h-0 md:py-1">
              {c.label}
            </Link>
          ) : (
            <span className="truncate py-1 text-foreground">{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

/** Oversized page title in the tenant display font (reads as magazine in aurora, bubbly in candy). */
export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  children,
  size = "lg",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  crumbs?: Crumb[];
  children?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <header className={cn("mb-8 md:mb-12", className)}>
      {crumbs && <Breadcrumbs items={crumbs} className="mb-4" />}
      {eyebrow && (
        <Reveal>
          <p className="mb-3 text-xs font-semibold tracking-[0.25em] text-primary uppercase">{eyebrow}</p>
        </Reveal>
      )}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <TextReveal as="h1" text={title} className={cn("heading-display font-semibold", size === "lg" ? "text-4xl md:text-6xl lg:text-7xl" : "text-3xl md:text-5xl")} />
          {description && (
            <Reveal delay={0.25}>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">{description}</p>
            </Reveal>
          )}
        </div>
        {children && <Reveal delay={0.3}>{children}</Reveal>}
      </div>
    </header>
  );
}
