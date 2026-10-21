import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Odometer } from "@rentweb/ui/motion";
import { GlowCard } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { stats } from "../definitions";
import { RevealHeading, Section, StaggerCell, StaggerList, fxOf, hasAccentFont, pad2, type Fx } from "./_shared";

type Props = z.output<typeof stats.schema>;
type Item = Props["items"][number];

/** Size step by the longest rendered value, so long numbers (1,250,000+) never overflow their cell. */
function numSize(items: Item[], base: 4 | 5 | 6 | 7): string {
  const len = Math.max(...items.map((it) => `${it.prefix}${it.value.toLocaleString("th-TH")}${it.suffix}`.length));
  const step = len <= 4 ? base : len <= 6 ? base - 1 : len <= 8 ? base - 2 : base - 3;
  return ["text-step-3", "text-step-3", "text-step-3", "text-step-3", "text-step-4", "text-step-5", "text-step-6", "text-step-7"][Math.max(3, step)]!;
}

/** Rolling odometer (marketing numbers only), or the plain formatted value at fx=off. */
function Num({ it, fx, className }: { it: Item; fx: Fx; className?: string }) {
  if (fx === "off") {
    return (
      <span className={className}>
        {it.prefix}
        {it.value.toLocaleString("th-TH")}
        {it.suffix}
      </span>
    );
  }
  return <Odometer value={it.value} prefix={it.prefix || undefined} suffix={it.suffix || undefined} className={className} />;
}

export function Stats({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const n = p.items.length;
  const grid = n <= 2 ? "grid-cols-2" : n === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

  if (p.variant === "big") {
    return (
      <Section type="stats" fx={fx} className="overflow-x-clip bg-[var(--rw-night)] text-[var(--rw-night-fg)]">
        <div className="container-x">
          {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="mb-14 max-w-3xl font-heading text-step-3 font-semibold md:mb-20" />}
          <StaggerList fx={fx} className="grid gap-y-12 border-t border-current/15">
            {p.items.map((it, i) => (
              <StaggerCell key={i} fx={fx} className="grid items-end gap-4 border-b border-current/15 py-8 md:grid-cols-12 md:py-10">
                <span className="font-mono text-xs tracking-[0.08em] opacity-60 md:col-span-1">{pad2(i + 1)}</span>
                <Num it={it} fx={fx} className={cn("rw-display-num block leading-[0.9] font-semibold md:col-span-7", numSize(p.items, 7))} />
                <span className="text-step-1 leading-snug opacity-75 md:col-span-4 md:pb-3 md:text-right">{it.label}</span>
              </StaggerCell>
            ))}
          </StaggerList>
        </div>
      </Section>
    );
  }

  if (p.variant === "cards") {
    return (
      <Section type="stats" fx={fx}>
        <div className="container-x">
          {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="mb-12 max-w-3xl font-heading text-step-3 font-semibold" />}
          <StaggerList fx={fx} className={cn("grid gap-4 md:gap-5", grid)}>
            {p.items.map((it, i) => (
              <StaggerCell key={i} fx={fx} className="h-full">
                <GlowCard className="card rw-lift relative flex h-full min-h-56 flex-col justify-between overflow-hidden p-7 md:p-9">
                  <div className="flex items-center justify-between font-mono text-xs tracking-[0.08em] text-muted-foreground">
                    <span>{pad2(i + 1)}</span>
                    <span aria-hidden className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                  </div>
                  <div>
                    <Num it={it} fx={fx} className={cn("rw-display-num block leading-none font-semibold text-primary-ink", numSize(p.items, n >= 4 ? 4 : 5))} />
                    <p className="mt-3 text-sm text-muted-foreground md:text-base">{it.label}</p>
                  </div>
                </GlowCard>
              </StaggerCell>
            ))}
          </StaggerList>
        </div>
      </Section>
    );
  }

  // row: odometers with thin dividers
  return (
    <Section type="stats" fx={fx} className="!py-[calc(clamp(3rem,6vw,5.5rem)*var(--density,1))]">
      <div className="container-x">
        {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="mb-10 max-w-3xl font-heading text-step-3 font-semibold" />}
        <StaggerList fx={fx} className={cn("grid border-y border-border", grid)}>
          {p.items.map((it, i) => (
            <StaggerCell key={i} fx={fx} className={cn("px-2 py-8 md:px-8 md:py-12", i > 0 && "border-border sm:border-l", n > 3 && i % 2 === 1 && "border-l lg:border-l", n > 3 && i >= 2 && "border-t border-border lg:border-t-0")}>
              <Num it={it} fx={fx} className={cn("rw-display-num block leading-none font-semibold", numSize(p.items, n >= 4 ? 4 : 5))} />
              <p className="mt-3 text-sm text-muted-foreground md:text-base">{it.label}</p>
            </StaggerCell>
          ))}
        </StaggerList>
      </div>
    </Section>
  );
}
