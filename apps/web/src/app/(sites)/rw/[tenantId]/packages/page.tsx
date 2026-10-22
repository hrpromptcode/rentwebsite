import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, Wallet } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Rise, StaggerCell, StaggerList } from "@rentweb/storefront";
import { countActiveSessions, listClasses, listClinicPackages, packagesEnabled } from "@rentweb/module-booking/services";
import { INDEX_LABEL, ModuleIntro, PassTicket, lookOf, savePct } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, runtime.config.modules.includes("clinic") ? "clinic" : "booking", "packages", { title: runtime.config.modules.includes("clinic") ? "คอร์สและแพ็กเกจ" : "คลาสพาสและแพ็กเกจ" }) : {};
}

/**
 * /packages – clinic courses (clinic module) or class passes (booking module with moduleConfig.booking.packages) as
 * tilt tickets; the best value carries the animated gradient border + sticker.
 */
export default async function PackagesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!packagesEnabled(runtime.config.modules, runtime.config.moduleConfig)) return cmsFallback(runtime, "packages");
  const clinic = runtime.config.modules.includes("clinic");
  const look = lookOf(runtime.config);
  const customer = await getCurrentCustomer(tenantId);
  const { packages, sessionsLeft, dropIn } = await tenantTx(tenantId, async (tx) => {
    const packages = await listClinicPackages(tx, tenantId, { limit: 100 });
    const sessionsLeft = customer ? await countActiveSessions(tx, tenantId, customer) : 0;
    let dropIn: number | null = null;
    if (!clinic) {
      const prices = (await listClasses(tx, tenantId)).map((c) => c.price).filter((x) => x > 0);
      dropIn = prices.length ? Math.min(...prices) : null;
    }
    return { packages, sessionsLeft, dropIn };
  });
  const perks = clinic ? ["ราคาต่อครั้งถูกกว่าซื้อแยก", "จองใช้สิทธิ์ออนไลน์ได้ทันที", "ตรวจสอบครั้งคงเหลือได้ในบัญชี"] : ["ราคาต่อคลาสถูกกว่าจ่ายรายครั้ง", "ใช้สมัครเรียนออนไลน์ได้ทันที", "ดูจำนวนครั้งคงเหลือได้ในบัญชี"];
  const copy = clinic
    ? { eyebrow: "คอร์ส", heading: "คอร์สและแพ็กเกจ", lead: "ซื้อเป็นคอร์สเพื่อราคาที่คุ้มกว่า ตัดครั้งอัตโนมัติเมื่อเข้ารับบริการ", mine: "คอร์สของฉัน", empty: "ยังไม่มีคอร์สเปิดขายในขณะนี้", note: "คอร์สมีอายุการใช้งานนับจากวันที่ชำระเงิน ครั้งที่ไม่ได้ใช้ภายในกำหนดจะหมดอายุ สิทธิ์เฉพาะบุคคล ไม่สามารถโอนให้ผู้อื่นได้" }
    : { eyebrow: "คลาสพาส", heading: "คลาสพาสและแพ็กเกจ", lead: "ซื้อพาสครั้งเดียว ใช้สมัครเรียนคลาสไหนก็ได้ ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน", mine: "คลาสพาสของฉัน", empty: "ยังไม่มีคลาสพาสเปิดขายในขณะนี้", note: "คลาสพาสมีอายุการใช้งานนับจากวันที่ชำระเงิน ครั้งที่ไม่ได้ใช้ภายในกำหนดจะหมดอายุ สิทธิ์เฉพาะบุคคล ไม่สามารถโอนให้ผู้อื่นได้ หากยกเลิกคลาสตามเงื่อนไข ระบบคืนครั้งให้อัตโนมัติ" };
  // best value: biggest saving (clinic) / lowest price per class (passes)
  const scores = packages.map((p) => (clinic ? savePct(p) : -Math.round(p.price / Math.max(1, p.sessions))));
  const best = packages.length > 1 ? packages[scores.indexOf(Math.max(...scores))]?.id : undefined;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <ModuleIntro eyebrow={copy.eyebrow} index={`05 / ${INDEX_LABEL.packages}`} title={copy.heading} count={packages.length} countLabel={clinic ? "COURSES" : "PASSES"} lead={copy.lead}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {perks.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-primary" /> {p}
              </li>
            ))}
          </ul>
          {customer && (
            <Link href="/account/packages" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--foreground)_16%,transparent)] px-5 text-sm font-medium transition-colors hover:border-primary">
              <Wallet className="size-4" /> {copy.mine}
              {sessionsLeft > 0 ? ` · เหลือ ${sessionsLeft} ครั้ง` : ""}
            </Link>
          )}
        </div>
      </ModuleIntro>

      <section className="relative container-x pb-20 md:pb-32">
        {packages.length === 0 ? (
          <div className="bk-panel p-12 text-center text-muted-foreground">{copy.empty}</div>
        ) : (
          <StaggerList className={cn("grid gap-8 pt-2 sm:grid-cols-2", packages.length >= 3 ? "lg:grid-cols-3" : "lg:mx-auto lg:max-w-4xl")} stagger={0.1}>
            {packages.map((pkg, i) => (
              <StaggerCell key={pkg.id} className={cn("h-full", packages.length >= 3 && i % 3 === 1 && "lg:translate-y-10")}>
                <PassTicket p={pkg} look={look} highlight={pkg.id === best} dropIn={dropIn} buyLabel={clinic ? L.buyPackage : L.buyPass} index={i} />
              </StaggerCell>
            ))}
          </StaggerList>
        )}

        <Rise className="mt-20 flex items-start gap-3 border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] pt-6 text-sm leading-relaxed text-muted-foreground md:mt-28">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="max-w-3xl">{copy.note}</p>
        </Rise>
      </section>
    </PageBody>
  );
}
