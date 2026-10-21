// CTA section (hi-end): banner · card · split · glow · wordmark
import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { GiantWordmark, ImageReveal, Magnetic, VelocityMarquee } from "@rentweb/ui/motion";
import { ShaderBackdrop } from "@rentweb/ui/three";
import type { StorefrontCtx } from "../ctx";
import type { cta } from "../definitions";
import { CtaButton, Img, Prose, RevealHeading, Rise, Section, SmartLink, allow3d, fxOf, hasAccentFont, stepFor, type Fx } from "./_shared";
import { Poster, presetKey } from "./_scene";

type Props = z.output<typeof cta.schema>;

/** Big round magnetic CTA (cursor-friendly target, label rolls); the text is the link's accessible name. */
function RoundCta({ href, label, fx, tone = "light" }: { href: string; label: string; fx: Fx; tone?: "light" | "dark" | "primary" }) {
  const link = (
    <SmartLink
      href={href}
      className={cn(
        "rw-round-cta group",
        tone === "light" && "bg-background text-foreground",
        tone === "dark" && "bg-foreground text-background",
        tone === "primary" && "bg-primary text-primary-foreground",
      )}
    >
      <span data-magnetic-inner="" className="flex flex-col items-center gap-2">
        <ArrowUpRight aria-hidden className="size-7 transition-transform duration-500 group-hover:rotate-45" />
        <span className="max-w-[8rem] text-sm leading-snug md:text-base">{label}</span>
      </span>
    </SmartLink>
  );
  return fx === "off" ? link : <Magnetic strength={0.4} max={18}>{link}</Magnetic>;
}

function Secondary({ p, fx, inverse }: { p: Props; fx: Fx; inverse?: boolean }) {
  if (!p.secondaryCta?.label) return null;
  return <CtaButton href={p.secondaryCta.href} label={p.secondaryCta.label} variant="ghost" arrow={false} magnetic={false} fx={fx} className={cn(inverse && "text-current hover:bg-white/10")} />;
}

