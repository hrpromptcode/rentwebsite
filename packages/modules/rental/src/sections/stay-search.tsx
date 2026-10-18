import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal, Parallax, Stagger, StaggerItem, TextReveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { staySearch } from "@rentweb/storefront/definitions";
import { StaySearchForm } from "../components/stay-search-form";
import { listUnitTypes } from "../services/catalog";
import { rentalConfig, type RentalConfig } from "../services/config";
import { addDays, bkkDateString, isValidYmd } from "../services/time";

type Props = z.output<typeof staySearch.schema>;

/** today / last bookable check-in / default check-out for the search widgets (civil Bangkok dates). */
export function searchDates(config: Pick<RentalConfig, "maxAdvanceDays">, now = new Date()): { today: string; maxDate: string } {
  const today = bkkDateString(now);
  return { today, maxDate: addDays(today, config.maxAdvanceDays) };
}

export interface StaySearchExtra {
  /** preselected search (from /stay?from&to&guests) */
  initial?: { from?: string | null; to?: string | null; guests?: number | null };
  /** render the search card only (used by the /stay page header) */
  bare?: boolean;
}

/**
 * Hero with a date-range search: check-in, check-out, guests → /stay?from&to&guests.
 * The first section of the home page is dark-on-photo, so the transparent header switches to light text (data-hero-dark).
 */
export async function StaySearchSection({ ctx, props: p, id, index, initial, bare }: { ctx: StorefrontCtx; props: Props; id: string; index: number } & StaySearchExtra) {
  const tenantId = ctx.tenant.id;
  const config = rentalConfig(ctx.tenant.moduleConfig);
  const types = await withTenant(getDb(), tenantId, (tx) => listUnitTypes(tx, tenantId, { activeOnly: true }));
  const maxGuests = Math.max(1, ...types.map((t) => t.maxGuests));
  const { today, maxDate } = searchDates(config);
  const from = initial?.from && isValidYmd(initial.from) && initial.from >= today ? initial.from : null;
  const to = from && initial?.to && isValidYmd(initial.to) && initial.to > from ? initial.to : null;
  const guests = initial?.guests && initial.guests > 0 ? Math.min(initial.guests, maxGuests) : 2;

  const form = <StaySearchForm today={today} maxDate={maxDate} maxGuests={maxGuests} initial={{ from, to, guests }} />;
  if (bare) return form;

  const transparentHeader = ctx.theme.layout.headerTransparent && index === 0;

  if (p.variant === "split") {
    return (
      <section id={id} className={cn("relative isolate overflow-hidden", transparentHeader ? "pt-28 md:pt-36" : "pt-12 md:pt-20", "pb-16 md:pb-24")}>
        <div className="container-x relative grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {p.eyebrow && (
              <Reveal>
                <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-primary-ink uppercase">{p.eyebrow}</p>
              </Reveal>
            )}
            {p.textReveal ? <TextReveal as="h1" text={p.heading} className="heading-display text-5xl font-semibold md:text-6xl xl:text-7xl" delay={0.1} /> : <h1 className="heading-display text-5xl font-semibold md:text-6xl xl:text-7xl">{p.heading}</h1>}
            {p.subheading && (
              <Reveal delay={0.35}>
                <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">{p.subheading}</p>
              </Reveal>
            )}
            <Reveal delay={0.45} className="mt-8">
              <div className="card p-4 md:p-5">{form}</div>
            </Reveal>
            {p.badges.length > 0 && (
              <Stagger className="mt-6 flex flex-wrap gap-2" stagger={0.05}>
                {p.badges.map((b) => (
                  <StaggerItem key={b}>
                    <Badge variant="soft" className="px-3 py-1 text-sm">
                      {b}
                    </Badge>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
          <div className="relative lg:col-span-6">
            <Reveal direction="scale" delay={0.2}>
              <Parallax speed={0.12} className="overflow-hidden rounded-[var(--radius-2xl)]">
                <Img src={p.image.url} alt={p.image.alt} className="aspect-[4/5] w-full object-cover" priority />
              </Parallax>
            </Reveal>
            {p.imageSecondary?.url && (
              <Reveal direction="up" delay={0.4} className="absolute -bottom-8 -left-6 hidden w-2/5 md:block">
                <Parallax speed={-0.1} className="overflow-hidden rounded-[var(--radius-xl)] shadow-2xl shadow-black/20">
                  <Img src={p.imageSecondary.url} alt={p.imageSecondary.alt} className="aspect-[4/3] w-full object-cover" />
                </Parallax>
              </Reveal>
            )}
          </div>
        </div>
      </section>
    );
  }

  // fullscreen (default): photo, headline bottom-left, the search card floating over the bottom edge
  return (
    <section id={id} data-hero-dark={index === 0 ? "" : undefined} className="relative isolate overflow-hidden text-white">
      <div className="relative flex min-h-[88svh] items-end">
        <div className="absolute inset-0 -z-10">
          <Parallax speed={0.25} scale className="h-full">
            <Img src={p.image.url} alt={p.image.alt} className="size-full object-cover" priority />
          </Parallax>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" style={{ opacity: Math.max(0.6, p.overlay + 0.3) }} />
        </div>
        <div className="container-x relative pb-44 pt-32 md:pb-40 md:pt-40">
          <div className="max-w-3xl">
            {p.eyebrow && (
              <Reveal>
                <p className="mb-4 text-xs font-semibold tracking-[0.3em] text-white/80 uppercase">{p.eyebrow}</p>
              </Reveal>
            )}
            {p.textReveal ? <TextReveal as="h1" text={p.heading} className="heading-display text-5xl font-semibold text-white md:text-7xl lg:text-8xl" delay={0.1} /> : <h1 className="heading-display text-5xl font-semibold text-white md:text-7xl lg:text-8xl">{p.heading}</h1>}
            {p.subheading && (
              <Reveal delay={0.35}>
                <p className="mt-6 max-w-xl text-lg text-white/85 md:text-xl">{p.subheading}</p>
              </Reveal>
            )}
            {p.badges.length > 0 && (
              <Stagger className="mt-6 flex flex-wrap gap-2" stagger={0.05} delay={0.4}>
                {p.badges.map((b) => (
                  <StaggerItem key={b}>
                    <span className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm text-white backdrop-blur">{b}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
            {p.stats.length > 0 && (
              <Stagger className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3" stagger={0.1} delay={0.5}>
                {p.stats.map((s) => (
                  <StaggerItem key={s.label}>
                    <div className="font-heading text-3xl font-semibold text-white md:text-4xl">{s.value}</div>
                    <div className="mt-1 text-sm text-white/70">{s.label}</div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </div>
      {/* the search card straddles the photo's bottom edge; on phones it sits below the headline at full width */}
      <div className="container-x relative -mt-32 pb-6 text-foreground md:-mt-28">
        <Reveal delay={0.5}>
          <div className="card border-white/40 bg-card/95 p-4 shadow-2xl shadow-black/20 backdrop-blur md:p-6">{form}</div>
        </Reveal>
      </div>
    </section>
  );
}
