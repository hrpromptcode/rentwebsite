import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";
import { graphemeCount, scriptOf } from "@rentweb/ui/motion/split";
import { Eyebrow, RevealHeading, Rise, SectionStyles } from "@rentweb/storefront";
import { BookingStyles } from "./styles";

/** Type step by visible length: Thai titles never balloon into 4-line blocks (Thai caps at --step-6). */
export function titleStep(text: string): string {
  const n = graphemeCount(text.replace(/\s+/g, ""));
  return n <= 9 ? "text-step-6" : n <= 15 ? "text-step-5" : "text-step-4";
}

/**
 * Display break for a tenant-entered name in a giant word-split <h1> (detail pages). The word splitter breaks between
 * dictionary words, so a loanword it does not know ("อโรมาเทอรา | พี 90 นาที") can split mid-word. For names of 12+ visible
 * characters that contain spaces, the break goes at the space nearest the middle instead (never between a number and its
 * unit, never before "/" or "(" fragments; a Latin/Thai switch is preferred; Latin-only names are left alone). Accessible
 * name unchanged (whitespace-normalised; aria-label keeps the text).
 */
const THAI_CHAR = /[฀-๿]/;
export function nameLines(name: string): string {
  const t = name.trim();
  if (!THAI_CHAR.test(t) || t.includes("\n") || graphemeCount(t.replace(/\s+/g, "")) < 12) return t;
  const words = t.split(/ +/);
  if (words.length < 2) return t;
  const total = t.length;
  let best = -1;
  let bestDist = Infinity;
  let pos = 0;
  for (let i = 0; i < words.length - 1; i++) {
    pos += words[i]!.length + 1;
    const before = words[i]!;
    const after = words[i + 1]!;
    if (/\d$/.test(before) || /^[/(\-–·&+]/.test(after)) continue;
    // a Latin ↔ Thai switch is the most natural place to break ("Prenatal Yoga | คุณแม่")
    const d = Math.abs(pos - total / 2) - (THAI_CHAR.test(before.slice(-1)) !== THAI_CHAR.test(after.charAt(0)) ? 4 : 0);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return t;
  return `${words.slice(0, best + 1).join(" ")}\n${words.slice(best + 1).join(" ")}`;
}

/**
 * Module-page intro (marketing-light listing pages, §5.0): eyebrow + mono index, a giant mask-revealed <h1>, lead,
 * optional controls (filter pills) and an optional visual column (signature scene / photo stack). The <h1> keeps its
 * plain accessible name (SplitReveal aria-label). Server component.
 */
export function ModuleIntro({
  eyebrow,
  title,
  lead,
  index,
  aside,
  children,
  className,
  count,
  countLabel,
}: {
  eyebrow?: string;
  title: string;
  lead?: React.ReactNode;
  /** mono index, e.g. "02 / SERVICES" */
  index?: string;
  /** visual column (desktop right, mobile under the title) */
  aside?: React.ReactNode;
  /** filter pills / meta under the lead */
  children?: React.ReactNode;
  className?: string;
  /** big accent counter next to the title (e.g. number of services) */
  count?: number;
  countLabel?: string;
}) {
  return (
    <header data-module-intro="" className={cn("container-x relative pt-8 pb-10 md:pt-14 md:pb-14", className)}>
      <SectionStyles />
      <BookingStyles />
      <div className={cn("grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12", !aside && "lg:grid-cols-1")}>
        <div className={cn("min-w-0", aside ? "lg:col-span-7" : "max-w-5xl")}>
          {(eyebrow || index) && <Eyebrow text={eyebrow} index={index} className="mb-5 md:mb-7" />}
          <div className="flex items-end gap-5">
            <RevealHeading as="h1" text={title} trigger="mount" mode="words" className={cn("font-heading font-semibold text-balance", titleStep(title))} />
            {typeof count === "number" && count > 0 && (
              <span aria-hidden className="bk-count mb-[0.35em] hidden shrink-0 text-step-3 text-primary sm:inline-flex sm:flex-col">
                ({String(count).padStart(2, "0")})
                {countLabel && <span className="mt-1 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground">{countLabel}</span>}
              </span>
            )}
          </div>
          {lead && (
            <Rise delay={0.15}>
              <div className="mt-5 max-w-2xl text-step-1 leading-relaxed text-pretty text-muted-foreground md:mt-7">{lead}</div>
            </Rise>
          )}
          {children && <div className="mt-7 md:mt-9">{children}</div>}
        </div>
        {aside && <div className="min-w-0 lg:col-span-5">{aside}</div>}
      </div>
      <div aria-hidden className="rw-draw-line bk-draw mt-10 h-px w-full bg-border md:mt-14" />
    </header>
  );
}

/** Compact intro for operational pages (no split reveal, a short fade only). */
export function CompactIntro({ eyebrow, title, lead, right, className, back }: { eyebrow?: string; title: string; lead?: React.ReactNode; right?: React.ReactNode; className?: string; back?: React.ReactNode }) {
  return (
    <header className={cn("relative", className)}>
      <SectionStyles />
      <BookingStyles />
      {back}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow text={eyebrow} className="mb-3" />}
          <h1 data-script={scriptOf(title)} className="rw-h rw-fade font-heading text-step-4 font-semibold text-balance">
            {title}
          </h1>
          {lead && <div className="rw-fade mt-2 text-sm text-muted-foreground md:text-base">{lead}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}
