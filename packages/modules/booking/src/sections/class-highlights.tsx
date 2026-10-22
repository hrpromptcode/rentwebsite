import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { HorizontalScroll } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { classHighlights } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading, StaggerCell, StaggerList, allow3d, hasAccentFont } from "@rentweb/storefront";
import { listClasses } from "../services/classes";
import { L } from "../labels";
import { lookOf, pad2 } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { ClassStudioCard } from "../components/hi/class-views";

type Props = z.output<typeof classHighlights.schema>;

/**
 * Home-page classes. `editorial` with 4+ classes = pinned horizontal track of tall poster cards (§5.8, vertical scroll
 * drives the track; native swipe on phones / reduced motion); otherwise a calm grid.
 */
export async function ClassHighlightsSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  let classes = await withTenant(getDb(), ctx.tenant.id, (tx) => listClasses(tx, ctx.tenant.id, { featured: p.featured, level: p.level || null, limit: p.limit }));
  // a brand-new studio has no featured class yet → show every class instead of an empty block
  if (!classes.length && p.featured) classes = await withTenant(getDb(), ctx.tenant.id, (tx) => listClasses(tx, ctx.tenant.id, { level: p.level || null, limit: p.limit }));
  if (!classes.length) return null;
  const look = lookOf(ctx.tenant);
  const ctas = (
    <Rise className="mt-12 flex flex-wrap items-center justify-center gap-3 md:mt-16">
      <CtaButton href="/classes" label="ดูคลาสทั้งหมด" size="lg" />
      <CtaButton href="/schedule" label={L.schedule} variant="outline" size="lg" magnetic={false} />
    </Rise>
  );

  if (p.variant === "editorial" && classes.length >= 4 && allow3d(ctx, "auto")) {
    const head = <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" accent={hasAccentFont(ctx)} index={`(${pad2(classes.length)})`} />;
    return (
      <Section id={id} type="class-highlights" heavy className="!py-0">
        <BookingStyles />
        <HorizontalScroll
          label={p.heading || L.classes}
          /* the pinned stage is one viewport tall: lighter top padding + svh-sized posters keep the card titles above the fold */
          header={<div className="container-x pt-[calc(clamp(3.5rem,6vw,6.5rem)*var(--density,1))]">{head}</div>}
          trackClassName="gap-6 px-[var(--gutter)] md:gap-10 md:pl-[max(var(--gutter),calc((100vw-var(--container,80rem))/2+var(--gutter)))]"
        >
          {classes.map((c, i) => (
            <div key={c.id} className="w-[76vw] shrink-0 sm:w-[44vw] lg:w-[25vw]">
              <ClassStudioCard c={c} look={look} index={i} poster />
            </div>
          ))}
        </HorizontalScroll>
        <div className="container-x pb-[calc(clamp(4.5rem,9vw,9.5rem)*var(--density,1))]">{ctas}</div>
      </Section>
    );
  }

  return (
    <Section id={id} type="class-highlights">
      <BookingStyles />
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" accent={hasAccentFont(ctx)} />
        <StaggerList className={cn("grid gap-x-8 gap-y-14 sm:grid-cols-2", classes.length >= 3 ? "lg:grid-cols-3" : "lg:mx-auto lg:max-w-5xl")} stagger={0.1}>
          {classes.map((c, i) => (
            <StaggerCell key={c.id} className={cn("h-full", classes.length >= 3 && i % 3 === 1 && "lg:translate-y-14")}>
              <ClassStudioCard c={c} look={look} index={i} poster={p.variant === "editorial"} />
            </StaggerCell>
          ))}
        </StaggerList>
        {ctas}
      </div>
    </Section>
  );
}
