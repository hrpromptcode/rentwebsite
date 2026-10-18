import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { roomGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { RoomCard } from "../components/room-card";
import { fromPrices } from "../services/availability";
import { listUnitTypes } from "../services/catalog";
import { L } from "../labels";

type Props = z.output<typeof roomGrid.schema>;

/** Room types with their lowest nightly rate over the coming weeks ("from ฿x / night"). */
export async function RoomGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const { types, prices } = await withTenant(getDb(), tenantId, async (tx) => {
    const types = await listUnitTypes(tx, tenantId, { activeOnly: true, featuredOnly: p.featured, limit: p.limit });
    return { types, prices: await fromPrices(tx, tenantId, types) };
  });
  if (!types.length) return null;
  return (
    <Section id={id} tone={p.variant === "editorial" ? "surface" : "default"}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        {p.variant === "editorial" ? (
          <div className="mx-auto grid max-w-6xl gap-14 md:gap-20">
            {types.map((t, i) => (
              <Reveal key={t.id} delay={0.05}>
                <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} variant="editorial" className={i % 2 ? "md:[&>a]:order-2" : undefined} priority={i === 0} />
              </Reveal>
            ))}
          </div>
        ) : (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((t) => (
              <StaggerItem key={t.id} className="h-full">
                <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <Reveal className="mt-10 text-center">
          <Button asChild size="lg" variant="outline">
            <Link href="/rooms">
              {L.allRooms} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
