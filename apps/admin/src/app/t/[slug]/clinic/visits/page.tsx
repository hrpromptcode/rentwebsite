import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, HeartPulse, Search, Wallet, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { addDays, bkkDateString, bkkDayStart, listBookingsForVisits, listDoctors, listVisits, parseYmd, visitKpis, ymdToString } from "@rentweb/module-booking/admin";
import { VISIT_PAYMENT, VISIT_STATUS } from "@rentweb/module-booking/admin/labels";
import { ColorDot, FilterTabs, StatusPill, formatBkkTime, formatThaiYmd, qs } from "@rentweb/module-booking/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { CreateVisitDialog, OpenFromBookingButton } from "./visit-dialogs";

export const metadata: Metadata = { title: "การมาตรวจ" };

type SP = { date?: string; status?: string; q?: string };
const STATUSES = ["open", "completed", "cancelled"] as const;

export default async function VisitsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const tid = ctx.tenant.id;
  const today = bkkDateString(new Date());
  const ymd = (sp.date && parseYmd(sp.date)) || parseYmd(today)!;
  const date = ymdToString(ymd);
  const isToday = date === today;
  const from = bkkDayStart(ymd);
  const to = bkkDayStart(addDays(ymd, 1));
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : "all";
  const q = sp.q?.trim().slice(0, 60) ?? "";
  const base = `/t/${slug}/clinic/visits`;

  const { visits, allDay, kpis, queue, doctors } = await tenantTx(tid, async (tx) => {
    const [visits, allDay, kpis, queue, doctors] = await Promise.all([
      listVisits(tx, tid, { from, to, status, q }),
      status === "all" && !q ? Promise.resolve(null) : listVisits(tx, tid, { from, to }),
      visitKpis(tx, tid, from, to),
      listBookingsForVisits(tx, tid, { from, to }),
      listDoctors(tx, tid),
    ]);
    return { visits, allDay: allDay ?? visits, kpis, queue, doctors };
  });
  const counts = { all: allDay.length, open: 0, completed: 0, cancelled: 0 } as Record<string, number>;
  for (const v of allDay) counts[v.status] = (counts[v.status] ?? 0) + 1;
  const p = { date: isToday ? "" : date, status: status === "all" ? "" : status, q };
  const dayLabel = formatThaiYmd(date, { weekday: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isToday ? "การมาตรวจวันนี้" : "การมาตรวจ"}
        description={`${dayLabel}${isToday ? " (วันนี้)" : ""} · บันทึกการตรวจ หัตถการ ยา และรับชำระเงิน`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/clinic/patients`}>
                <HeartPulse aria-hidden /> ผู้ป่วย
              </Link>
            </Button>
            <CreateVisitDialog slug={slug} doctors={doctors.map((d) => ({ id: d.id, name: d.name, title: d.title }))} />
          </>
        }
      />

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="วันก่อนหน้า">
            <Link href={`${base}${qs(p, { date: ymdToString(addDays(ymd, -1)) })}`}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant={isToday ? "secondary" : "outline"}>
            <Link href={`${base}${qs(p, { date: "" })}`}>วันนี้</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="วันถัดไป">
            <Link href={`${base}${qs(p, { date: ymdToString(addDays(ymd, 1)) })}`}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        <form action={base} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-row">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <Input type="date" name="date" defaultValue={date} aria-label="เลือกวันที่" className="min-w-0 sm:w-44" />
          <div className="relative order-last col-span-2 min-w-0 flex-1 sm:order-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="ค้นหา HN / ชื่อผู้ป่วย / อาการ" className="pl-9" aria-label="ค้นหาการตรวจ" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              แสดง
            </Button>
            {q && (
              <Button asChild variant="ghost">
                <Link href={`${base}${qs(p, { q: "" })}`}>
                  <X aria-hidden /> ล้าง
                </Link>
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="ทั้งหมด" value={fmtNumber(kpis.total)} hint="ไม่รวมยกเลิก" icon={ClipboardList} tone="primary" />
        <KpiCard label="กำลังตรวจ" value={fmtNumber(kpis.open)} hint="ยังไม่ปิดบิล" icon={Activity} tone="accent" />
        <KpiCard label="เสร็จสิ้น" value={fmtNumber(kpis.completed)} icon={CheckCircle2} tone="success" />
        <KpiCard label="รับชำระ" value={thb(kpis.revenue)} icon={Wallet} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <FilterTabs
            active={status}
            tabs={[
              { key: "all", label: "ทั้งหมด", count: counts.all, href: `${base}${qs(p, { status: "" })}` },
              { key: "open", label: "กำลังตรวจ", count: counts.open ?? 0, href: `${base}${qs(p, { status: "open" })}` },
              { key: "completed", label: "เสร็จสิ้น", count: counts.completed ?? 0, href: `${base}${qs(p, { status: "completed" })}` },
              { key: "cancelled", label: "ยกเลิก", count: counts.cancelled ?? 0, href: `${base}${qs(p, { status: "cancelled" })}` },
            ]}
          />
          {visits.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={q || status !== "all" ? "ไม่พบการตรวจตามเงื่อนไข" : isToday ? "ยังไม่มีการตรวจวันนี้" : "ไม่มีการตรวจในวันนี้"}
              description={queue.length ? "รับผู้ป่วยจากนัดหมายด้านข้างเข้าตรวจ หรือเปิดการตรวจ walk-in" : "กด “เปิดการตรวจใหม่” เพื่อเริ่มบันทึกการตรวจผู้ป่วย walk-in"}
            />
          ) : (
            <div className="card py-0">
              <div className="min-w-0 overflow-x-auto">
                <Table data-testid="visits-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">เวลา</TableHead>
                      <TableHead>ผู้ป่วย</TableHead>
                      <TableHead className="hidden lg:table-cell">แพทย์</TableHead>
                      <TableHead className="hidden sm:table-cell">สถานะ</TableHead>
                      <TableHead className="w-px text-right">ยอด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((v) => (
                      <TableRow key={v.id} data-visit={v.id}>
                        <TableCell className="align-top tabular-nums text-muted-foreground">{formatBkkTime(v.visitedAt)}</TableCell>
                        <TableCell className="max-w-0 sm:max-w-none">
                          <Link href={`${base}/${v.id}`} className="block min-w-0 hover:text-primary">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">{v.patientName}</span>
                              <Badge variant="outline" className="hidden font-mono sm:inline-flex">
                                {v.hn}
                              </Badge>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              <span className="font-mono sm:hidden">{v.hn} · </span>
                              {v.diagnosis || v.chiefComplaint || "ยังไม่ได้บันทึกอาการ"}
                              {v.bookingNumber && ` · ${v.bookingNumber}`}
                            </span>
                            <span className="mt-1 flex gap-1 sm:hidden">
                              <StatusPill map={VISIT_STATUS} status={v.status} />
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {v.doctorName ? (
                            <span className="inline-flex items-center gap-2">
                              <ColorDot color={v.doctorColor ?? "#64748b"} /> {v.doctorName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusPill map={VISIT_STATUS} status={v.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top">
                          <span className="font-medium tabular-nums">{thb(v.total)}</span>
                          <span className="block text-xs text-muted-foreground">{VISIT_PAYMENT[v.paymentStatus]?.label ?? v.paymentStatus}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <Card className="min-w-0 self-start" data-testid="booking-queue">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" aria-hidden /> นัดหมายที่รอเข้าตรวจ
            </CardTitle>
            <CardDescription>{queue.length ? `${queue.length} นัด · กดรับเข้าตรวจเพื่อเปิดแฟ้มการตรวจ` : "ไม่มีนัดที่รอเข้าตรวจในวันนี้"}</CardDescription>
          </CardHeader>
          {queue.length > 0 && (
            <CardContent className="grid gap-2">
              {queue.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border p-3" data-booking={b.number}>
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{formatBkkTime(b.startsAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.customerName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.serviceName}
                      {b.staffName && ` · ${b.staffName}`}
                    </span>
                    <span className="mt-1 block">{b.patientHn ? <Badge variant="outline" className="font-mono">{b.patientHn}</Badge> : <Badge variant="warning">ผู้ป่วยใหม่</Badge>}</span>
                  </span>
                  <OpenFromBookingButton slug={slug} bookingId={b.id} isNew={!b.patientId} />
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
