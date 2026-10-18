import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, Plus, QrCode, ReceiptText, ScanLine, Search, Ticket, Users, Wallet, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { eventScopeCounts, eventsKpis, listEventsAdmin } from "@rentweb/module-events/admin";
import { EVENT_SCOPES, EVENT_STATUS, type EventScope } from "@rentweb/module-events/admin/labels";
import { FilterTabs, Pagination, StatusPill, daysUntilLabel, formatThaiDateRange, formatThaiSession, qs } from "@rentweb/module-events/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { eventsBase } from "./_lib";

export const metadata: Metadata = { title: "อีเวนต์" };

type SP = { tab?: string; q?: string; page?: string };

export default async function EventsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const canWrite = hasRole(ctx, "manager");
  const scope: EventScope = (EVENT_SCOPES.find((t) => t.key === sp.tab)?.key ?? "upcoming") as EventScope;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = eventsBase(slug);
  const now = new Date();

  const { list, counts, kpis } = await tenantTx(ctx.tenant.id, async (tx) => ({
    list: await listEventsAdmin(tx, ctx.tenant.id, { scope, q, page, perPage: 24, now }),
    counts: await eventScopeCounts(tx, ctx.tenant.id, now),
    kpis: await eventsKpis(tx, ctx.tenant.id, now),
  }));
  const params_ = { tab: scope === "upcoming" ? "" : scope, q };
  const activeTab = EVENT_SCOPES.find((t) => t.key === scope)!;
  const hasAny = counts.all > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="อีเวนต์"
        description={hasAny ? `${fmtNumber(kpis.upcomingEvents)} งานที่กำลังจะมาถึง · บัตรที่ขายแล้ว ${fmtNumber(kpis.ticketsAllTime)} ใบ · รายรับรวม ${thb(kpis.revenueAllTime)}` : "สร้างอีเวนต์ กำหนดรอบและประเภทบัตร แล้วเปิดขายบัตรออนไลน์พร้อม QR เช็กอินหน้างาน"}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/checkin`}>
                <ScanLine aria-hidden /> เช็กอินหน้างาน
              </Link>
            </Button>
            {canWrite && (
              <Button asChild>
                <Link href={`${base}/new`} data-testid="event-new">
                  <Plus aria-hidden /> สร้างอีเวนต์
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="บัตรที่ขายแล้ว (งานที่จะถึง)" value={fmtNumber(kpis.ticketsUpcoming)} icon={Ticket} tone="primary" hint={`รวมทุกงาน ${fmtNumber(kpis.ticketsAllTime)} ใบ`} href={`${base}/attendees`} />
        <KpiCard label="รายรับเดือนนี้" value={thb(kpis.revenueMonth)} icon={Wallet} tone="success" hint={`รวมทุกงาน ${thb(kpis.revenueAllTime)} (หักคืนเงินแล้ว)`} />
        <KpiCard label="เช็กอินวันนี้" value={fmtNumber(kpis.checkInsToday)} icon={QrCode} tone="accent" href={`${base}/checkin`} hint="สแกน QR หรือพิมพ์รหัสที่หน้าเช็กอิน" />
        <KpiCard label="คำสั่งซื้อรอชำระ" value={fmtNumber(kpis.pendingOrders)} icon={ReceiptText} tone={kpis.pendingOrders ? "primary" : "default"} href={`${base}/orders`} hint="ถือบัตรไว้จนกว่าจะชำระหรือหมดเวลา" />
      </div>

      <FilterTabs active={scope} tabs={EVENT_SCOPES.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(params_, { tab: t.key === "upcoming" ? "" : t.key, page: "" })}` }))} />

      <form className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]" action={base}>
        {scope !== "upcoming" && <input type="hidden" name="tab" value={scope} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาชื่องาน สถานที่ หมวดหมู่ ผู้จัด…" className="pl-9" aria-label="ค้นหาอีเวนต์" />
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
        <EmptyState
          icon={Ticket}
          title={q ? "ไม่พบอีเวนต์ตามคำค้น" : hasAny ? `ไม่มีรายการใน “${activeTab.label}”` : "ยังไม่มีอีเวนต์"}
          description={q ? "ลองค้นด้วยชื่องาน สถานที่ หรือหมวดหมู่" : hasAny ? activeTab.hint : "สร้างอีเวนต์แรก กำหนดรอบ ประเภทบัตร ราคา และจำนวน แล้วกดเผยแพร่ ลูกค้าจะซื้อบัตรและรับ QR ได้ทันที"}
          action={
            canWrite && !q ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> สร้างอีเวนต์
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card p-0" data-testid="event-list">
          <ul className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.rows.map(({ event: e, ...a }) => {
              const pct = a.capacity && a.capacity > 0 ? Math.min(100, Math.round((a.ticketsSold / a.capacity) * 100)) : null;
              const next = a.nextSession;
              return (
                <li key={e.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card" data-testid="event-card">
                  <Link href={`${base}/${e.id}`} className="relative block aspect-[16/9] bg-muted" aria-label={e.title}>
                    {e.cover ? (
                      <img src={assetUrl(e.cover)} alt={e.title} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <Ticket className="size-8" aria-hidden />
                      </span>
                    )}
                    <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <StatusPill map={EVENT_STATUS} status={e.status} />
                      {e.featured && <Badge>แนะนำ</Badge>}
                    </span>
                    {next && e.status === "published" && <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">{daysUntilLabel(next.startsAt, now)}</span>}
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      {e.category && <p className="text-xs font-medium uppercase tracking-wide text-primary">{e.category}</p>}
                      <h2 className="truncate font-heading text-lg font-semibold">
                        <Link href={`${base}/${e.id}`} className="hover:text-primary" data-testid="event-card-title">
                          {e.title}
                        </Link>
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{next ? formatThaiSession(next.startsAt, next.endsAt) : e.startsAt ? formatThaiDateRange(e.startsAt, e.endsAt) : "ยังไม่มีรอบ"}</span>
                      </p>
                      {e.venueName && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{e.venueName}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium tabular-nums">
                          {fmtNumber(a.ticketsSold)} {a.capacity ? `/ ${fmtNumber(a.capacity)}` : ""} ใบ
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.sessions} รอบ · {thb(a.revenue)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="สัดส่วนบัตรที่ขายแล้ว">
                        <div className={cn("h-full rounded-full", pct !== null && pct >= 100 ? "bg-rose-500" : "bg-primary")} style={{ width: `${pct ?? (a.ticketsSold ? 35 : 0)}%` }} />
                      </div>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" aria-hidden /> เช็กอินแล้ว {fmtNumber(a.checkedIn)}
                        </span>
                        {a.pendingOrders > 0 && <span className="text-amber-700">รอชำระ {fmtNumber(a.pendingOrders)}</span>}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <div className="flex gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`${base}/orders?event=${e.id}`}>คำสั่งซื้อ</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`${base}/attendees?event=${e.id}`}>ผู้เข้าร่วม</Link>
                        </Button>
                      </div>
                      <div className="flex gap-1">
                        {e.status === "published" && (
                          <Button asChild variant="ghost" size="icon-sm" aria-label="ดูบนหน้าร้าน">
                            <a href={`${ctx.storefrontUrl}/events/${encodeURIComponent(e.slug)}`} target="_blank" rel="noreferrer">
                              <ExternalLink aria-hidden />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="outline" size="sm">
                          <Link href={`${base}/${e.id}`}>{canWrite ? "จัดการ" : "ดู"}</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="อีเวนต์" />
        </div>
      )}
    </div>
  );
}
