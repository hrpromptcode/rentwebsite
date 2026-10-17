import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { countActiveSessions, listClinicPackages, packagesEnabled } from "@rentweb/module-booking/services";
import { PackageCard } from "@rentweb/module-booking/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, runtime.config.modules.includes("clinic") ? "clinic" : "booking", "packages", { title: runtime.config.modules.includes("clinic") ? "คอร์สและแพ็กเกจ" : "คลาสพาสและแพ็กเกจ" }) : {};
}

/** /packages – clinic courses (clinic module) or class passes (booking module with moduleConfig.booking.packages). */
export default async function PackagesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!packagesEnabled(runtime.config.modules, runtime.config.moduleConfig)) return cmsFallback(runtime, "packages");
  const clinic = runtime.config.modules.includes("clinic");
  const customer = await getCurrentCustomer(tenantId);
  const { packages, sessionsLeft } = await tenantTx(tenantId, async (tx) => ({
    packages: await listClinicPackages(tx, tenantId, { limit: 100 }),
    sessionsLeft: customer ? await countActiveSessions(tx, tenantId, customer) : 0,
  }));
  const perks = clinic ? ["ราคาต่อครั้งถูกกว่าซื้อแยก", "จองใช้สิทธิ์ออนไลน์ได้ทันที", "ตรวจสอบครั้งคงเหลือได้ในบัญชี"] : ["ราคาต่อคลาสถูกกว่าจ่ายรายครั้ง", "ใช้สมัครเรียนออนไลน์ได้ทันที", "ดูจำนวนครั้งคงเหลือได้ในบัญชี"];
  const copy = clinic
    ? { eyebrow: "คอร์ส", heading: "คอร์สและแพ็กเกจ", lead: "ซื้อเป็นคอร์สเพื่อราคาที่คุ้มกว่า ตัดครั้งอัตโนมัติเมื่อเข้ารับบริการ", mine: "คอร์สของฉัน", empty: "ยังไม่มีคอร์สเปิดขายในขณะนี้", note: "คอร์สมีอายุการใช้งานนับจากวันที่ชำระเงิน ครั้งที่ไม่ได้ใช้ภายในกำหนดจะหมดอายุ สิทธิ์เฉพาะบุคคล ไม่สามารถโอนให้ผู้อื่นได้" }
    : { eyebrow: "คลาสพาส", heading: "คลาสพาสและแพ็กเกจ", lead: "ซื้อพาสครั้งเดียว ใช้สมัครเรียนคลาสไหนก็ได้ ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน", mine: "คลาสพาสของฉัน", empty: "ยังไม่มีคลาสพาสเปิดขายในขณะนี้", note: "คลาสพาสมีอายุการใช้งานนับจากวันที่ชำระเงิน ครั้งที่ไม่ได้ใช้ภายในกำหนดจะหมดอายุ สิทธิ์เฉพาะบุคคล ไม่สามารถโอนให้ผู้อื่นได้ หากยกเลิกคลาสตามเงื่อนไข ระบบคืนครั้งให้อัตโนมัติ" };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{copy.eyebrow}</p>
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{copy.heading}</h1>
            <p className="mt-4 text-muted-foreground">{copy.lead}</p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {perks.map((p) => (
                <li key={p} className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-primary" /> {p}
                </li>
              ))}
            </ul>
          </div>
          {customer && (
            <Button asChild variant="outline" className="h-11">
              <Link href="/account/packages">
                <Wallet /> {copy.mine}{sessionsLeft > 0 ? ` · เหลือ ${sessionsLeft} ครั้ง` : ""}
              </Link>
            </Button>
          )}
        </Reveal>

        {packages.length === 0 ? (
          <div className="card mt-10 p-10 text-center text-muted-foreground">{copy.empty}</div>
        ) : (
          <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <StaggerItem key={pkg.id} className="h-full">
                <PackageCard p={pkg} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        <Reveal className="mt-12 flex items-start gap-3 rounded-[var(--radius-xl)] bg-muted/60 p-6 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>{copy.note}</p>
        </Reveal>
      </section>
    </PageBody>
  );
}
