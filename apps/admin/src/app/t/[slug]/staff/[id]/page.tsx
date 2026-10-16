import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { bkkDateString, getBusinessHours, getStaffAdmin, getStaffSchedule, listServicesAdmin, listTimeOff } from "@rentweb/module-booking/admin";
import { STAFF_KIND } from "@rentweb/module-booking/admin/labels";
import { Avatar } from "@rentweb/module-booking/admin/ui";
import { assetUrl } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { staffToForm } from "../form-values";
import { ScheduleEditor } from "../schedule-editor";
import { StaffForm } from "../staff-form";
import { TimeOffManager } from "../time-off";

export const metadata: Metadata = { title: "ข้อมูลพนักงาน" };

export default async function StaffDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const st = await getStaffAdmin(tx, ctx.tenant.id, id);
    if (!st) return null;
    const [services, schedule, biz, timeOff] = await Promise.all([listServicesAdmin(tx, ctx.tenant.id), getStaffSchedule(tx, ctx.tenant.id, id), getBusinessHours(tx, ctx.tenant.id), listTimeOff(tx, ctx.tenant.id, { staffId: id })]);
    return { st, services, schedule, biz, timeOff };
  });
  if (!data) notFound();
  const { st, services, schedule, biz, timeOff } = data;
  const canWrite = hasRole(ctx, "manager");
  const today = bkkDateString(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการพนักงาน">
            <Link href={`/t/${slug}/staff`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <Avatar src={st.avatar ? assetUrl(st.avatar) : null} name={st.name} color={st.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{st.name}</h1>
              {st.active ? <Badge variant="success">ใช้งาน</Badge> : <Badge variant="muted">ปิดใช้งาน</Badge>}
              {!st.acceptsOnlineBooking && st.active && <Badge variant="warning">ไม่รับจองออนไลน์</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {STAFF_KIND[st.kind] ?? st.kind}
              {st.title && ` · ${st.title}`} · {st.serviceIds.length} บริการ
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/t/${slug}/bookings?staff=${st.id}`}>
            <CalendarDays aria-hidden /> ดูคิวของคนนี้
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ScheduleEditor slug={slug} staffId={st.id} own={schedule.own} days={schedule.days} businessDays={biz.own ? biz.days : biz.days.map((d) => ({ ...d, closed: false }))} canEdit={canWrite} />
        <TimeOffManager
          slug={slug}
          staffId={st.id}
          today={today}
          canEdit={canWrite}
          rows={timeOff.map((t) => ({ id: t.id, staffName: t.staffName, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), reason: t.reason }))}
        />
      </div>

      {canWrite ? (
        <StaffForm
          slug={slug}
          staffId={st.id}
          initial={staffToForm(st)}
          services={services.map((s) => ({ id: s.id, name: s.name, categoryName: s.categoryName, durationMin: s.durationMin, active: s.active }))}
          assetBase={assetUrl("/").replace(/\/$/, "")}
          canDelete
        />
      ) : (
        <p className="card p-6 text-sm text-muted-foreground">คุณมีสิทธิ์ดูอย่างเดียว — ติดต่อผู้จัดการร้านเพื่อแก้ไขข้อมูลพนักงาน</p>
      )}
    </div>
  );
}
