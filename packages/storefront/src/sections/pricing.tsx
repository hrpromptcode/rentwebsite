import * as React from "react";
import type { z } from "zod";
import { Check } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { TiltCard } from "@rentweb/ui/motion";
import { GlowCard, GradientBorder } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { pricing } from "../definitions";
import { CtaButton, DisplayText, Section, SectionHeading, StaggerCell, StaggerList, fxOf, hasAccentFont, pad2, stepFor, type Fx } from "./_shared";

type Props = z.output<typeof pricing.schema>;
type Plan = Props["plans"][number];

function PlanBody({ pl, i, fx }: { pl: Plan; i: number; fx: Fx }) {
  return (
    <div className="relative flex h-full flex-col p-7 md:p-9">
      {pl.badge && (
        <span
          className={cn(
            "absolute -top-3.5 right-6 z-10 rotate-[4deg] rounded-full px-3.5 py-1 text-xs font-semibold shadow-md",
            pl.highlighted ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
          )}
        >
          {pl.badge}
        </span>
      )}
      <div className="flex items-center justify-between font-mono text-xs tracking-[0.08em] text-muted-foreground">
        <span>{pad2(i + 1)}</span>
        {pl.highlighted && <span aria-hidden className="size-2 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]" />}
      </div>
      <h3 className="mt-6 font-heading text-step-2 font-semibold">{pl.name}</h3>
      {pl.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pl.description}</p>}
      <div className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border pb-8">
        <DisplayText text={pl.price} className={cn("font-heading leading-none font-semibold tracking-[-0.02em]", stepFor(pl.price, ["text-step-5", "text-step-4", "text-step-3"], [5, 8]))} />
        {pl.period && <span className="text-muted-foreground">/{pl.period}</span>}
      </div>
      <ul className="mt-8 flex-1 space-y-3.5 text-sm md:text-[0.95rem]">
        {pl.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", pl.highlighted ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
              <Check aria-hidden className="size-3" />
            </span>
            <span className="leading-relaxed">{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <CtaButton href={pl.cta.href} label={pl.cta.label} size="lg" variant={pl.highlighted ? "default" : "outline"} fx={fx} magnetic={false} className="w-full justify-between" />
      </div>
    </div>
  );
}

/** Plans as gently tilting cards (≤ 5°) with a pointer glow; the highlighted plan wears an animated gradient border. */
export function Pricing({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.plans.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const cols = p.plans.length === 2 ? "md:grid-cols-2 lg:mx-auto lg:max-w-5xl" : p.plans.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
  return (
    <Section type="pricing" fx={fx}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} fx={fx} accent={accent} />
        <StaggerList fx={fx} className={cn("grid gap-5 lg:items-stretch", cols)}>
          {p.plans.map((pl, i) => {
            const body = <PlanBody pl={pl} i={i} fx={fx} />;
            const card = pl.highlighted ? (
              <GradientBorder className="h-full rounded-[var(--radius-2xl)] bg-card shadow-float" width={1.5}>
                {body}
              </GradientBorder>
            ) : (
              <GlowCard className="card h-full rounded-[var(--radius-2xl)]">{body}</GlowCard>
            );
            return (
              <StaggerCell key={i} fx={fx} className={cn("h-full", pl.highlighted && "lg:-translate-y-4")}>
                {fx === "auto" ? (
                  <TiltCard max={5} className="h-full">
                    {card}
                  </TiltCard>
                ) : (
                  card
                )}
              </StaggerCell>
            );
          })}
        </StaggerList>
      </div>
    </Section>
  );
}
