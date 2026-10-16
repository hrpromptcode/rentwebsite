import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Button } from "@rentweb/ui/components/button";
import { getAdminOrder } from "@rentweb/module-commerce/admin";
import { carrierLabel } from "@rentweb/module-commerce/admin/labels";
import { fmtDate, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "ใบปะหน้าพัสดุ" };

/** Clean packing slip / shipping label. The app shell is hidden with print CSS; the sheet itself is A5-ish. */
export default async function OrderPrintPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, (tx) => getAdminOrder(tx, ctx.tenant.id, id));
  if (!data) notFound();
  const { order, items, shipments } = data;
  const addr = order.shippingAddress;
  const settings = (ctx.tenant.settings ?? {}) as { contact?: { phone?: string; address?: string; email?: string } };
  const meta = (order.metadata ?? {}) as { paymentMethod?: string };
  const cod = meta.paymentMethod === "cod" && order.paymentStatus !== "paid";
  const latest = shipments[0];

  return (
    <div className="space-y-4">
      {/* AM-04: hide only the app chrome (shell <aside>/<header>), never the label's own sender / order-number block */}
      <style>{`@media print { aside, header:not(.print-sheet *), [data-print-hide], [data-sonner-toaster] { display: none !important } main { padding: 0 !important } body { background: #fff } .print-sheet { box-shadow: none !important; border: 0 !important; max-width: none !important } @page { margin: 10mm } }`}</style>
      <div data-print-hide className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={`/t/${slug}/orders/${order.id}`}>
            <ArrowLeft aria-hidden /> กลับไปออเดอร์
          </Link>
        </Button>
        <PrintButton />
      </div>

      <section className="print-sheet mx-auto max-w-2xl rounded-2xl border bg-white p-6 text-black shadow-sm sm:p-8">
        <div data-print-sheet-head className="flex items-start justify-between gap-4 border-b border-black/20 pb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-black/60">ผู้ส่ง</p>
            <p className="text-lg font-bold">{ctx.tenant.name}</p>
            {settings.contact?.address && <p className="text-sm">{settings.contact.address}</p>}
            {settings.contact?.phone && <p className="text-sm">โทร {settings.contact.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-black/60">ออเดอร์</p>
            <p className="font-mono text-2xl font-bold">{order.number}</p>
            <p className="text-xs text-black/60">{fmtDate(order.placedAt, { withTime: true })}</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border-2 border-black p-4">
          <p className="text-xs uppercase tracking-widest text-black/60">ผู้รับ</p>
          {addr ? (
            <>
              <p className="mt-1 text-xl font-bold">{addr.name}</p>
              <p className="text-lg font-semibold">โทร {addr.phone}</p>
              <p className="mt-1 text-base leading-relaxed">
                {addr.line1}
                {addr.line2 ? ` ${addr.line2}` : ""}
                <br />
                {[addr.subdistrict, addr.district, addr.province].filter(Boolean).join(" ")} <span className="text-xl font-bold">{addr.postalCode}</span>
              </p>
              {addr.note && <p className="mt-1 text-sm text-black/70">หมายเหตุ: {addr.note}</p>}
            </>
          ) : (
            <p className="mt-1 text-lg font-semibold">{order.customerName ?? "—"} · รับที่ร้าน</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-black/20 p-3">
            <p className="text-xs text-black/60">การจัดส่ง</p>
            <p className="font-semibold">{order.shippingMethodName ?? "—"}</p>
            {latest && (
              <p className="font-mono text-xs">
                {carrierLabel(latest.carrier)} {latest.trackingNumber ?? ""}
              </p>
            )}
          </div>
          <div className={`rounded-lg border p-3 ${cod ? "border-black bg-black text-white" : "border-black/20"}`}>
            <p className={`text-xs ${cod ? "text-white/80" : "text-black/60"}`}>{cod ? "เก็บเงินปลายทาง (COD)" : "การชำระเงิน"}</p>
            <p className="text-lg font-bold">{cod ? thb(order.total) : order.paymentStatus === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ"}</p>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left text-xs uppercase tracking-wider text-black/60">
              <th className="py-1.5 font-medium">รายการ</th>
              <th className="py-1.5 text-right font-medium">จำนวน</th>
              <th className="py-1.5 text-right font-medium">ราคา</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-black/10">
                <td className="py-1.5">
                  {it.name}
                  {it.variantTitle && <span className="text-black/60"> · {it.variantTitle}</span>}
                  {it.sku && <span className="block font-mono text-xs text-black/50">{it.sku}</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">× {it.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{thb(it.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 text-right text-black/60">
                ค่าจัดส่ง
              </td>
              <td className="pt-2 text-right tabular-nums">{order.shippingTotal === 0 ? "ฟรี" : thb(order.shippingTotal)}</td>
            </tr>
            {order.discountTotal > 0 && (
              <tr>
                <td colSpan={2} className="text-right text-black/60">
                  ส่วนลด
                </td>
                <td className="text-right tabular-nums">−{thb(order.discountTotal)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={2} className="pt-1 text-right font-semibold">
                ยอดสุทธิ
              </td>
              <td className="pt-1 text-right text-lg font-bold tabular-nums">{thb(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.customerNote && (
          <p className="mt-4 rounded-lg bg-black/5 p-3 text-sm">
            <span className="font-semibold">หมายเหตุลูกค้า:</span> {order.customerNote}
          </p>
        )}
        <p className="mt-6 text-center text-xs text-black/50">ขอบคุณที่อุดหนุน {ctx.tenant.name}</p>
      </section>
    </div>
  );
}
