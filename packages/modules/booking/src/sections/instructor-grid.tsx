import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { instructorGrid } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { listInstructors } from "../services/classes";
import { lookOf } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { InstructorPillCard } from "../components/hi/people-views";

type Props = z.output<typeof instructorGrid.schema>;

/** Instructors as tall pill portraits with a pointer tilt + specialty chips (§5.8). */
export async function InstructorGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const team = await withTenant(getDb(), ctx.tenant.id, (tx) => listInstructors(tx, ctx.tenant.id, { limit: p.limit }));
  if (!team.length) return null;
  const look = lookOf(ctx.tenant);
  return (
    <Section id={id} type="instructor-grid">
      <BookingStyles />
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <StaggerList className={cn("grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-14", team.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")} stagger={0.12}>
          {team.map((i, n) => (
            <StaggerCell key={i.id} className={cn("h-full", n % 2 === 1 && "lg:translate-y-12")}>
              <InstructorPillCard i={i} classes={i.classes} weeklySessions={i.weeklySessions} look={look === "default" ? "studio" : look} index={n} />
            </StaggerCell>
          ))}
        </StaggerList>
        <Rise className="mt-16 text-center lg:mt-24">
          <CtaButton href="/instructors" label="ดูครูทั้งหมด" variant="outline" size="lg" magnetic={false} />
        </Rise>
      </div>
    </Section>
  );
}
