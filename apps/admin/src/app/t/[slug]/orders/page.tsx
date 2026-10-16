import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, ShoppingBag, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { listAdminOrders, orderTabCounts } from "@rentweb/module-commerce/admin";
import { ORDER_STATUS, ORDER_TABS, PAYMENT_STATUS, type OrderTab } from "@rentweb/module-commerce/admin/labels";
import { FilterTabs, FulfillmentBadge, NativeSelect, OrderStatusBadge, Pagination, PaymentStatusBadge, qs } from "@rentweb/module-commerce/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";

export const metadata: Metadata = { title: "ออเดอร์" };

type SP = { tab?: string; q?: string; status?: string; pay?: string; from?: string; to?: string; page?: string };

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const tab = (ORDER_TABS.some((t) => t.key === sp.tab) ? sp.tab : "all") as OrderTab;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters = { q: sp.q?.trim() || "", status: sp.status || "", pay: sp.pay || "", from: sp.from || "", to: sp.to || "" };
  const hasFilters = Object.values(filters).some(Boolean);
  const base = `/t/${slug}/orders`;

  const { list, counts } = await tenantTx(ctx.tenant.id, async (tx) => ({
    list: await listAdminOrders(tx, ctx.tenant.id, { tab, q: filters.q, status: filters.status || null, paymentStatus: filters.pay || null, from: filters.from || null, to: filters.to || null, page, perPage: 20 }),
    counts: await orderTabCounts(tx, ctx.tenant.id),
  }));
  const params_ = { tab: tab === "all" ? "" : tab, ...filters };

  return (
    <div className="space-y-6">
      <PageHeader
        title="ออเดอร์"
        description={`${fmtNumber(list.total)} รายการ${hasFilters ? " (ตามตัวกรอง)" : ""}`}
        actions={
          hasRole(ctx, "manager") && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> สร้างออเดอร์
              </Link>
            </Button>
          )
        }
      />

      <FilterTabs active={tab} tabs={ORDER_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs(filters, { tab: t.key === "all" ? "" : t.key })}` }))} />

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]" action={base}>
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="เลขออเดอร์ ชื่อ เบอร์โทร หรืออีเมล…" className="pl-9" aria-label="ค้นหาออเดอร์" />
        </div>
        <NativeSelect name="status" defaultValue={filters.status} aria-label="สถานะออเดอร์">
          <option value="">สถานะ: ทั้งหมด</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="pay" defaultValue={filters.pay} aria-label="สถานะการชำระ">
          <option value="">การชำระ: ทั้งหมด</option>
          {["unpaid", "pending_verification", "paid", "partially_refunded", "refunded", "failed"].map((k) => (
            <option key={k} value={k}>
              {PAYMENT_STATUS[k]!.label}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={filters.from} aria-label="ตั้งแต่วันที่" />
        <Input type="date" name="to" defaultValue={filters.to} aria-label="ถึงวันที่" />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
            กรอง
          </Button>
          {hasFilters && (
            <Button asChild variant="ghost" aria-label="ล้างตัวกรอง">
              <Link href={`${base}${qs({ tab: tab === "all" ? "" : tab })}`}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={hasFilters || tab !== "all" ? "ไม่พบออเดอร์ตามเงื่อนไข" : "ยังไม่มีออเดอร์"}
          description={hasFilters || tab !== "all" ? "ลองเปลี่ยนตัวกรองหรือล้างการค้นหา" : "เมื่อลูกค้าสั่งซื้อผ่านหน้าร้าน ออเดอร์จะแสดงที่นี่ หรือสร้างออเดอร์เองสำหรับลูกค้าที่สั่งทาง LINE/โทรศัพท์"}
          action={
            hasRole(ctx, "manager") && !hasFilters && tab === "all" ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> สร้างออเดอร์แรก
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead className="text-right">ยอด</TableHead>
                <TableHead className="hidden sm:table-cell">การชำระ</TableHead>
                <TableHead className="hidden md:table-cell">การจัดส่ง</TableHead>
                <TableHead className="hidden lg:table-cell">วันที่</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((o) => (
                <TableRow key={o.id} className="relative">
                  <TableCell className="align-top">
                    <Link href={`${base}/${o.id}`} className="font-semibold text-primary after:absolute after:inset-0 after:content-['']">
                      {o.number}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <OrderStatusBadge status={o.status} />
                      {o.shippingMethodType === "pickup" && <Badge variant="outline">รับที่ร้าน</Badge>}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground lg:hidden">{fmtDate(o.placedAt, { withTime: true })}</span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="block max-w-[14rem] truncate font-medium">{o.customerName ?? "ไม่ระบุชื่อ"}</span>
                    <span className="block text-xs text-muted-foreground">{o.phone ?? o.email ?? "—"}</span>
                    <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                      <PaymentStatusBadge status={o.paymentStatus} verifyPending={o.verifyPending} />
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top font-semibold tabular-nums">
                    {thb(o.total)}
                    <span className="block text-xs font-normal text-muted-foreground">{fmtNumber(o.itemCount)} ชิ้น</span>
                  </TableCell>
                  <TableCell className="hidden align-top sm:table-cell">
                    <PaymentStatusBadge status={o.paymentStatus} verifyPending={o.verifyPending} />
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <FulfillmentBadge status={o.fulfillmentStatus} orderStatus={o.status} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap align-top text-muted-foreground lg:table-cell">{fmtDate(o.placedAt, { withTime: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={params_} label="ออเดอร์" />
        </div>
      )}
    </div>
  );
}
