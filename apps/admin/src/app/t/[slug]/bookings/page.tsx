import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CalendarCheck2, CheckCircle2, Clock3, Plus, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { isUuid } from "@rentweb/core";
import { cn } from "@rentweb/ui/lib/utils";
import { addDays, bkkDateString, bkkDayStart, bookingKpis, countPendingDeposits, dayHours, formatThaiYmd, listBookingsBetween, listStaff, parseYmd, weekdayOf, ymdToString } from "@rentweb/module-booking/admin";
import { BOOKING_STATUS } from "@rentweb/module-booking/admin/labels";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { CalendarToolbar } from "./calendar-toolbar";
import { bkkMinutes, STATUS_DOT } from "./calendar-style";
import { DayGrid, type GridColumn } from "./day-grid";
import { WeekList } from "./week-list";

export const metadata: Metadata = { title: "ปฏิทินการจอง" };

type SP = { date?: string; view?: string; staff?: string; status?: string; q?: string };

const LEGEND = ["pending", "confirmed", "checked_in", "in_progress", "completed", "no_show"] as const;

export default async function BookingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const base = `/t/${slug}/bookings`;
  const now = new Date();
  const today = bkkDateString(now);
  const date = sp.date && parseYmd(sp.date) ? sp.date : today;
  const ymd = parseYmd(date)!;
  const view = sp.view === "week" ? "week" : "day";
  const staffFilter = sp.staff === "none" || (sp.staff && isUuid(sp.staff)) ? sp.staff : "";
  const status = sp.status ?? "";
  const q = sp.q?.trim().slice(0, 60) ?? "";

  // range: the day, or Monday..Sunday of the week containing the date
  const weekStart = addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
  const fromYmd = view === "week" ? weekStart : ymd;
  const from = bkkDayStart(fromYmd);
  const to = bkkDayStart(addDays(fromYmd, view === "week" ? 7 : 1));

  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const [staff, list, hours, kpis, pendingDeposits] = await Promise.all([
      listStaff(tx, ctx.tenant.id),
      listBookingsBetween(tx, ctx.tenant.id, { from, to, staffId: staffFilter || null, status: status && status !== "all" ? status : null, q }),
      dayHours(tx, ctx.tenant.id, date),
      bookingKpis(tx, ctx.tenant.id, from, to),
      countPendingDeposits(tx, ctx.tenant.id),
    ]);
    return { staff, list, hours, kpis, pendingDeposits };
  });
  const { staff, hours, kpis, pendingDeposits } = data;
  const list = status ? data.list : data.list.filter((b) => b.status !== "cancelled");
  const canWrite = hasRole(ctx, "staff");

  const shift = (n: number) => ymdToString(addDays(ymd, n));
  const step = view === "week" ? 7 : 1;
  const dayHref = (d: string) => `${base}?${new URLSearchParams({ ...(d !== today ? { date: d } : {}), ...(staffFilter ? { staff: staffFilter } : {}), ...(status ? { status } : {}) }).toString()}`.replace(/\?$/, "");

  // columns: active staff (+ inactive staff that still have bookings that day) + "ไม่ระบุ"
  const columns: GridColumn[] = staff.map((s) => ({ id: s.id, name: s.name, color: s.color, avatar: s.avatar ? assetUrl(s.avatar) : null }));
  for (const b of list) if (b.staffId && !columns.some((c) => c.id === b.staffId)) columns.push({ id: b.staffId, name: b.staffName ?? "พนักงาน", color: b.staffColor ?? "#64748b", avatar: null });
  columns.push({ id: null, name: "ไม่ระบุ", color: "#94a3b8", avatar: null });
  const shownColumns = staffFilter === "none" ? columns.filter((c) => c.id === null) : staffFilter ? columns.filter((c) => c.id === staffFilter) : columns;

  // grid hours, widened to fit bookings outside business hours
  let openMin = hours.openMin;
  let closeMin = hours.closeMin;
  if (view === "day") {
    for (const b of list) {
      const s = bkkMinutes(b.startsAt);
      const e = bkkMinutes(b.endsAt) || 24 * 60;
      openMin = Math.min(openMin, Math.floor(s / 30) * 30);
      closeMin = Math.max(closeMin, Math.ceil((e <= s ? 24 * 60 : e) / 30) * 30);
    }
  }

  const titleDate = view === "week" ? `${formatThaiYmd(ymdToString(weekStart), { short: true })} – ${formatThaiYmd(ymdToString(addDays(weekStart, 6)), { short: true })}` : formatThaiYmd(date, { weekday: true });
  const nowMin = date === today ? bkkMinutes(now) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ปฏิทินการจอง"
        description={titleDate}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href={`${base}/new${date !== today ? `?date=${date}` : ""}`}>
                <Plus aria-hidden /> จองให้ลูกค้า (walk-in)
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={view === "week" ? "คิวสัปดาห์นี้" : "คิววันนี้"} value={fmtNumber(kpis.total)} icon={CalendarCheck2} tone="primary" className="p-4" />
        <KpiCard label="รอยืนยัน" value={fmtNumber(kpis.pending)} icon={Clock3} tone="accent" className="p-4" />
        <KpiCard label="เสร็จสิ้น" value={fmtNumber(kpis.completed)} hint={kpis.noShow ? `ไม่มา ${kpis.noShow}` : undefined} icon={CheckCircle2} tone="success" className="p-4" />
        <KpiCard label="รายได้" value={thb(kpis.revenue)} icon={Wallet} className="p-4" />
      </div>

      {pendingDeposits > 0 && (
        <Link href={`${base}?status=pending${date !== today ? `&date=${date}` : ""}${view === "week" ? "&view=week" : ""}`} className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertCircle className="size-5 shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1">
            มีสลิปมัดจำรอตรวจ <b>{pendingDeposits}</b> รายการ — เปิดการจองเพื่ออนุมัติหรือปฏิเสธ
          </span>
        </Link>
      )}

      <CalendarToolbar
        base={base}
        date={date}
        today={today}
        view={view}
        staff={staffFilter}
        status={status}
        q={q}
        prevDate={shift(-step)}
        nextDate={shift(step)}
        staffOptions={staff.map((s) => ({ id: s.id, name: s.name }))}
      />

      {view === "day" ? (
        <>
          {!hours.open && list.length === 0 && <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">วันนี้ไม่มีเวลาทำการตามตาราง (ร้านปิด) — ยังจองให้ลูกค้าได้ถ้าพนักงานมีตารางงาน</p>}
          <DayGrid
            slug={slug}
            date={date}
            columns={shownColumns}
            openMin={openMin}
            closeMin={closeMin}
            nowMin={nowMin}
            canCreate={canWrite}
            // a group booking served by several staff shows in each of their columns (SBR-004)
            bookings={list.flatMap((b) => (b.extraStaffIds.length ? [b.staffId, ...b.extraStaffIds] : [b.staffId]).map((sid) => ({ b, sid }))).map(({ b, sid }) => ({
              id: b.id,
              number: b.number,
              status: b.status,
              startsAt: b.startsAt.toISOString(),
              endsAt: b.endsAt.toISOString(),
              customerName: b.customerName,
              serviceName: b.serviceName,
              staffId: sid,
              partySize: b.partySize,
              paymentStatus: b.paymentStatus,
              depositAmount: b.depositAmount,
              payAtShop: b.payAtShop,
            }))}
          />
        </>
      ) : (
        <WeekList
          slug={slug}
          today={today}
          dayHref={dayHref}
          days={Array.from({ length: 7 }, (_, i) => {
            const d = addDays(weekStart, i);
            const s = ymdToString(d);
            return { ymd: s, weekday: weekdayOf(d), label: formatThaiYmd(s, { short: true }) };
          })}
          bookings={list.map((b) => ({
            id: b.id,
            number: b.number,
            status: b.status,
            source: b.source,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            customerName: b.customerName,
            customerPhone: b.customerPhone,
            serviceName: b.serviceName,
            staffName: b.staffName,
            staffColor: b.staffColor,
            price: b.price,
            payAtShop: b.payAtShop,
            day: bkkDateString(b.startsAt),
          }))}
        />
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="สีสถานะ">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", STATUS_DOT[s])} aria-hidden /> {BOOKING_STATUS[s]?.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
