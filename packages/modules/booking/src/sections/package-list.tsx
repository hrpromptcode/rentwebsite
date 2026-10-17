import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { packageList } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listClinicPackages } from "../services/clinic";
import { packagesEnabled } from "../services/config";
import { PackageCard } from "../components/cards";
import { L } from "../labels";

type Props = z.output<typeof packageList.schema>;

export async function PackageListSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  if (!packagesEnabled(ctx.tenant.modules, ctx.tenant.moduleConfig)) return null;
  const packages = await withTenant(getDb(), ctx.tenant.id, (tx) => listClinicPackages(tx, ctx.tenant.id, { limit: p.limit }));
  if (!packages.length) return null;
  return (
    <Section id={id} tone="surface">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <StaggerItem key={pkg.id} className="h-full">
              <PackageCard p={pkg} />
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-10 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/packages">{L.viewAllPackages}</Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
