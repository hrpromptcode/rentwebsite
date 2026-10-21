import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { WormholeTunnel } from "@rentweb/ui/three";
import type { StorefrontCtx } from "../ctx";
import type { steps } from "../definitions";
import { Icon, Section, SectionHeading, StaggerCell, StaggerList, allow3d, fxOf, hasAccentFont, pad2, type Fx } from "./_shared";

type Props = z.output<typeof steps.schema>;
type Item = Props["items"][number];

/** Vyre-style process grid: giant outline numerals rising in, a top rule that draws, title + description. */
export function NumberedSteps({ items, fx }: { items: Array<{ title: string; description?: string; icon?: string; kicker?: string }>; fx: Fx }) {
  const cols = items.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <ol className={cn("grid gap-x-6 gap-y-14 md:gap-x-8", cols)}>
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="rw-draw-line block h-px w-full bg-foreground/80" />
          <div className="flex items-center justify-between pt-5 font-mono text-xs tracking-[0.08em] text-muted-foreground">
            <span>{it.kicker || `ขั้นที่ ${i + 1}`}</span>
            {it.icon && <Icon name={it.icon} className="size-4 text-primary" />}
          </div>
          <p aria-hidden className={cn("rw-outline-text mt-6 font-accent text-step-7 leading-[0.85] font-semibold text-foreground/70", fx !== "off" && "rw-big-num")}>{pad2(i + 1)}</p>
          <h3 className="mt-8 font-heading text-step-2 font-semibold text-balance">{it.title}</h3>
          {it.description && <p className="mt-3 leading-relaxed text-muted-foreground">{it.description}</p>}
        </li>
      ))}
    </ol>
  );
}

function Node({ it, i, big }: { it: Item; i: number; big?: boolean }) {
  return (
    <span className={cn("rw-step-node relative z-10 flex shrink-0 items-center justify-center rounded-full bg-primary font-heading font-semibold text-primary-foreground shadow-[0_0_0_8px_var(--surface),0_14px_40px_-14px_var(--primary)]", big ? "size-16 text-xl" : "size-14 text-lg")}>
      {it.icon ? <Icon name={it.icon} className="size-6" /> : pad2(i + 1)}
    </span>
  );
}

export function Steps({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const head = (align: "left" | "center" = "center") => <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align={align} layout={align === "left" ? "split" : "stack"} fx={fx} accent={accent} />;

  if (p.variant === "tunnel") {
    if (allow3d(ctx, fx)) {
      return (
        <Section type="steps" fx={fx} heavy className="!pb-0">
          <div className="container-x">{head()}</div>
          <WormholeTunnel steps={p.items.map((it, i) => ({ kicker: `${pad2(i + 1)} / ${pad2(p.items.length)}`, title: it.title, body: it.description || undefined }))} tint="primary" length={p.items.length > 4 ? "long" : "normal"} ariaLabel={p.heading || "ขั้นตอน"} />
        </Section>
      );
    }
    return (
      <Section type="steps" fx={fx}>
        <div className="container-x">
          {head("left")}
          <NumberedSteps items={p.items} fx={fx} />
        </div>
      </Section>
    );
  }

  if (p.variant === "numbered") {
    return (
      <Section type="steps" fx={fx}>
        <div className="container-x">
          {head("left")}
          <NumberedSteps items={p.items} fx={fx} />
        </div>
      </Section>
    );
  }

  if (p.variant === "cards") {
    // cards stack as you scroll (CSS sticky with growing offsets); a plain grid on wide screens with few items
    return (
      <Section type="steps" fx={fx} tone="surface">
        <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2.5rem)]">
              <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align="left" className="mb-0 md:mb-0" fx={fx} accent={accent} />
              <p aria-hidden className="mt-10 hidden font-accent text-step-7 leading-none font-semibold text-primary/15 lg:block">{pad2(p.items.length)}</p>
            </div>
          </div>
          <ol className="grid gap-5 lg:col-span-7">
            {p.items.map((it, i) => (
              <li key={i} className={cn(fx === "auto" && "rw-stack-card")} style={{ "--i": i } as React.CSSProperties}>
                <div className="card relative flex min-h-56 flex-col justify-between overflow-hidden p-7 shadow-float md:min-h-64 md:p-10">
                  <div className="flex items-start justify-between gap-6">
                    <Node it={it} i={i} />
                    <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">
                      {pad2(i + 1)} / {pad2(p.items.length)}
                    </span>
                  </div>
                  <div className="mt-10">
                    <h3 className="font-heading text-step-3 font-semibold text-balance">{it.title}</h3>
                    {it.description && <p className="mt-3 max-w-xl text-step-1 leading-relaxed text-muted-foreground">{it.description}</p>}
                  </div>
                  <span aria-hidden className="pointer-events-none absolute -right-4 -bottom-10 font-accent text-[10rem] leading-none font-bold text-foreground/[0.04]">
                    {pad2(i + 1)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    );
  }

  if (p.variant === "vertical") {
    return (
      <Section type="steps" fx={fx} tone="surface">
        <div className="container-x">
          {head()}
          <ol className="relative mx-auto max-w-3xl">
            <span aria-hidden className="absolute top-2 bottom-2 left-7 w-px bg-border md:left-8" />
            <span aria-hidden className="rw-vline absolute top-2 bottom-2 left-7 w-px bg-primary md:left-8" />
            {p.items.map((it, i) => (
              <li key={i} className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-6 pb-14 last:pb-0 md:gap-10">
                <div className="md:sticky md:top-[calc(var(--header-h,0px)+2rem)] md:self-start">
                  <Node it={it} i={i} big />
                </div>
                <div className="pt-3">
                  <h3 className="font-heading text-step-3 font-semibold text-balance">{it.title}</h3>
                  {it.description && <p className="mt-3 text-step-1 leading-relaxed text-muted-foreground">{it.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    );
  }

  // horizontal: a connecting line that draws with scroll, nodes popping as it passes
  const n = p.items.length;
  return (
    <Section type="steps" fx={fx} tone="surface">
      <div className="container-x">
        {head()}
        <div className="relative">
          <div aria-hidden className={cn("absolute top-7 hidden h-px bg-border md:block")} style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
          <div aria-hidden className="rw-steps-line absolute top-7 hidden h-px bg-primary md:block" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
          <StaggerList fx={fx} className={cn("relative grid gap-12 md:gap-8", n >= 4 ? "md:grid-cols-4" : n === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
            {p.items.map((it, i) => (
              <StaggerCell key={i} fx={fx} className="flex gap-5 md:flex-col md:items-center md:text-center">
                <Node it={it} i={i} />
                <div className="md:mt-6">
                  <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground">ขั้นที่ {i + 1}</p>
                  <h3 className="mt-2 font-heading text-step-2 font-semibold text-balance">{it.title}</h3>
                  {it.description && <p className="mt-2 leading-relaxed text-muted-foreground md:mx-auto md:max-w-xs">{it.description}</p>}
                </div>
              </StaggerCell>
            ))}
          </StaggerList>
        </div>
      </div>
    </Section>
  );
}
