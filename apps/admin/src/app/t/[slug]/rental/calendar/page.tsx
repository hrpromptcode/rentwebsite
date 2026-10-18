import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { occupancyMonth, parseYm } from "@rentweb/module-rental/admin";
import { THAI_MONTHS } from "@rentweb/module-rental/admin/labels";
import { bkkDateString, shiftMonth } from "@rentweb/module-rental/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../_lib";
import { OccupancyGrid } from "./occupancy-grid";

export const metadata: Metadata = { title: "ปฏิทินห้องว่าง" };

export default async function RentalCalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ month?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const today = bkkDateString();
  const month = parseYm(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const data = await tenantTx(ctx.tenant.id, (tx) => occupancyMonth(tx, ctx.tenant.id, month));
  if (!data) notFound();
  const [y, m] = month.split("-").map(Number) as [number, number];
  const base = `${rentalBase(slug)}/calendar`;
  const canWrite = hasRole(ctx, "manager");
  const totalUnits = data.types.filter((t) => t.type.active).reduce((s, t) => s + t.type.quantity, 0);
  const nights = data.types.length ? data.types[0]!.days.length : 0;
  const soldNights = data.types.filter((t) => t.type.active).reduce((s, t) => s + t.days.reduce((a, d) => a + d.booked, 0), 0);
  const occupancy = totalUnits && nights ? Math.round((soldNights / (totalUnits * nights)) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ปฏิทินห้องว่าง"
        description={`${THAI_MONTHS[m - 1]} ${y + 543} · ${data.types.length} ประเภทห้อง · ${totalUnits} ห้อง · อัตราเข้าพักทั้งเดือน ${occupancy}%`}
        actions={
          <nav aria-label="เลือกเดือน" className="inline-flex items-center rounded-xl border bg-card p-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label="เดือนก่อนหน้า">
              <Link href={`${base}?month=${shiftMonth(month, -1)}`}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <Button asChild variant={month === today.slice(0, 7) ? "default" : "ghost"} size="sm">
              <Link href={base}>เดือนนี้</Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" aria-label="เดือนถัดไป">
              <Link href={`${base}?month=${shiftMonth(month, 1)}`}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </nav>
        }
      />
      {data.types.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="ยังไม่มีประเภทห้องพัก"
          description="สร้างประเภทห้องพักก่อน แล้วปฏิทินจะแสดงห้องว่างและการจองของแต่ละประเภท"
          action={
            <Button asChild>
              <Link href={`${rentalBase(slug)}/units/new`}>เพิ่มประเภทห้องพัก</Link>
            </Button>
          }
        />
      ) : (
        <OccupancyGrid slug={slug} month={month} today={data.today} canWrite={canWrite} types={data.types.map((t) => ({ id: t.type.id, name: t.type.name, quantity: t.type.quantity, active: t.type.active, days: t.days }))} stays={data.stays} />
      )}
    </div>
  );
}
