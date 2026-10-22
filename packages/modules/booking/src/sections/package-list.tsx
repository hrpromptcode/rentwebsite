import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { packageList } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { listClinicPackages } from "../services/clinic";
import { packagesEnabled } from "../services/config";
import { L } from "../labels";
import { lookOf } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { PassTicket, savePct } from "../components/hi/pass-views";

type Props = z.output<typeof packageList.schema>;

/** Courses as glass tickets (§5.3): the best saving gets the animated gradient border + sticker. */
export async function PackageListSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  if (!packagesEnabled(ctx.tenant.modules, ctx.tenant.moduleConfig)) return null;
  const packages = await withTenant(getDb(), ctx.tenant.id, (tx) => listClinicPackages(tx, ctx.tenant.id, { limit: p.limit }));
  if (!packages.length) return null;
  const look = lookOf(ctx.tenant);
  const saves = packages.map((x) => savePct(x));
  const best = saves.some((v) => v > 0) ? packages[saves.indexOf(Math.max(...saves))]?.id : undefined;
  return (
    <Section id={id} type="package-list" tone="surface" className="overflow-clip" style={{ "--bk-notch": "var(--surface)" } as React.CSSProperties}>
      <BookingStyles />
      <div aria-hidden className="bk-soft-bg pointer-events-none absolute inset-0" />
      <div className="container-x relative">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        {/* phones: snap rail (the next ticket peeks in) instead of a ~2 400 px column of tall arch tickets */}
        <StaggerList className={cn("bk-rail grid auto-cols-[82%] grid-flow-col gap-4 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-8", packages.length >= 3 ? "lg:grid-cols-3" : "lg:mx-auto lg:max-w-4xl")} stagger={0.12}>
          {packages.map((pkg, i) => (
            <StaggerCell key={pkg.id} className="h-full snap-start">
              <PassTicket p={pkg} look={look} highlight={pkg.id === best} buyLabel={L.buyPackage} index={i} />
            </StaggerCell>
          ))}
        </StaggerList>
        <Rise className="mt-14 text-center">
          <CtaButton href="/packages" label={L.viewAllPackages} variant="outline" size="lg" magnetic={false} />
        </Rise>
      </div>
    </Section>
  );
}
