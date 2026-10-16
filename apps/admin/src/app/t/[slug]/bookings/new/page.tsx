import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { bkkDateString, listServiceOptions, listStaff, parseYmd } from "@rentweb/module-booking/admin";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { WalkInForm } from "./walk-in-form";

export const metadata: Metadata = { title: "จองให้ลูกค้า" };

type SP = { date?: string; time?: string; staff?: string; service?: string };

export default async function NewBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!hasRole(ctx, "staff")) redirect(`/t/${slug}/bookings`);
  const today = bkkDateString(new Date());
  const date = sp.date && parseYmd(sp.date) && sp.date >= today ? sp.date : today;
  const { services, staff } = await tenantTx(ctx.tenant.id, async (tx) => ({ services: await listServiceOptions(tx, ctx.tenant.id), staff: await listStaff(tx, ctx.tenant.id) }));
  const serviceId = sp.service && services.some((s) => s.id === sp.service) ? sp.service : "";
  const staffId = sp.staff && staff.some((s) => s.id === sp.staff) ? sp.staff : "";
  const time = sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : "";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปปฏิทิน">
          <Link href={`/t/${slug}/bookings${date !== today ? `?date=${date}` : ""}`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <PageHeader title="จองให้ลูกค้า (walk-in)" description="สำหรับลูกค้าที่มาหน้าร้าน หรือโทร/ทักแชตมาจอง — คิวจะถูกยืนยันทันที" className="min-w-0 flex-1" />
      </div>
      <WalkInForm
        slug={slug}
        today={today}
        initial={{ serviceId, staffId, date, time }}
        services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: s.price, capacity: s.capacity, requiresStaff: s.requiresStaff, categoryName: s.categoryName }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name, color: s.color, avatar: s.avatar ? assetUrl(s.avatar) : null, title: s.title, serviceIds: s.serviceIds, acceptsOnlineBooking: s.acceptsOnlineBooking }))}
      />
    </div>
  );
}
