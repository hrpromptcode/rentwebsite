import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ReceiptText, Search, Ticket, Wallet, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { listEventOptions, listOrders, orderStats, orderTabCounts, orderTabStatuses, releaseLapsedHolds, type TicketOrderStatus } from "@rentweb/module-events/admin";
import { ORDER_STATUS, ORDER_TABS, SOURCE_LABEL, type OrderTab } from "@rentweb/module-events/admin/labels";
import { FilterTabs, NativeSelect, Pagination, StatusPill, formatThaiDateTime, formatThaiSession, formatThaiTime, qs } from "@rentweb/module-events/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { eventsBase } from "../_lib";

export const metadata: Metadata = { title: "คำสั่งซื้อบัตร" };

type SP = { tab?: string; q?: string; event?: string; page?: string };

export default async function TicketOrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const tab: OrderTab = (ORDER_TABS.find((t) => t.key === sp.tab)?.key ?? "pending") as OrderTab;
  const q = sp.q?.trim() ?? "";
  const eventId = sp.event && /^[0-9a-f-]{36}$/i.test(sp.event) ? sp.event : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = `${eventsBase(slug)}/orders`;

  const { list, counts, stats, events } = await tenantTx(ctx.tenant.id, async (tx) => {
    await releaseLapsedHolds(tx, ctx.tenant.id);
    const statuses = orderTabStatuses(tab) as TicketOrderStatus[] | null;
    return {
      list: await listOrders(tx, ctx.tenant.id, { eventId: eventId || null, status: statuses, q, page, pageSize: 25 }),
      counts: await orderTabCounts(tx, ctx.tenant.id, eventId || null),
      stats: await orderStats(tx, ctx.tenant.id, { eventId: eventId || null }),
      events: await listEventOptions(tx, ctx.tenant.id),
    };
  });
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const params_ = { tab: tab === "pending" ? "" : tab, q, event: eventId };
  const activeTab = ORDER_TABS.find((t) => t.key === tab)!;
  const selectedEvent = events.find((e) => e.id === eventId);

  return (
    <div className="space-y-6">
      <PageHeader title="คำสั่งซื้อบัตร" description={selectedEvent ? `เฉพาะงาน “${selectedEvent.title}”` : "ทุกงาน · สลิปที่รอตรวจอยู่ในคิว “ตรวจสลิป” ด้วย"} actions={<Button asChild variant="outline"><Link href={`/t/${slug}/payments`}><Wallet aria-hidden /> คิวตรวจสลิป</Link></Button>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="รอชำระ" value={fmtNumber(stats.pending)} icon={Clock} tone={stats.pending ? "primary" : "default"} href={`${base}${qs(params_, { tab: "", page: "" })}`} hint="ถือบัตรไว้จนหมดเวลา" />
        <KpiCard label="ชำระแล้ว" value={fmtNumber(stats.paid)} icon={ReceiptText} tone="success" href={`${base}${qs(params_, { tab: "paid", page: "" })}`} />
        <KpiCard label="บัตรที่ขายแล้ว" value={fmtNumber(stats.ticketsSold)} icon={Ticket} tone="accent" />
        <KpiCard label="รายรับ" value={thb(stats.revenue)} icon={Wallet} tone="success" hint="หักคืนเงินแล้ว" />
      </div>

      <FilterTabs active={tab} tabs={ORDER_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(params_, { tab: t.key === "pending" ? "" : t.key, page: "" })}` }))} />

      <form className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto]" action={base}>
        {tab !== "pending" && <input type="hidden" name="tab" value={tab} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาเลขคำสั่งซื้อ (TK-…) ชื่อ เบอร์โทร อีเมล" className="pl-9" aria-label="ค้นหาคำสั่งซื้อ" />
        </div>
        <NativeSelect name="event" defaultValue={eventId} aria-label="เลือกงาน">
          <option value="">ทุกงาน</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            ค้นหา
          </Button>
          {(q || eventId) && (
            <Button asChild variant="ghost">
              <Link href={`${base}${qs(params_, { q: "", event: "" })}`}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      {list.items.length === 0 ? (
        <EmptyState icon={ReceiptText} title={q ? "ไม่พบคำสั่งซื้อตามคำค้น" : `ไม่มีรายการใน “${activeTab.label}”`} description={q ? "ลองค้นด้วยเลขคำสั่งซื้อ (TK-1001) ชื่อ หรือเบอร์โทร" : activeTab.hint} />
      ) : (
        <div className="card divide-y py-0" data-testid="order-table">
          {list.items.map(({ order: o, event: e, session: s }) => (
            <Link key={o.id} href={`${base}/${o.id}`} className="grid gap-3 p-4 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)] sm:items-center sm:p-5" data-testid="order-row">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold" data-testid="order-row-number">
                    {o.number}
                  </span>
                  <StatusPill map={ORDER_STATUS} status={o.status} />
                  {o.source !== "online" && <Badge variant="outline">{SOURCE_LABEL[o.source] ?? o.source}</Badge>}
                </div>
                <p className="mt-1 truncate font-medium">{o.contactName}</p>
                <p className="truncate text-xs text-muted-foreground">{o.contactPhone ?? o.contactEmail ?? "—"}</p>
              </div>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{e.title}</p>
                <p className="truncate text-xs text-muted-foreground">{s ? `${s.name ? `${s.name} · ` : ""}${formatThaiSession(s.startsAt, s.endsAt)}` : "ไม่ระบุรอบ"}</p>
              </div>
              <div className="text-sm">
                <p className="font-medium tabular-nums">
                  {o.quantity} ใบ · {o.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  สั่งซื้อ {formatThaiDateTime(o.createdAt)}
                  {o.status === "pending" && o.holdUntil ? ` · ถือบัตรถึง ${formatThaiTime(o.holdUntil)}` : ""}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold tabular-nums">{o.total ? thb(o.total) : "ฟรี"}</p>
                <p className="text-xs text-muted-foreground">{o.refundedAmount > 0 ? `คืนแล้ว ${thb(o.refundedAmount)}` : o.status === "paid" && o.paidAt ? `ชำระ ${formatThaiDateTime(o.paidAt)}` : ""}</p>
              </div>
            </Link>
          ))}
          <Pagination page={list.page} pages={pages} total={list.total} baseHref={base} params={params_} label="คำสั่งซื้อ" />
        </div>
      )}
    </div>
  );
}
