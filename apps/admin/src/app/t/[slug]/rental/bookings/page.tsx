import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, CalendarRange, Clock, DoorOpen, LogIn, LogOut, Moon, Search, Settings2, Users, Wallet, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { lapsedHoldCount, listStaysAdmin, stayKpis, stayTabCounts } from "@rentweb/module-rental/admin";
import { SOURCE_LABEL, STAY_PAYMENT_STATUS, STAY_STATUS, STAY_TABS, type StayTab } from "@rentweb/module-rental/admin/labels";
import { FilterTabs, Pagination, StatusPill, bkkDateString, formatThaiRange, formatThaiYmd, qs } from "@rentweb/module-rental/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../_lib";

export const metadata: Metadata = { title: "การจองห้องพัก" };

type SP = { tab?: string; q?: string; page?: string };

export default async function StaysPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const tab: StayTab = (STAY_TABS.find((t) => t.key === sp.tab)?.key ?? "arrivals") as StayTab;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = `${rentalBase(slug)}/bookings`;
  const today = bkkDateString();

  const { list, counts, kpis, lapsed } = await tenantTx(ctx.tenant.id, async (tx) => ({
    list: await listStaysAdmin(tx, ctx.tenant.id, { tab, q, page, perPage: 25 }),
    counts: await stayTabCounts(tx, ctx.tenant.id),
    kpis: await stayKpis(tx, ctx.tenant.id),
    lapsed: await lapsedHoldCount(tx, ctx.tenant.id),
  }));
  const params_ = { tab: tab === "arrivals" ? "" : tab, q };
  const activeTab = STAY_TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="การจองห้องพัก"
        description={`${formatThaiYmd(today, { weekday: true })} · เช็กอิน ${fmtNumber(kpis.arrivalsToday)} · เข้าพักอยู่ ${fmtNumber(kpis.inHouse)} · เช็กเอาต์ ${fmtNumber(kpis.departuresToday)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${rentalBase(slug)}/calendar`}>
                <CalendarRange aria-hidden /> ปฏิทินห้องว่าง
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${rentalBase(slug)}/settings`}>
                <Settings2 aria-hidden /> ตั้งค่าการจอง
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="เช็กอินวันนี้" value={fmtNumber(kpis.arrivalsToday)} icon={LogIn} tone="primary" href={`${base}?tab=arrivals`} />
        <KpiCard label="เข้าพักอยู่" value={fmtNumber(kpis.inHouse)} icon={BedDouble} tone="accent" href={`${base}?tab=inhouse`} hint={`ห้องที่ใช้คืนนี้ ${fmtNumber(kpis.occupancyToday.booked)} / ${fmtNumber(kpis.occupancyToday.total)}`} />
        <KpiCard label="เช็กเอาต์วันนี้" value={fmtNumber(kpis.departuresToday)} icon={LogOut} href={`${base}?tab=departures`} />
        <KpiCard label="รอชำระเงิน" value={fmtNumber(kpis.awaitingPayment)} icon={Wallet} tone={kpis.awaitingPayment ? "primary" : "default"} hint={lapsed ? `${fmtNumber(lapsed)} รายการหมดเวลาถือห้องแล้ว` : "ถือห้องไว้จนกว่าจะชำระ"} />
        <KpiCard label="รายรับเดือนนี้" value={thb(kpis.revenueMonth)} icon={DoorOpen} tone="success" hint="ยอดที่รับชำระแล้วของการเข้าพักเดือนนี้" />
      </div>

      <FilterTabs active={tab} tabs={STAY_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(params_, { tab: t.key === "arrivals" ? "" : t.key, page: "" })}` }))} />

      <form className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]" action={base}>
        {tab !== "arrivals" && <input type="hidden" name="tab" value={tab} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาหมายเลขการจอง ชื่อ เบอร์โทร หมายเลขห้อง…" className="pl-9" aria-label="ค้นหาการจอง" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            ค้นหา
          </Button>
          {q && (
            <Button asChild variant="ghost">
              <Link href={`${base}${qs(params_, { q: "" })}`}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState icon={BedDouble} title={q ? "ไม่พบการจองตามคำค้น" : `ไม่มีรายการใน “${activeTab.label}”`} description={q ? "ลองค้นด้วยหมายเลขการจอง (ST-…) ชื่อ หรือเบอร์โทร" : activeTab.hint} />
      ) : (
        <div className="card divide-y py-0" data-testid="stay-table">
          {list.rows.map((s) => {
            const pay = STAY_PAYMENT_STATUS[s.paymentStatus] ?? s.paymentStatus;
            return (
              <Link key={s.id} href={`${base}/${s.id}`} className="grid gap-3 p-4 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] sm:items-center sm:p-5" data-testid="stay-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold" data-testid="stay-row-number">
                      {s.number}
                    </span>
                    <StatusPill map={STAY_STATUS} status={s.status} />
                    {s.source !== "online" && <Badge variant="outline">{SOURCE_LABEL[s.source] ?? s.source}</Badge>}
                  </div>
                  <p className="mt-1 truncate font-medium">{s.guestName}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.guestPhone ?? "—"}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{s.typeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.unitNumber ? `ห้อง ${s.unitNumber} · ` : ""}
                    <Users className="inline size-3" aria-hidden /> {s.guests} ท่าน
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-medium tabular-nums">{formatThaiRange(s.checkIn, s.checkOut)}</p>
                  <p className="text-xs text-muted-foreground">
                    <Moon className="inline size-3" aria-hidden /> {s.nights} คืน
                    {s.status === "pending" && s.holdUntil && (
                      <>
                        {" "}
                        · <Clock className="inline size-3" aria-hidden /> ถือห้องถึง {new Date(s.holdUntil).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                      </>
                    )}
                  </p>
                </div>
                <div className="text-sm sm:text-right">
                  <p className="font-semibold tabular-nums">{thb(s.total)}</p>
                  <p className={s.paymentStatus === "paid" ? "text-xs text-emerald-700" : s.paymentStatus === "unpaid" ? "text-xs text-amber-700" : "text-xs text-muted-foreground"}>
                    {pay}
                    {s.paidAmount > 0 && s.paidAmount < s.total ? ` (${thb(s.paidAmount)})` : ""}
                  </p>
                </div>
              </Link>
            );
          })}
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="การจอง" />
        </div>
      )}
    </div>
  );
}
