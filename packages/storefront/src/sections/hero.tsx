import * as React from "react";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal, TextReveal, Magnetic, Parallax, TiltCard, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { HeroBackground, type HeroBackgroundKind } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { hero } from "../definitions";
import type { z } from "zod";
import { Img, SmartLink } from "./_shared";

type Props = z.output<typeof hero.schema>;

function Ctas({ p, dark }: { p: Props; dark?: boolean }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {p.primaryCta?.label && (
        <Magnetic strength={0.2}>
          <Button asChild size="xl" className={cn(dark && "shadow-lg shadow-black/30")}>
            <SmartLink href={p.primaryCta.href}>
              {p.primaryCta.label}
              <ArrowRight className="size-5" />
            </SmartLink>
          </Button>
        </Magnetic>
      )}
      {p.secondaryCta?.label && (
        <Button asChild size="xl" variant={dark ? "inverse" : "outline"} className={cn(dark && "bg-white/10 text-white backdrop-blur hover:bg-white/20 !border-white/30")}>
          <SmartLink href={p.secondaryCta.href}>{p.secondaryCta.label}</SmartLink>
        </Button>
      )}
    </div>
  );
}

function Badges({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Stagger className="mt-6 flex flex-wrap gap-2" stagger={0.05}>
      {items.map((b) => (
        <StaggerItem key={b}>
          <Badge variant="soft" className="px-3 py-1 text-sm">
            {b}
          </Badge>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function StatsRow({ items, dark }: { items: Props["stats"]; dark?: boolean }) {
  if (!items.length) return null;
  return (
    <Stagger className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3" stagger={0.1} delay={0.4}>
      {items.map((s) => (
        <StaggerItem key={s.label}>
          <div className={cn("font-heading text-3xl font-semibold md:text-4xl", dark ? "text-white" : "text-foreground")}>{s.value}</div>
          <div className={cn("mt-1 text-sm", dark ? "text-white/70" : "text-muted-foreground")}>{s.label}</div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function Heading({ p, className, as = "h1" }: { p: Props; className?: string; as?: "h1" | "h2" }) {
  return p.textReveal ? (
    <TextReveal as={as} text={p.heading} className={className} delay={0.1} />
  ) : (
    <Reveal>
      {React.createElement(as, { className }, p.heading)}
    </Reveal>
  );
}

export function Hero({ ctx, props: p, index }: { ctx: StorefrontCtx; props: Props; index: number }) {
  const bg: HeroBackgroundKind = p.background === "theme" ? ctx.theme.effects.heroBackground : (p.background as HeroBackgroundKind);
  const transparentHeader = ctx.theme.layout.headerTransparent && index === 0;
  const padTop = transparentHeader ? "pt-28 md:pt-36" : "pt-12 md:pt-20";

  if (p.variant === "fullscreen") {
    return (
      <section className="relative isolate flex min-h-[92svh] items-end overflow-hidden text-white">
        <div className="absolute inset-0 -z-10">
          <Parallax speed={0.25} scale className="h-full">
            <Img src={p.image.url} alt={p.image.alt} className="size-full object-cover" priority />
          </Parallax>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" style={{ opacity: Math.max(0.6, p.overlay + 0.3) }} />
          {bg !== "none" && bg !== "orb-3d" && <HeroBackground kind={bg} className="opacity-40 mix-blend-screen" />}
        </div>
        <div className="container-x relative pb-16 md:pb-24">
          <div className="max-w-3xl">
            {p.eyebrow && (
              <Reveal>
                <p className="mb-4 text-xs font-semibold tracking-[0.25em] text-white/80 uppercase">{p.eyebrow}</p>
              </Reveal>
            )}
            <Heading p={p} className="heading-display text-5xl font-semibold text-white md:text-7xl lg:text-8xl" />
            {p.subheading && (
              <Reveal delay={0.35}>
                <p className="mt-6 max-w-xl text-lg text-white/85 md:text-xl">{p.subheading}</p>
              </Reveal>
            )}
            <Reveal delay={0.5}>
              <Ctas p={p} dark />
            </Reveal>
            <StatsRow items={p.stats} dark />
          </div>
        </div>
        <a href="#after-hero" aria-label="เลื่อนลง" className="absolute right-6 bottom-6 hidden size-11 animate-bounce items-center justify-center rounded-full border border-white/40 text-white md:flex">
          <ArrowDown className="size-5" />
        </a>
        <div id="after-hero" />
      </section>
    );
  }

  if (p.variant === "editorial") {
    return (
      <section className={cn("relative isolate overflow-hidden", padTop, "pb-16 md:pb-28")}>
        <HeroBackground kind={bg} />
        <div className="container-x relative">
          {p.eyebrow && (
            <Reveal>
              <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.3em] uppercase">
                <span className="inline-block h-px w-10 bg-foreground" />
                {p.eyebrow}
              </p>
            </Reveal>
          )}
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Heading p={p} className="heading-display text-[clamp(2.8rem,9vw,8.5rem)] font-semibold" />
            </div>
            <div className="lg:col-span-4 lg:pb-4">
              {p.subheading && (
                <Reveal delay={0.4}>
                  <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">{p.subheading}</p>
                </Reveal>
              )}
              <Reveal delay={0.5}>
                <Ctas p={p} />
              </Reveal>
              <Badges items={p.badges} />
            </div>
          </div>
          {(p.image.url || p.imageSecondary?.url) && (
            <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-12">
              {p.image.url && (
                <Reveal className="md:col-span-8" direction="scale" delay={0.2}>
                  <Parallax speed={0.15} className="overflow-hidden rounded-[var(--radius-2xl)]">
                    <Img src={p.image.url} alt={p.image.alt} className="aspect-[16/10] w-full object-cover" priority />
                  </Parallax>
                </Reveal>
              )}
              {p.imageSecondary?.url && (
                <Reveal className="md:col-span-4 md:translate-y-10" direction="up" delay={0.4}>
                  <Parallax speed={-0.15} className="overflow-hidden rounded-[var(--radius-2xl)]">
                    <Img src={p.imageSecondary.url} alt={p.imageSecondary.alt} className="aspect-[4/5] w-full object-cover" />
                  </Parallax>
                </Reveal>
              )}
            </div>
          )}
          <StatsRow items={p.stats} />
        </div>
      </section>
    );
  }

  if (p.variant === "centered") {
    return (
      <section className={cn("relative isolate overflow-hidden text-center", padTop, "pb-16 md:pb-24")}>
        <HeroBackground kind={bg} />
        <div className="container-x relative mx-auto max-w-4xl">
          {p.eyebrow && (
            <Reveal>
              <Badge variant="soft" className="mb-6 px-4 py-1.5 text-sm">
                {p.eyebrow}
              </Badge>
            </Reveal>
          )}
          <Heading p={p} className="heading-display mx-auto text-5xl font-semibold md:text-7xl" />
          {p.subheading && (
            <Reveal delay={0.35}>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">{p.subheading}</p>
            </Reveal>
          )}
          <Reveal delay={0.5} className="flex justify-center">
            <Ctas p={p} />
          </Reveal>
          <div className="flex justify-center">
            <Badges items={p.badges} />
          </div>
          <StatsRow items={p.stats} />
          {p.image.url && (
            <Reveal delay={0.3} direction="scale" className="mt-14">
              <TiltCard max={4} className="mx-auto max-w-5xl overflow-hidden rounded-[var(--radius-2xl)] shadow-2xl shadow-glow/30">
                <Img src={p.image.url} alt={p.image.alt} className="aspect-[16/9] w-full object-cover" priority />
              </TiltCard>
            </Reveal>
          )}
        </div>
      </section>
    );
  }

  if (p.variant === "stacked") {
    return (
      <section className={cn("relative isolate overflow-hidden", padTop, "pb-16")}>
        <HeroBackground kind={bg} />
        <div className="container-x relative">
          <div className="max-w-3xl">
            {p.eyebrow && (
              <Reveal>
                <p className="mb-4 text-xs font-semibold tracking-[0.25em] text-primary uppercase">{p.eyebrow}</p>
              </Reveal>
            )}
            <Heading p={p} className="heading-display text-5xl font-semibold md:text-7xl" />
            {p.subheading && (
              <Reveal delay={0.35}>
                <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">{p.subheading}</p>
              </Reveal>
            )}
            <Reveal delay={0.5}>
              <Ctas p={p} />
            </Reveal>
          </div>
          {p.image.url && (
            <Reveal delay={0.3} direction="scale" className="mt-12">
              <Parallax speed={0.12} className="overflow-hidden rounded-[var(--radius-2xl)]">
                <Img src={p.image.url} alt={p.image.alt} className="aspect-[21/9] w-full object-cover" priority />
              </Parallax>
            </Reveal>
          )}
          <StatsRow items={p.stats} />
        </div>
      </section>
    );
  }

  // split (default)
  return (
    <section className={cn("relative isolate overflow-hidden", padTop, "pb-16 md:pb-24")}>
      <HeroBackground kind={bg} />
      <div className="container-x relative grid items-center gap-12 lg:grid-cols-2">
        <div>
          {p.eyebrow && (
            <Reveal>
              <Badge variant="soft" className="mb-5 px-3 py-1 text-sm">
                {p.eyebrow}
              </Badge>
            </Reveal>
          )}
          <Heading p={p} className="heading-display text-5xl font-semibold md:text-6xl xl:text-7xl" />
          {p.subheading && (
            <Reveal delay={0.35}>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">{p.subheading}</p>
            </Reveal>
          )}
          <Reveal delay={0.5}>
            <Ctas p={p} />
          </Reveal>
          <Badges items={p.badges} />
          <StatsRow items={p.stats} />
        </div>
        <Reveal delay={0.2} direction="scale" className="relative">
          {p.image.url ? (
            <TiltCard max={6} className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[var(--radius-3xl)] bg-glow/40 blur-3xl" />
              <Img src={p.image.url} alt={p.image.alt} className="aspect-[4/5] w-full rounded-[var(--radius-2xl)] object-cover shadow-2xl md:aspect-square" priority />
              {p.imageSecondary?.url && (
                <div className="absolute -bottom-8 -left-8 hidden w-44 overflow-hidden rounded-[var(--radius-xl)] border-4 border-background shadow-xl md:block animate-float">
                  <Img src={p.imageSecondary.url} alt={p.imageSecondary.alt} className="aspect-square w-full object-cover" />
                </div>
              )}
            </TiltCard>
          ) : (
            <div className="relative aspect-square">
              <div className="absolute inset-0 rounded-[var(--radius-3xl)] bg-gradient-to-br from-primary via-glow to-accent opacity-80 blur-2xl animate-breathe" />
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}
