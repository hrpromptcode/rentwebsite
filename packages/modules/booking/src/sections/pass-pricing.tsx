import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight, BadgeCheck, Ticket } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem, TiltCard } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { passPricing } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { listClinicPackages } from "../services/clinic";
import { listClasses } from "../services/classes";
import { packagesEnabled } from "../services/config";
import { L } from "../labels";

type Props = z.output<typeof passPricing.schema>;

/** Pricing-table style class passes (clinic_packages) with an optional drop-in column. */
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
  // the best value per class is highlighted
  const perSession = passes.map((x) => Math.round(x.price / Math.max(1, x.sessions)));
  const best = passes[perSession.indexOf(Math.min(...perSession))]?.id;
  const cols = passes.length + (dropIn ? 1 : 0);
  return (
    <Section id={id} tone="surface">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className={cn("grid gap-5", cols <= 2 ? "mx-auto max-w-3xl sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
          {dropIn && (
            <StaggerItem className="h-full">
              <div className="card flex h-full flex-col p-6">
                <p className="text-sm font-semibold tracking-[0.15em] text-muted-foreground uppercase">Drop-in</p>
                <p className="mt-1 font-heading text-xl font-semibold">เรียนรายครั้ง</p>
                <p className="mt-4 font-heading text-4xl font-semibold">
                  {thb(dropIn)} <span className="text-base font-normal text-muted-foreground">/ คลาส</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> จ่ายเฉพาะคลาสที่มา</li>
                  <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> ยืนยันทันที ยกเลิกได้ตามเงื่อนไข</li>
                </ul>
                <Button asChild variant="outline" size="lg" className="mt-auto pt-0">
                  <Link href="/schedule" className="mt-6">
                    เลือกรอบเรียน <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </StaggerItem>
          )}
          {passes.map((pass) => {
            const unit = Math.round(pass.price / Math.max(1, pass.sessions));
            const highlight = pass.id === best;
            const save = dropIn && dropIn > unit ? Math.round(((dropIn - unit) / dropIn) * 100) : pass.compareAtPrice && pass.compareAtPrice > pass.price ? Math.round(((pass.compareAtPrice - pass.price) / pass.compareAtPrice) * 100) : 0;
            return (
              <StaggerItem key={pass.id} className="h-full">
                <TiltCard max={4} className={cn("card relative flex h-full flex-col p-6", highlight && "border-primary ring-2 ring-primary/30")}>
                  {highlight && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">คุ้มที่สุด</span>}
                  <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                    <Ticket className="size-4 text-primary" /> {L.sessions(pass.sessions)}
                  </p>
                  <p className="mt-1 font-heading text-xl font-semibold">{pass.name}</p>
                  <p className="mt-4 font-heading text-4xl font-semibold">{thb(pass.price)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {thb(unit)} {L.perClass}
                    {save > 0 && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-ink">{L.save(save)}</span>}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {pass.serviceName ? `ใช้กับคลาส ${pass.serviceName}` : "ใช้ได้ทุกคลาส ทุกครู"}</li>
                    <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {L.validity(pass.validityDays)}</li>
                    {pass.description && <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {pass.description}</li>}
                  </ul>
                  <Button asChild size="lg" className="mt-auto" variant={highlight ? "default" : "outline"}>
                    <Link href={`/packages/${pass.id}/buy`} className="mt-6">
                      {L.buyPass} <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>
        <Reveal className="mt-8 text-center text-sm text-muted-foreground">
          ซื้อพาสแล้วเข้าสู่ระบบด้วยเบอร์โทร ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน ·{" "}
          <Link href="/packages" className="-my-3 inline-block py-3 font-medium text-primary underline-offset-4 hover:underline">
            ดูรายละเอียดพาสทั้งหมด
          </Link>
        </Reveal>
      </div>
    </Section>
  );
}
