import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Search, Wallet, XCircle, Receipt } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { listOrderHistory, salesSummary, ORDER_STATUS_LABEL_ADMIN, ORDER_TYPE_LABEL } from "@rentweb/module-restaurant/admin";
import { addDays, bangkokDate } from "@rentweb/module-restaurant/services";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { tenantTx, type TenantCtx } from "@/lib/tenant";
import { PaymentBadge } from "../_components/payment-badge";
import { todayYmd } from "../_components/time";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "muted" | "soft"> = { received: "soft", preparing: "warning", ready: "success", served: "success", completed: "muted", cancelled: "destructive" };

export async function OrdersHistory({ slug, ctx, sp }: { slug: string; ctx: TenantCtx; sp: Record<string, string | undefined> }) {
  const today = todayYmd();
  const from = YMD.test(sp.from ?? "") ? sp.from! : today;
  const to = YMD.test(sp.to ?? "") ? sp.to! : from;
  const q = (sp.q ?? "").trim();
  const status = sp.status && sp.status in ORDER_STATUS_LABEL_ADMIN ? sp.status : "";
  const type = sp.type === "dine_in" || sp.type === "pickup" ? sp.type : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const fromDate = bangkokDate(from, "00:00");
  const toDate = new Date(bangkokDate(addDays(to, 1), "00:00").getTime() - 1);

  const { history, summary } = await tenantTx(ctx.tenant.id, async (tx) => ({
    history: await listOrderHistory(tx, ctx.tenant.id, { from: fromDate, to: toDate, q, status: status || null, type: type || null, page, pageSize: 25 }),
    summary: await salesSummary(tx, ctx.tenant.id, fromDate, toDate),
  }));

  const base = `/t/${slug}/restaurant/orders`;
  const query = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab: "history", from, to, ...(q ? { q } : {}), ...(status ? { status } : {}), ...(type ? { type } : {}), ...patch });
    return `${base}?${p}`;
  };

  return (
    <div className="space-y-6">
      <section aria-label="สรุปช่วงเวลา" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="ออเดอร์ทั้งหมด" value={fmtNumber(summary.orders)} hint={from === to ? fmtDate(fromDate, { style: "long" }) : `${fmtDate(fromDate)} – ${fmtDate(toDate)}`} icon={ClipboardList} tone="primary" />
        <KpiCard label="ยอดขาย (ชำระแล้ว)" value={thb(summary.revenue)} hint={`${fmtNumber(summary.paid)} ออเดอร์ชำระแล้ว`} icon={Wallet} tone="success" />
        <KpiCard label="ยกเลิก" value={fmtNumber(summary.cancelled)} icon={XCircle} />
      </section>

      <form className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-end" action={base}>
        <input type="hidden" name="tab" value="history" />
        <label className="grid gap-1 text-xs text-muted-foreground">
          ตั้งแต่
          <Input type="date" name="from" defaultValue={from} className="h-10" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          ถึง
          <Input type="date" name="to" defaultValue={to} className="h-10" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          ค้นหา
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="เลขออเดอร์ ชื่อ หรือเบอร์โทร…" className="h-10 pl-9" />
          </span>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          สถานะ
          <select name="status" defaultValue={status} className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground">
            <option value="">ทั้งหมด</option>
            {Object.entries(ORDER_STATUS_LABEL_ADMIN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="h-10 flex-1">
            กรอง
          </Button>
          {(q || status || type || from !== today || to !== today) && (
            <Button asChild variant="ghost" className="h-10">
              <Link href={`${base}?tab=history`}>ล้าง</Link>
            </Button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["", "ทุกประเภท"],
            ["dine_in", "โต๊ะ"],
            ["pickup", "รับกลับบ้าน"],
          ] as Array<[string, string]>
        ).map(([k, label]) => (
          <Button key={k} asChild size="sm" variant={type === k ? "default" : "outline"}>
            <Link href={query({ type: k, page: "1" })}>{label}</Link>
          </Button>
        ))}
        <span className="ml-auto self-center text-sm text-muted-foreground">{fmtNumber(history.total)} รายการ</span>
      </div>

      {history.rows.length === 0 ? (
        <EmptyState icon={Receipt} title="ไม่พบออเดอร์ในช่วงที่เลือก" description="ลองขยายช่วงวันที่ หรือล้างตัวกรอง" />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ออเดอร์</TableHead>
                <TableHead className="hidden md:table-cell">ประเภท</TableHead>
                <TableHead className="hidden lg:table-cell">รายการ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden sm:table-cell">การชำระ</TableHead>
                <TableHead className="text-right">ยอด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <span className="block font-medium">{o.number}</span>
                    <span className="block text-xs text-muted-foreground">{fmtDate(o.placedAt, { withTime: true })}</span>
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {o.type === "dine_in" ? `โต๊ะ ${o.tableName ?? "—"}` : ORDER_TYPE_LABEL[o.type]}
                      {o.guestLabel || o.customerName ? ` · ${o.guestLabel ?? o.customerName}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="block">{o.type === "dine_in" ? `โต๊ะ ${o.tableName ?? "—"}` : ORDER_TYPE_LABEL[o.type]}</span>
                    <span className="block text-xs text-muted-foreground">{o.guestLabel ?? o.customerName ?? ""}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-xs lg:table-cell">
                    <span className="block truncate text-sm">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[o.status] ?? "muted"}>{ORDER_STATUS_LABEL_ADMIN[o.status] ?? o.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PaymentBadge paymentStatus={o.paymentStatus} payment={o.payment} dineIn={o.type === "dine_in"} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{thb(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {history.pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                หน้า {history.page} / {history.pages}
              </span>
              <div className="flex gap-1">
                <Button asChild variant="outline" size="icon-sm" aria-label="หน้าก่อนหน้า" aria-disabled={history.page <= 1}>
                  <Link href={query({ page: String(Math.max(1, history.page - 1)) })}>
                    <ChevronLeft aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="icon-sm" aria-label="หน้าถัดไป" aria-disabled={history.page >= history.pages}>
                  <Link href={query({ page: String(Math.min(history.pages, history.page + 1)) })}>
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
