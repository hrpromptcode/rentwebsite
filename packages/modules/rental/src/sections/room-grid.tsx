import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { HorizontalScroll } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { roomGrid } from "@rentweb/storefront/definitions";
import { CtaButton, Eyebrow, RevealHeading, Rise, Section, SectionHeading, StaggerCell, StaggerList, hasAccentFont } from "@rentweb/storefront";
import { RoomCard } from "../components/room-card";
import { PanoParallax } from "../components/pano";
import { RentalStyles } from "../components/rental-styles";
import { fromPrices } from "../services/availability";
import { listUnitTypes } from "../services/catalog";
import { L } from "../labels";

type Props = z.output<typeof roomGrid.schema>;

/**
 * Room types with their lowest nightly rate over the coming weeks ("from ฿x / night").
 * `editorial` (§7.3): panoramic cards on a pinned horizontal track (CSS sticky; native swipe on phones / reduced
 * motion) whose photos parallax inside their frames. `cards`: portrait cards with slow drift + hover photo swap.
 */
export async function RoomGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const { types, prices } = await withTenant(getDb(), tenantId, async (tx) => {
    const types = await listUnitTypes(tx, tenantId, { activeOnly: true, featuredOnly: p.featured, limit: p.limit });
    return { types, prices: await fromPrices(tx, tenantId, types) };
  });
  if (!types.length) return null;
  const accent = hasAccentFont(ctx);

  if (p.variant === "editorial") {
    const header = (
      <div className="container-x mb-8 grid gap-6 pt-[4.5rem] md:mb-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          {p.eyebrow && <Eyebrow text={p.eyebrow} index={`${String(types.length).padStart(2, "0")}`} className="mb-4" />}
          {p.heading && <RevealHeading text={p.heading} accent={accent} className="font-heading text-step-5 font-semibold text-balance" />}
        </div>
        <div className="flex flex-col gap-5 lg:col-span-5 lg:items-end lg:text-right">
          {p.subheading && <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">{p.subheading}</p>}
          <CtaButton href="/rooms" label={L.allRooms} variant="outline" size="lg" />
        </div>
      </div>
    );
    return (
      <section id={id} data-section="room-grid" data-heavy="" className="relative overflow-x-clip py-[calc(clamp(3rem,6vw,6rem)*var(--density,1))]">
        <RentalStyles />
        <PanoParallax>
          <HorizontalScroll label={p.heading || L.roomsTitle} header={header} trackClassName="md:!px-[max(var(--gutter),calc((100vw-96rem)/2+var(--gutter)))]" prevLabel="ห้องก่อนหน้า" nextLabel="ห้องถัดไป">
            {types.map((t, i) => (
              <RoomCard key={t.id} type={t} fromPrice={prices[t.id] ?? t.basePrice} variant="pano" index={i} total={types.length} priority={i === 0} />
            ))}
          </HorizontalScroll>
        </PanoParallax>
      </section>
    );
  }

  return (
    <Section id={id} type="room-grid">
      <RentalStyles />
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" accent={accent} />
        <StaggerList className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
          {types.map((t, i) => (
            <StaggerCell key={t.id} className="h-full">
              <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} index={i} total={types.length} />
            </StaggerCell>
          ))}
        </StaggerList>
        <Rise className="mt-12 flex justify-center">
          <CtaButton href="/rooms" label={L.allRooms} variant="outline" size="lg" />
        </Rise>
      </div>
    </Section>
  );
}