export function Cta({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const preset = presetKey(ctx);
  const live = allow3d(ctx, fx);

  if (p.variant === "split" && p.image?.url) {
    return (
      <Section type="cta" fx={fx}>
        <div className="container-x">
          <div className="grid overflow-hidden rounded-[var(--radius-2xl)] bg-surface md:grid-cols-2">
            <div className="flex flex-col justify-center p-8 sm:p-12 md:p-16 lg:p-20">
              <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="font-heading text-step-4 font-semibold text-balance" />
              <Rise fx={fx} delay={0.12}>
                <Prose text={p.body} className="mt-5 text-step-1 text-muted-foreground" />
              </Rise>
              <Rise fx={fx} delay={0.22} className="mt-10 flex flex-wrap items-center gap-3">
                <CtaButton href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} />
                <Secondary p={p} fx={fx} />
              </Rise>
            </div>
            <div className="relative min-h-72 md:min-h-[32rem]">
              {fx === "off" ? (
                <Img src={p.image.url} alt={p.image.alt} className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0">
                  <ImageReveal src={p.image.url} alt={p.image.alt} from="right" parallax={0.1} className="h-full w-full" sizes="(min-width: 768px) 50vw, 100vw" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (p.variant === "card") {
    return (
      <Section type="cta" fx={fx} heavy={live}>
        <div className="container-x">
          <div className="relative isolate overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface px-6 py-16 text-center shadow-float sm:px-12 md:py-24">
            {live ? <ShaderBackdrop variant="mesh" colors={["primary", "accent", "glow", "surface"]} intensity={0.8} className="absolute inset-0 -z-10" /> : <Poster preset={preset} variant="mesh" className="absolute inset-0 -z-10" />}
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,color-mix(in_oklab,var(--surface)_80%,transparent),color-mix(in_oklab,var(--surface)_30%,transparent))]" />
            <div className="mx-auto max-w-3xl">
              <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className={cn("font-heading font-semibold text-balance", stepFor(p.heading, ["text-step-5", "text-step-4", "text-step-4"], [20, 40]))} />
              <Rise fx={fx} delay={0.12}>
                <Prose text={p.body} className="mx-auto mt-5 max-w-xl text-step-1 text-muted-foreground" />
              </Rise>
              <Rise fx={fx} delay={0.22} className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <CtaButton href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} />
                <Secondary p={p} fx={fx} />
              </Rise>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (p.variant === "glow") {
    // always on a dark surface (light themes: foreground; dark themes: a deepened background) - never a light block
    return (
      <Section type="cta" fx={fx} heavy={live} className="isolate overflow-clip bg-[var(--rw-night)] text-[var(--rw-night-fg)]">
        {live ? (
          <ShaderBackdrop variant="aurora" colors={["primary", "accent", "glow", "var(--rw-night)"]} pointer className="absolute inset-0 -z-10 opacity-90" />
        ) : (
          <Poster preset={preset} variant="aurora" className="absolute inset-0 -z-10 opacity-60" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,color-mix(in_oklab,var(--rw-night)_62%,transparent),transparent)]" />
        <div className="container-x relative py-10 text-center md:py-16">
          <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className={cn("mx-auto max-w-5xl font-heading font-semibold text-balance", stepFor(p.heading, ["text-step-5", "text-step-5", "text-step-4"], [20, 40]))} />
          <Rise fx={fx} delay={0.12}>
            <Prose text={p.body} className="mx-auto mt-6 max-w-2xl text-step-1 opacity-80" />
          </Rise>
          <Rise fx={fx} delay={0.22} className="mt-12 flex flex-wrap items-center justify-center gap-6">
            <RoundCta href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} tone="primary" />
            <Secondary p={p} fx={fx} inverse />
          </Rise>
        </div>
      </Section>
    );
  }

  if (p.variant === "wordmark") {
    return (
      <Section type="cta" fx={fx} className="overflow-x-clip">
        <div className="container-x">
          {p.body && (
            <Rise fx={fx}>
              <Prose text={p.body} className="mb-8 max-w-xl text-step-1 text-muted-foreground" />
            </Rise>
          )}
        </div>
        <div className="px-[var(--gutter)]">
          <SmartLink href={p.primaryCta.href} className="group block" aria-label={`${p.heading} – ${p.primaryCta.label}`}>
            <GiantWordmark as="h2" text={p.heading.replace(/\s*\n\s*/g, " ")} effect={fx === "off" ? "none" : "rise"} className="font-heading font-semibold transition-colors duration-500 group-hover:text-primary-ink" />
          </SmartLink>
        </div>
        <div className="container-x mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-border pt-8">
          <p className="mono-label text-muted-foreground">{ctx.tenant.name}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Secondary p={p} fx={fx} />
            <RoundCta href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} tone="dark" />
          </div>
        </div>
      </Section>
    );
  }

  // banner: full-bleed primary band, giant heading, round magnetic CTA, thin marquee band
  const words = p.heading
    .replace(/\s*\n\s*/g, " ")
    .split(/[?!.。]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <Section type="cta" fx={fx} tone="primary" className="isolate overflow-clip !pb-0">
      <div aria-hidden className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 size-[60vmax] rounded-full bg-glow/40 blur-[120px]" />
      <div className="container-x relative grid items-center gap-10 pb-16 md:grid-cols-[minmax(0,1fr)_auto] md:pb-24">
        <div>
          <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className={cn("max-w-4xl font-heading font-semibold text-balance", stepFor(p.heading, ["text-step-5", "text-step-5", "text-step-4"], [20, 40]))} />
          <Rise fx={fx} delay={0.12}>
            <Prose text={p.body} className="mt-5 max-w-2xl text-step-1 opacity-85" />
          </Rise>
          {p.secondaryCta?.label && (
            <Rise fx={fx} delay={0.2} className="mt-8">
              <Secondary p={p} fx={fx} inverse />
            </Rise>
          )}
        </div>
        <Rise fx={fx} delay={0.25} className="justify-self-start md:justify-self-end">
          <RoundCta href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} tone="light" />
        </Rise>
      </div>
      <div aria-hidden className="border-t border-primary-foreground/20 py-4">
        {fx === "off" ? null : <VelocityMarquee items={[...words, ctx.tenant.name].filter(Boolean)} size="sm" speed={36} skew={false} reactToScroll={fx === "auto"} separator={<span className="mx-6 opacity-60">✦</span>} className="font-medium" />}
      </div>
    </Section>
  );
}

