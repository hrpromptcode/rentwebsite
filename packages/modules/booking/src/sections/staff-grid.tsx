import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { staffGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listStaff } from "../services/catalog";
import { StaffCard } from "../components/cards";
import { L } from "../labels";

type Props = z.output<typeof staffGrid.schema>;

export async function StaffGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const team = await withTenant(getDb(), ctx.tenant.id, (tx) => listStaff(tx, ctx.tenant.id, { onlineOnly: true, limit: p.limit }));
  if (!team.length) return null;
  return (
    <Section id={id}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((s) => (
            <StaggerItem key={s.id} className="h-full">
              <StaffCard s={{ ...s, serviceCount: s.serviceIds.length }} />
            </StaggerItem>
          ))}
        </Stagger>
        {team.length >= p.limit && (
          <Reveal className="mt-10 text-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/staff">{L.viewAllStaff}</Link>
            </Button>
          </Reveal>
        )}
      </div>
    </Section>
  );
}
