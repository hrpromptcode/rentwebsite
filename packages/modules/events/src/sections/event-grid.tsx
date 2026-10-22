import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { cn } from "@rentweb/ui/lib/utils";
import { HoverPreview } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { eventGrid } from "@rentweb/storefront/definitions";
import { CtaButton, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { EventCard } from "../components/event-card";
import { EvStyles } from "../components/ev-styles";
import { eventCardStats, listEvents, listPublicEvents } from "../services/catalog";
import { L } from "../labels";

type Props = z.output<typeof eventGrid.schema>;

/** Poster-wall column count + vertical offsets by how many posters there are (an uneven wall, never a flat grid). */
function wall(n: number) {
  if (n <= 1) return { grid: "mx-auto max-w-md", offset: () => "" };
  if (n === 2) return { grid: "sm:grid-cols-2 max-w-4xl mx-auto", offset: (i: number) => (i % 2 ? "sm:translate-y-[12%]" : "") };
  if (n === 4) return { grid: "sm:grid-cols-2 lg:grid-cols-4", offset: (i: number) => (i % 2 ? "lg:translate-y-[14%]" : "") };
  return { grid: "sm:grid-cols-2 lg:grid-cols-3", offset: (i: number) => (i % 3 === 1 ? "lg:translate-y-[12%]" : "") };
}

/**
 * Upcoming (or past) published events. `cards` = a poster wall (tilt, beam glow, perforated ticket stub, giant date
 * stamps in the accent font, staggered columns); `list` = project-list rows with a cursor-following cover preview and
 * the cursor label "ซื้อบัตร".
 */
export async function EventGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const { events, stats } = await withTenant(getDb(), tenantId, async (tx) => {
    const filter = { category: p.category || null, featuredOnly: p.featured, limit: p.limit };
    // past events keep status "published" or were marked "ended" by the organiser – both belong in the archive
    const events = p.scope === "past" ? await listEvents(tx, tenantId, { ...filter, scope: "past", status: ["published", "ended"] }) : await listPublicEvents(tx, tenantId, filter);
    return { events, stats: await eventCardStats(tx, tenantId, events.map((e) => e.id)) };
  });
  if (!events.length) return null;
  const viewAll = p.scope === "past" ? "/events?scope=past" : "/events";
  const past = p.scope === "past";
  const count = String(events.length).padStart(2, "0");

  if (p.variant === "list") {
    return (
      <Section id={id} type="event-grid">
        <EvStyles />
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" index={count} />
          <HoverPreview as="div" width={340} ratio={1.25} className="border-t ev-hair">
            <StaggerList stagger={0.07}>
              {events.map((e, i) => (
                <StaggerCell key={e.id}>
                  <EventCard event={e} stats={stats.get(e.id)} variant="row" index={i} past={past} />
                </StaggerCell>
              ))}
            </StaggerList>
          </HoverPreview>
          {p.showViewAll && (
            <div className="mt-12 flex justify-center">
              <CtaButton href={viewAll} label={past ? L.past : L.allEvents} variant="outline" size="lg" />
            </div>
          )}
        </div>
      </Section>
    );
  }

  const w = wall(events.length);
  return (
    <Section id={id} type="event-grid" className="overflow-x-clip">
      <EvStyles />
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" index={count} />
        <StaggerList className={cn("grid gap-5 md:gap-6", w.grid, events.length > 1 && "lg:pb-[6%]")} stagger={0.1}>
          {events.map((e, i) => (
            <StaggerCell key={e.id} className="h-full">
              <div className={cn("h-full", w.offset(i))}>
                <EventCard event={e} stats={stats.get(e.id)} priority={i < 2} past={past} />
              </div>
            </StaggerCell>
          ))}
        </StaggerList>
        {p.showViewAll && (
          <div className="mt-12 flex justify-center md:mt-16">
            <CtaButton href={viewAll} label={past ? L.past : L.allEvents} variant="outline" size="lg" />
          </div>
        )}
      </div>
    </Section>
  );
}
