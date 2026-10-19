import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Search, TrendingUp, X, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { listAdminTopupOrders, topupKpis, topupTabCounts } from "@rentweb/module-topup/admin";
import { ORDER_TABS, type OrderTab } from "@rentweb/module-topup/admin/labels";
import { FilterTabs, Pagination, qs } from "@rentweb/module-topup/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber, fmtRelative, startOfTodayBangkok, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "รายการเติม" };

type SP = { tab?: string; q?: string; from?: string; to?: string; page?: string };

export default async function TopupOrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const tab = (ORDER_TABS.some((t) => t.key === sp.tab) ? sp.tab : "manual") as OrderTab;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters = { q: sp.q?.trim() || "", from: sp.from || "", to: sp.to || "" };
  const hasFilters = Object.values(filters).some(Boolean);
  const base = `/t/${slug}/topup/orders`;

  const { list, counts, kpi } = await tenantTx(ctx.tenant.id, async (tx) => ({
    list: await listAdminTopupOrders(tx, ctx.tenant.id, { tab, q: filters.q, from: filters.from || null, to: filters.to || null, page, perPage: 20 }),
    counts: await topupTabCounts(tx, ctx.tenant.id),
    kpi: await topupKpis(tx, ctx.tenant.id, startOfTodayBangkok()),
  }));
  const params_ = { tab, ...filters };
  const canWrite = hasRole(ctx, "manager");

  return (
    <div className="space-y-6">
      <PageHeader title="รายการเติม" description={`${fmtNumber(list.total)} รายการ${hasFilters ? " (ตามตัวกรอง)" : tab !== "all" ? ` · ${ORDER_TABS.find((t) => t.key === tab)?.label}` : ""}`} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="รอเติม" value={fmtNumber(counts.manual)} icon={Clock} tone={counts.manual > 0 ? "accent" : "default"} hint="ต้องให้ทีมกดเติม" />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="รอตรวจสลิป" value={fmtNumber(counts.verify)} icon={Zap} tone={counts.verify > 0 ? "primary" : "default"} />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="ยอดขายวันนี้" value={thb(kpi.revenue)} icon={TrendingUp} tone="success" hint={`${fmtNumber(kpi.count)} รายการที่ชำระแล้ว`} />
        <KpiCard className="gap-3 p-4 sm:gap-4 sm:p-5" label="กำไรวันนี้" value={thb(kpi.profit)} icon={CheckCircle2} hint={`สำเร็จ ${fmtNumber(kpi.fulfilled)} รายการ`} />
      </div>

      <FilterTabs active={tab} tabs={ORDER_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(filters, { tab: t.key })}` }))} />

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]" action={base}>
        <input type="hidden" name="tab" value={tab} />
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="เลขที่รายการ UID เบอร์โทร หรือชื่อลูกค้า…" className="pl-9" aria-label="ค้นหารายการเติม" />
        </div>
        <Input type="date" name="from" defaultValue={filters.from} aria-label="ตั้งแต่วันที่" />
        <Input type="date" name="to" defaultValue={filters.to} aria-label="ถึงวันที่" />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
            ค้นหา
          </Button>
          {hasFilters && (
            <Button asChild variant="ghost" aria-label="ล้างตัวกรอง">
              <Link href={`${base}${qs({ tab })}`}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={hasFilters ? "ไม่พบรายการตามเงื่อนไข" : tab === "manual" ? "ไม่มีรายการรอเติม" : tab === "verify" ? "ไม่มีสลิปรอตรวจ" : "ยังไม่มีรายการ"}
          description={hasFilters ? "ลองเปลี่ยนตัวกรองหรือล้างการค้นหา" : tab === "manual" ? "เมื่อลูกค้าชำระเงินสำหรับแพ็กเกจแบบเติมมือ รายการจะเข้าคิวที่นี่" : "เมื่อลูกค้าสั่งเติมผ่านหน้าร้าน รายการจะแสดงที่นี่"}
          action={
            tab !== "all" ? (
              <Button asChild variant="outline">
                <Link href={`${base}?tab=all`}>ดูรายการทั้งหมด</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card py-0">
          <OrdersTable slug={slug} rows={list.rows.map((r) => ({ ...r, gameImage: r.gameImage ? assetUrl(r.gameImage) : null, placedAt: r.placedAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null, placedRel: fmtRelative(r.placedAt), paidRel: r.paidAt ? fmtRelative(r.paidAt) : null, fulfilledAt: r.fulfilledAt?.toISOString() ?? null }))} canBatch={canWrite && tab === "manual"} />
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="รายการ" />
        </div>
      )}
    </div>
  );
}
