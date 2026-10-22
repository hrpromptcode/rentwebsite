import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { staffGrid } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { listStaff } from "../services/catalog";
import { L } from "../labels";
import { lookOf } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { StaffPortraitCard } from "../components/hi/people-views";

type Props = z.output<typeof staffGrid.schema>;

/** Team in the motif frames (§5.3 doctors in arches, credentials revealed on hover; §5.5 soft pebble portraits). */
export async function StaffGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const team = await withTenant(getDb(), ctx.tenant.id, (tx) => listStaff(tx, ctx.tenant.id, { onlineOnly: true, limit: p.limit }));
  if (!team.length) return null;
  const look = lookOf(ctx.tenant);
  const cols = team.length <= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <Section id={id} type="staff-grid">
      <BookingStyles />
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" />
        <StaggerList className={cn("grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-14", cols, team.length <= 3 && "lg:mx-auto lg:max-w-5xl")} stagger={0.12}>
          {team.map((s, i) => (
            <StaggerCell key={s.id} className={cn("h-full", i % 2 === 1 && "lg:translate-y-14")}>
              <StaffPortraitCard s={s} look={look} index={i} serviceCount={s.serviceIds.length} />
            </StaggerCell>
          ))}
        </StaggerList>
        {team.length >= p.limit && (
          <Rise className="mt-16 text-center lg:mt-24">
            <CtaButton href="/staff" label={L.viewAllStaff} variant="outline" size="lg" magnetic={false} />
          </Rise>
        )}
      </div>
    </Section>
  );
}
