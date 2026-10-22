import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { passPricing } from "@rentweb/storefront/definitions";
import { Rise, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { listClinicPackages } from "../services/clinic";
import { listClasses } from "../services/classes";
import { packagesEnabled } from "../services/config";
import { L } from "../labels";
import { lookOf } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { DropInTicket, PassTicket } from "../components/hi/pass-views";

type Props = z.output<typeof passPricing.schema>;

/** Class passes as tilt tickets (§5.8): huge session count, perforated stub, best value per class = gradient border. */
export async function PassPricingSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  if (!packagesEnabled(ctx.tenant.modules, ctx.tenant.moduleConfig)) return null;
  const { passes, dropIn } = await withTenant(getDb(), ctx.tenant.id, async (tx) => {
    const passes = await listClinicPackages(tx, ctx.tenant.id, { limit: p.limit });
    let dropIn: number | null = null;
    if (p.showDropIn) {
      const prices = (await listClasses(tx, ctx.tenant.id)).map((c) => c.price).filter((x) => x > 0);
      dropIn = prices.length ? Math.min(...prices) : null;
    }
    return { passes, dropIn };
  });
  if (!passes.length) return null;
  const look = lookOf(ctx.tenant);
  // the best value per class is highlighted
  const perSession = passes.map((x) => Math.round(x.price / Math.max(1, x.sessions)));
  const best = passes[perSession.indexOf(Math.min(...perSession))]?.id;
  const cols = passes.length + (dropIn ? 1 : 0);
  return (
    <Section id={id} type="pass-pricing" tone="surface" className="overflow-clip" style={{ "--bk-notch": "var(--surface)" } as React.CSSProperties}>
      <BookingStyles />
      <div aria-hidden className="bk-soft-bg pointer-events-none absolute inset-0" />
      <div className="container-x relative">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <StaggerList className={cn("grid gap-6", cols <= 2 ? "mx-auto max-w-3xl sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")} stagger={0.1}>
          {dropIn && (
            <StaggerCell className="h-full">
              <DropInTicket price={dropIn} />
            </StaggerCell>
          )}
          {passes.map((pass, i) => (
            <StaggerCell key={pass.id} className="h-full">
              <PassTicket p={pass} look={look} highlight={pass.id === best} dropIn={dropIn} buyLabel={L.buyPass} index={i} showImage={false} />
            </StaggerCell>
          ))}
        </StaggerList>
        <Rise className="mt-10 text-center text-sm text-muted-foreground">
          ซื้อพาสแล้วเข้าสู่ระบบด้วยเบอร์โทร ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน ·{" "}
          <Link href="/packages" className="-my-3 inline-block py-3 font-medium text-primary-ink underline-offset-4 hover:underline">
            ดูรายละเอียดพาสทั้งหมด
          </Link>
        </Rise>
      </div>
    </Section>
  );
}
