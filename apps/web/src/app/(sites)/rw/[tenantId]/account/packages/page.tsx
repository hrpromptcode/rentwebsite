import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Package, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { formatThaiDate, listPatientPackages, type PatientPackageItem } from "@rentweb/module-booking/services";
import { PackageStatusBadge } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "คอร์สของฉัน" };

/** /account/packages – the signed-in patient's courses with sessions left (clinic only). */
export default async function AccountPackagesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("clinic")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/packages")}`);
  const list = await tenantTx(tenantId, (tx) => listPatientPackages(tx, tenantId, customer));
  const active = list.filter((p) => p.status === "active" && !p.isExpired);
  const sessionsLeft = active.reduce((n, p) => n + p.sessionsLeft, 0);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> บัญชีของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">คอร์สของฉัน</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                ใช้งานได้ {active.length} คอร์ส · เหลือรวม {sessionsLeft} ครั้ง
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="h-11">
                <Link href="/account/bookings">
                  <CalendarDays /> การจองของฉัน
                </Link>
              </Button>
              <Button asChild className="h-11">
                <Link href="/packages">
                  <Sparkles /> ซื้อคอร์ส
                </Link>
              </Button>
            </div>
          </Reveal>

          {list.length === 0 ? (
            <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">ยังไม่มีคอร์ส เลือกคอร์สที่คุ้มกว่าซื้อแยกได้เลย</p>
              <Button asChild size="lg">
                <Link href="/packages">ดูคอร์สทั้งหมด</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-8 grid gap-3">
              {list.map((p) => (
                <StaggerItem key={p.id}>
                  <PackageRow p={p} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </PageBody>
  );
}

function PackageRow({ p }: { p: PatientPackageItem }) {
  const pct = p.sessionsTotal > 0 ? Math.round((p.sessionsLeft / p.sessionsTotal) * 100) : 0;
  const usable = p.status === "active" && !p.isExpired;
  return (
    <Link href={`/account/packages/${p.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5">
      {p.packageImage ? <Img src={p.packageImage} alt="" className="size-16 shrink-0 rounded-[var(--radius-lg)] object-cover" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-muted"><Package className="size-6 text-muted-foreground" /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{p.packageName}</p>
          <PackageStatusBadge status={p.status} expired={p.isExpired} />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.sessionsLeft} aria-valuemin={0} aria-valuemax={p.sessionsTotal} aria-label="ครั้งคงเหลือ">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${usable ? pct : 0}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {p.sessionsLeft}/{p.sessionsTotal} <span className="font-normal text-muted-foreground">ครั้ง</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.status === "pending" ? `รอชำระ ${thb(p.pricePaid)}` : p.expiresAt ? `${p.isExpired ? "หมดอายุเมื่อ" : "ใช้ได้ถึง"} ${formatThaiDate(p.expiresAt)}` : L.validity(365)}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
