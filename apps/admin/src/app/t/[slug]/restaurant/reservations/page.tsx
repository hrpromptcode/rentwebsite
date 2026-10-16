import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, Phone, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { listReservationsForDay, reservationDayCounts, RESERVATION_STATUS_LABEL } from "@rentweb/module-restaurant/admin";
import { addDays, bangkokDate, bangkokParts, listZones } from "@rentweb/module-restaurant/services";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { fmtTime, todayYmd } from "../_components/elapsed";
import { absolutizeReservations } from "../_components/urls";
import { DateJump, NewReservationDialog } from "./reservation-dialog";
import { ReservationActions } from "./row-actions";

export const metadata: Metadata = { title: "จองโต๊ะ" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const WD_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TONE: Record<string, "success" | "warning" | "destructive" | "muted" | "soft" | "accent"> = { pending: "warning", confirmed: "success", seated: "accent", completed: "muted", cancelled: "destructive", no_show: "destructive" };
const ORDER: Record<string, number> = { seated: 0, confirmed: 1, pending: 2, completed: 3, no_show: 4, cancelled: 5 };

function fmtDayLong(ymd: string): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(bangkokDate(ymd, "12:00"));
}

export default async function ReservationsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string; all?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const today = todayYmd();
  const date = YMD.test(sp.date ?? "") ? sp.date! : today;
  const weekStart = addDays(date, -((bangkokParts(bangkokDate(date, "12:00")).weekday + 6) % 7));
  const showAll = sp.all === "1";

  const { rows, week, zones } = await tenantTx(ctx.tenant.id, async (tx) => ({
    rows: absolutizeReservations(await listReservationsForDay(tx, ctx.tenant.id, date)),
    week: await reservationDayCounts(tx, ctx.tenant.id, weekStart, 7),
    zones: await listZones(tx, ctx.tenant.id),
  }));
  const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const visible = (showAll ? rows : live).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt) || (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const base = `/t/${slug}/restaurant/reservations`;
  const canWrite = hasRole(ctx, "staff");
  const canMoney = hasRole(ctx, "manager");

  return (
    <div className="space-y-6">
      <PageHeader
        title="จองโต๊ะ"
        description={fmtDayLong(date) + (date === today ? " (วันนี้)" : "")}
        actions={
          <>
            <nav aria-label="เลือกวัน" className="inline-flex items-center rounded-xl border bg-card p-1">
              <Button asChild variant="ghost" size="icon-sm" aria-label="วันก่อนหน้า">
                <Link href={`${base}?date=${addDays(date, -1)}`}>
                  <ChevronLeft aria-hidden />
                </Link>
              </Button>
              <Button asChild variant={date === today ? "default" : "ghost"} size="sm">
                <Link href={base}>วันนี้</Link>
              </Button>
              <Button asChild variant="ghost" size="icon-sm" aria-label="วันถัดไป">
                <Link href={`${base}?date=${addDays(date, 1)}`}>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            </nav>
            <DateJump base={base} date={date} />
            {canWrite && <NewReservationDialog slug={slug} zones={zones} defaultDate={date} />}
          </>
        }
      />

      <section aria-label="ภาพรวมสัปดาห์" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="grid min-w-[640px] grid-cols-7 gap-2">
          {week.map((d) => {
            const p = bangkokParts(bangkokDate(d.ymd, "12:00"));
            const active = d.ymd === date;
            return (
              <li key={d.ymd}>
                <Link href={`${base}?date=${d.ymd}`} aria-current={active ? "date" : undefined} className={cn("block rounded-2xl border p-3 text-center transition-colors", active ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted", d.ymd === today && !active && "border-dashed border-primary/50")}>
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{WD_TH[p.weekday]}</span>
                  <span className={cn("block font-heading text-xl font-semibold", active && "text-primary")}>{p.d}</span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                    {d.total ? `${d.total} จอง · ${d.guests} คน` : "ว่าง"}
                  </span>
                  {d.pending > 0 && <Badge variant="warning" className="mt-1">{d.pending} รอยืนยัน</Badge>}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="การจองวันนี้" value={fmtNumber(live.length)} hint={rows.length !== live.length ? `+${rows.length - live.length} ยกเลิก/ไม่มา` : undefined} icon={CalendarCheck} tone="primary" />
        <KpiCard label="รอยืนยัน" value={fmtNumber(live.filter((r) => r.status === "pending").length)} icon={Clock} tone={live.some((r) => r.status === "pending") ? "accent" : "default"} />
        <KpiCard label="นั่งแล้ว" value={fmtNumber(live.filter((r) => r.status === "seated").length)} icon={Users} tone="success" />
        <KpiCard label="แขกทั้งหมด" value={fmtNumber(live.reduce((s, r) => s + r.partySize, 0))} hint="คน" icon={CalendarDays} />
      </section>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">รายการจอง</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={`${base}?date=${date}${showAll ? "" : "&all=1"}`}>{showAll ? "ซ่อนที่ยกเลิก" : `แสดงที่ยกเลิก/ไม่มา (${rows.length - live.length})`}</Link>
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={CalendarDays} title="ไม่มีการจองในวันนี้" description="การจองจากหน้าเว็บจะปรากฏที่นี่ หรือเพิ่มการจองทางโทรศัพท์เอง" action={canWrite ? <NewReservationDialog slug={slug} zones={zones} defaultDate={date} variant="outline" /> : undefined} />
      ) : (
        <ul className="grid gap-3">
          {visible.map((r) => (
            <li key={r.id} className={cn("card grid gap-3 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center", (r.status === "cancelled" || r.status === "no_show") && "opacity-60")}>
              <div className="flex items-center gap-3 sm:block">
                <p className="font-heading text-2xl font-semibold tabular-nums leading-none">{fmtTime(r.startsAt)}</p>
                <p className="text-xs text-muted-foreground">ถึง {fmtTime(r.endsAt)}</p>
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant={TONE[r.status] ?? "muted"}>{RESERVATION_STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {r.depositAmount > 0 && <Badge variant={r.payment?.status === "paid" ? "success" : "outline"}>มัดจำ {thb(r.depositAmount)}{r.payment?.status === "paid" ? " ชำระแล้ว" : r.payment?.status === "pending_verification" ? " รอตรวจสลิป" : " รอชำระ"}</Badge>}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden /> {r.partySize} คน
                  </span>
                  {r.zone && <span>โซน{r.zone}</span>}
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <Phone className="size-3.5" aria-hidden /> {r.phone}
                  </a>
                  <span className="text-xs">{r.number}</span>
                  {r.occasion && <Badge variant="soft">{r.occasion}</Badge>}
                </p>
                {r.note && <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">{r.note}</p>}
              </div>
              <ReservationActions slug={slug} r={r} canWrite={canWrite} canMoney={canMoney} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
