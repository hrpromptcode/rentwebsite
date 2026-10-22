import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal, LiveClock, Odometer, ParallaxMedia } from "@rentweb/ui/motion";
import { DisplayText, Eyebrow, Img, RevealHeading, Rise, allow3d, hasAccentFont, sized } from "@rentweb/storefront";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { staySearch } from "@rentweb/storefront/definitions";
import { StaySearchForm } from "../components/stay-search-form";
import { OceanBand } from "../components/ocean-band";
import { RentalStyles } from "../components/rental-styles";
import { staySearchFormProps, type StaySearchExtra } from "./search-props";

export { searchDates, staySearchFormProps, type StaySearchExtra } from "./search-props";

type Props = z.output<typeof staySearch.schema>;

/**
 * Stay-search hero (§5.9). `fullscreen`: golden-hour photo on top, a live WebGL sea filling the lower band (theme
 * glow / accent; photo only on low tier or when 3D is off), a centred Thai headline (`\n` honoured) and the glass
 * date-range bar floating on the water; the stats move to a strip under the hero. `split`: 7/5 editorial grid with a
 * clip-revealed photo pair. The first section is dark-on-photo, so the transparent header switches to light text.
 */
export async function StaySearchSection({ ctx, props: p, id, index, initial, bare }: { ctx: StorefrontCtx; props: Props; id: string; index: number } & StaySearchExtra) {
  const fp = await staySearchFormProps(ctx, initial);
  if (bare) return <StaySearchForm {...fp} panel="down" />;

  const accent = hasAccentFont(ctx);
  const first = index === 0;
  const reveal = p.textReveal;

  if (p.variant === "split") {
    return (
      <section id={id} data-section="stay-search" className={cn("relative isolate overflow-clip", first && ctx.theme.layout.headerTransparent ? "pt-[calc(var(--header-h,5rem)+2rem)]" : "pt-12 md:pt-20", "pb-16 md:pb-24")}>
        <RentalStyles />
        <div className="container-x grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-5" />}
            {reveal ? (
              <RevealHeading as="h1" text={p.heading} trigger="mount" accent={accent} className="font-heading text-step-6 font-semibold text-balance" />
            ) : (
              <DisplayText as="h1" text={p.heading} accentDigits={accent} className="font-heading text-step-6 font-semibold text-balance" />
            )}
            {p.subheading && (
              <Rise delay={0.3}>
                <p className="mt-6 max-w-xl text-step-1 leading-relaxed text-muted-foreground">{p.subheading}</p>
              </Rise>
            )}
            <Rise delay={0.4} className="mt-9">
              <StaySearchForm {...fp} layout="stack" panel="down" />
            </Rise>
            {p.badges.length > 0 && (
              <ul className="mt-6 hidden flex-wrap gap-2 md:flex">
                {p.badges.map((b) => (
                  <li key={b} className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground">
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative lg:col-span-5">
            <ImageReveal src={sized(p.image.url, 1400)} alt={p.image.alt} aspect="4/5" from="bottom" priority className="rounded-[var(--radius-2xl)]" />
            {p.imageSecondary?.url && (
              <div className="absolute -bottom-10 -left-8 hidden w-[44%] overflow-hidden rounded-[var(--radius-xl)] shadow-float ring-8 ring-background md:block">
                <ParallaxMedia speed={-0.12}>
                  <Img src={sized(p.imageSecondary.url, 700)} alt={p.imageSecondary.alt} className="aspect-[4/3] w-full object-cover" />
                </ParallaxMedia>
              </div>
            )}
          </div>
        </div>
        {p.stats.length > 0 && <StatsStrip stats={p.stats} className="container-x mt-20" />}
      </section>
    );
  }

  // fullscreen (default): photo + WebGL sea band + glass bar
  const sea = allow3d(ctx, "auto");
  return (
    <section id={id} data-section="stay-search" data-hero-dark={first ? "" : undefined} className="rw-stay-hero overflow-clip">
      <RentalStyles />
      <div className="relative flex min-h-[100svh] flex-col text-white">
        <div className="rw-hero-photo">
          <Img src={sized(p.image.url, 2000)} alt={p.image.alt} priority className="object-[50%_42%]" />
        </div>
        {sea && <OceanBand />}
        <div className="rw-hero-scrim" style={{ "--scrim": Math.min(1, 0.35 + p.overlay) } as React.CSSProperties} />

        <div className="container-x relative z-10 flex flex-1 flex-col pt-[calc(var(--header-h,5rem)+clamp(0.5rem,3vh,2.5rem))] pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] md:pb-6">
          <div className="rw-hero-copy mx-auto max-w-[min(100%,82rem)] text-center">
            {p.eyebrow && (
              <p data-script="thai" className="rw-hero-in mb-5 text-sm font-semibold tracking-[0.02em] text-white/85 md:text-base" style={{ "--d": "0.1s" } as React.CSSProperties}>
                <span aria-hidden className="mr-3 inline-block h-px w-8 translate-y-[-0.3em] bg-current align-middle opacity-70" />
                {p.eyebrow}
                <span aria-hidden className="ml-3 inline-block h-px w-8 translate-y-[-0.3em] bg-current align-middle opacity-70" />
              </p>
            )}
            {reveal ? (
              <RevealHeading as="h1" text={p.heading} trigger="mount" delay={0.15} accent={accent} className="rw-hero-title font-heading font-semibold text-balance text-white" />
            ) : (
              <DisplayText as="h1" text={p.heading} accentDigits={accent} className="rw-hero-title font-heading font-semibold text-balance text-white" />
            )}
            {p.subheading && (
              <p className="rw-hero-in mx-auto mt-5 max-w-3xl text-step-1 leading-relaxed text-pretty text-white/90" style={{ "--d": "0.55s" } as React.CSSProperties}>
                {p.subheading}
              </p>
            )}
            {p.badges.length > 0 && (
              <ul className="rw-hero-in mt-7 hidden flex-wrap justify-center gap-2 md:flex" style={{ "--d": "0.7s" } as React.CSSProperties}>
                {p.badges.map((b) => (
                  <li key={b} className="rounded-full border border-white/25 bg-black/25 px-3.5 py-1.5 text-sm text-white backdrop-blur-md">
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* the glass bar floats on the water; the calendar pops up over the sea on desktop */}
          <div className="rw-hero-in relative mx-auto mt-auto w-full max-w-5xl pt-10" style={{ "--d": "0.8s" } as React.CSSProperties}>
            <StaySearchForm {...fp} panel="up" />
          </div>
          <div className="rw-hero-meta mx-auto mt-5 hidden w-full max-w-5xl items-center justify-between text-xs md:flex">
            <span className="inline-flex items-center gap-3">
              <span aria-hidden className="rw-scroll-cue relative inline-block h-6 w-px overflow-hidden bg-white/30" />
              <span className="mono-label">เลื่อนลงเพื่อดูห้องพัก</span>
            </span>
            <LiveClock label="เวลาท้องถิ่น" className="text-white/85" />
          </div>
        </div>
      </div>
      {p.stats.length > 0 && <StatsStrip stats={p.stats} className="container-x pt-14 pb-2 md:pt-20" />}
    </section>
  );
}

/** "21 · ห้องพักและวิลล่า" … as large accent numerals (odometer roll on enter) with thin dividers. */
function StatsStrip({ stats, className }: { stats: Props["stats"]; className?: string }) {
  return (
    <div className={className}>
      <dl className="grid grid-cols-3 divide-x divide-border border-y border-border">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 px-2 py-6 text-center md:py-9">
            <dt className="order-2 text-xs text-muted-foreground md:text-sm">{s.label}</dt>
            <dd className="order-1 font-accent text-step-4 leading-none font-light text-foreground tabular-nums">
              <Odometer value={s.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
