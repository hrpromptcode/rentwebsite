import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Plus, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { addDays, bkkDateString, bkkDayStart, getBusinessHours, listServicesAdmin, listStaffAdmin, listTimeOff, parseYmd } from "@rentweb/module-booking/admin";
import { STAFF_KIND, THAI_WEEKDAYS_SHORT } from "@rentweb/module-booking/admin/labels";
import { Avatar } from "@rentweb/module-booking/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { WEEK_ORDER } from "./form-values";
import { ScheduleEditor } from "./schedule-editor";
import { StaffToggles } from "./staff-toggles";
import { TimeOffManager } from "./time-off";

export const metadata: Metadata = { title: "พนักงาน / ทรัพยากร" };

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const canWrite = hasRole(ctx, "manager");
  const today = bkkDateString(new Date());
  const ymd = parseYmd(today)!;
  const dayStart = bkkDayStart(ymd);
  const dayEnd = bkkDayStart(addDays(ymd, 1));

  const { staff, services, biz, closures } = await tenantTx(ctx.tenant.id, async (tx) => ({
    staff: await listStaffAdmin(tx, ctx.tenant.id, { dayStart, dayEnd }),
    services: await listServicesAdmin(tx, ctx.tenant.id),
    biz: await getBusinessHours(tx, ctx.tenant.id),
    closures: await listTimeOff(tx, ctx.tenant.id, { staffId: null }),
  }));
  const svcName = new Map(services.map((s) => [s.id, s.name]));
  const activeCount = staff.filter((s) => s.active).length;
  const bizSummary = WEEK_ORDER.map((w) => biz.days.find((d) => d.weekday === w)!);

  return (
    <div className="space-y-6">
      <PageHeader
        title="พนักงาน / ทรัพยากร"
        description={`${fmtNumber(activeCount)} คนพร้อมรับคิว · ทั้งหมด ${fmtNumber(staff.length)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/bookings`}>
                <CalendarDays aria-hidden /> ปฏิทินการจอง
              </Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href={`/t/${slug}/staff/new`}>
                  <Plus aria-hidden /> เพิ่มพนักงาน
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {staff.length === 0 ? (
            <EmptyState
              icon={Users}
              title="ยังไม่มีพนักงาน"
              description="เพิ่มช่าง หมอ หรือห้องให้บริการ แล้วเลือกบริการที่แต่ละคนทำได้ ลูกค้าจะจองคิวกับคนนั้นได้ทันที"
              action={
                canWrite ? (
                  <Button asChild>
                    <Link href={`/t/${slug}/staff/new`}>
                      <Plus aria-hidden /> เพิ่มพนักงาน
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2" data-testid="staff-list">
              {staff.map((s) => {
                const names = s.serviceIds.map((id) => svcName.get(id)).filter(Boolean) as string[];
                return (
                  <li key={s.id} className="card flex flex-col gap-4 p-4" style={{ borderTop: `3px solid ${s.color}` }}>
                    <Link href={`/t/${slug}/staff/${s.id}`} className="group flex items-start gap-3">
                      <Avatar src={s.avatar ? assetUrl(s.avatar) : null} name={s.name} color={s.color} size="lg" className={s.active ? "" : "opacity-50 grayscale"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-heading text-base font-semibold group-hover:text-primary">{s.name}</span>
                          {!s.active && <Badge variant="muted">ปิดใช้งาน</Badge>}
                          {s.kind !== "person" && <Badge variant="outline">{STAFF_KIND[s.kind] ?? s.kind}</Badge>}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">{s.title ?? (s.phone || "—")}</span>
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3.5" aria-hidden /> วันนี้ {s.todayBookings} คิว
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" aria-hidden /> {s.hasOwnSchedule ? "ตารางงานเฉพาะ" : "ตามเวลาร้าน"}
                          </span>
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{names.length ? `บริการ: ${names.join(" · ")}` : <span className="text-destructive">ยังไม่ได้เลือกบริการที่ให้ได้</span>}</p>
                    <div className="mt-auto border-t pt-3">
                      <StaffToggles slug={slug} id={s.id} name={s.name} active={s.active} online={s.acceptsOnlineBooking} canEdit={canWrite} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {canWrite ? (
            <ScheduleEditor
              slug={slug}
              staffId={null}
              own={biz.own}
              days={biz.own ? biz.days : biz.days.map((d) => ({ ...d, closed: false }))}
              canEdit={canWrite}
              description={biz.own ? undefined : "ยังไม่ได้ตั้งเวลาทำการ — ตอนนี้ช่องเวลาใช้ตารางของพนักงานแต่ละคน และปฏิทินแสดง 09:00–21:00 ปรับเวลาด้านล่างแล้วกดบันทึก"}
            />
          ) : (
            <div className="card p-4">
              <h2 className="font-heading text-base font-semibold">เวลาทำการของร้าน</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {bizSummary.map((d) => (
                  <li key={d.weekday} className="flex justify-between">
                    <span>{THAI_WEEKDAYS_SHORT[d.weekday]}</span>
                    <span className="tabular-nums text-muted-foreground">{d.closed ? "ปิด" : `${d.start}–${d.end}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <TimeOffManager
            slug={slug}
            staffId={null}
            today={today}
            canEdit={canWrite}
            rows={closures.map((c) => ({ id: c.id, staffName: c.staffName, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), reason: c.reason }))}
          />
        </div>
      </div>
    </div>
  );
}
