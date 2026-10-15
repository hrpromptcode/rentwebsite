import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { countActiveSessions, listClinicPackages } from "@rentweb/module-booking/services";
import { PackageCard } from "@rentweb/module-booking/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "คอร์สและแพ็กเกจ" };

/** /packages – clinic courses (clinic module only). */
export default async function PackagesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("clinic")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const { packages, sessionsLeft } = await tenantTx(tenantId, async (tx) => ({
    packages: await listClinicPackages(tx, tenantId, { limit: 100 }),
    sessionsLeft: customer ? await countActiveSessions(tx, tenantId, customer) : 0,
  }));
  const perks = ["ราคาต่อครั้งถูกกว่าซื้อแยก", "จองใช้สิทธิ์ออนไลน์ได้ทันที", "ตรวจสอบครั้งคงเหลือได้ในบัญชี"];

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">คอร์ส</p>
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">คอร์สและแพ็กเกจ</h1>
            <p className="mt-4 text-muted-foreground">ซื้อเป็นคอร์สเพื่อราคาที่คุ้มกว่า ตัดครั้งอัตโนมัติเมื่อเข้ารับบริการ</p>
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
                <Wallet /> คอร์สของฉัน{sessionsLeft > 0 ? ` · เหลือ ${sessionsLeft} ครั้ง` : ""}
              </Link>
            </Button>
          )}
        </Reveal>

        {packages.length === 0 ? (
          <div className="card mt-10 p-10 text-center text-muted-foreground">ยังไม่มีคอร์สเปิดขายในขณะนี้</div>
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
          <p>คอร์สมีอายุการใช้งานนับจากวันที่ชำระเงิน ครั้งที่ไม่ได้ใช้ภายในกำหนดจะหมดอายุ สิทธิ์เฉพาะบุคคล ไม่สามารถโอนให้ผู้อื่นได้</p>
        </Reveal>
      </section>
    </PageBody>
  );
}
