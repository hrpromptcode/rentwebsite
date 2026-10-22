import * as React from "react";
import { Eyebrow, RevealHeading, SectionStyles } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { CommerceStyles } from "./commerce-styles";

/**
 * Module-local PageIntro variant for listing pages (§5.0 "marketing-light"): eyebrow + giant split-reveal title with a
 * superscript mono count (Vyre "WORKS (08)"), the lead in an editorial right column, then the drawn rule. Renders the
 * page <h1>; the count is decorative (aria-hidden) so the heading's name stays the title.
 */
export function ListingIntro({ eyebrow, title, lead, count, index = "01", className, children }: { eyebrow?: string; title: string; lead?: string | null; count?: string; index?: string; className?: string; children?: React.ReactNode }) {
  const long = [...title.replace(/\s+/g, "")].length > 14;
  return (
    <header className={cn("relative pt-8 pb-7 md:pt-14 md:pb-10", className)}>
      <SectionStyles />
      <CommerceStyles />
      {(eyebrow || index) && <Eyebrow text={eyebrow} index={index} className="mb-5 md:mb-7" />}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10">
        <div className={cn("flex items-start gap-2 md:gap-4", lead ? "lg:col-span-8" : "lg:col-span-12")}>
          <RevealHeading as="h1" text={title} trigger="mount" mode="lines" className={cn("heading-display font-semibold text-balance", long ? "text-step-5" : "text-step-6")} />
          {count && (
            <span aria-hidden className="rwc-num mt-[0.6em] shrink-0 text-muted-foreground md:mt-[1.1em] md:text-sm">
              {count}
            </span>
          )}
        </div>
        {lead && <p className="rw-fade max-w-md text-step-1 leading-relaxed text-pretty text-muted-foreground lg:col-span-4 lg:pb-[0.9em]">{lead}</p>}
      </div>
      {children}
      <div aria-hidden className="rwc-rule-draw mt-7 h-px w-full bg-foreground/70 md:mt-10" />
    </header>
  );
}
