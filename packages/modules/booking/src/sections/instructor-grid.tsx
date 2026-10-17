import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { instructorGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listInstructors } from "../services/classes";
import { InstructorCard } from "../components/class-cards";

type Props = z.output<typeof instructorGrid.schema>;

export async function InstructorGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const team = await withTenant(getDb(), ctx.tenant.id, (tx) => listInstructors(tx, ctx.tenant.id, { limit: p.limit }));
  if (!team.length) return null;
  return (
    <Section id={id}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((i) => (
            <StaggerItem key={i.id} className="h-full">
              <InstructorCard i={i} classes={i.classes} weeklySessions={i.weeklySessions} />
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-10 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/instructors">ดูครูทั้งหมด</Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
