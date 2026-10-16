import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, MapPin, MessageSquareText, Phone, Printer, Receipt, Truck, User } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { getAdminOrder } from "@rentweb/module-commerce/admin";
import { carrierLabel } from "@rentweb/module-commerce/admin/labels";
import { FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge, SlipPreview, ToneBadge, paymentMethodLabel } from "@rentweb/module-commerce/admin/ui";
import { PAYMENT_STATUS } from "@rentweb/module-commerce/admin/labels";
import { assetUrl, fmtDate, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { InternalNote, OrderActionBar, PaymentActions } from "./order-actions";

export const metadata: Metadata = { title: "รายละเอียดออเดอร์" };

export default async function OrderDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, (tx) => getAdminOrder(tx, ctx.tenant.id, id));
  if (!data) notFound();
  const { order, items, payments, shipments, customer, timeline, accessKey } = data;
  const canWrite = hasRole(ctx, "manager");
  const base = `/t/${slug}/orders`;
  const addr = order.shippingAddress;
  const verifyPending = payments.some((p) => p.status === "pending_verification");
  const storefrontOrderUrl = `${ctx.storefrontUrl}/orders/${order.id}${accessKey ? `?k=${accessKey}` : ""}`;
  const meta = (order.metadata ?? {}) as { paymentMethod?: string; codFee?: number };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการออเดอร์">
            <Link href={base}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">ออเดอร์ {order.number}</h1>
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} verifyPending={verifyPending} />
              <FulfillmentBadge status={order.fulfillmentStatus} orderStatus={order.status} />
              {order.source !== "storefront" && <Badge variant="outline">สร้างโดย{order.source === "admin" ? "ร้าน" : order.source}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              สั่งเมื่อ {fmtDate(order.placedAt, { withTime: true })} · {order.shippingMethodName ?? "ไม่ระบุการจัดส่ง"} · {paymentMethodLabel(meta.paymentMethod ?? payments[0]?.method ?? "")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <OrderActionBar
            slug={slug}
            order={{ id: order.id, number: order.number, status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, shippingMethodType: order.shippingMethodType, total: order.total }}
            payments={payments.map((p) => ({ id: p.id, status: p.status, amount: p.amount, refundedAmount: p.refundedAmount, method: p.method }))}
            canWrite={canWrite}
          />
          <Button asChild variant="outline">
            <Link href={`${base}/${order.id}/print`} target="_blank">
              <Printer aria-hidden /> พิมพ์ใบปะหน้า
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {/* items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-4" aria-hidden /> รายการสินค้า ({items.reduce((s, i) => s + i.quantity, 0)} ชิ้น)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-6 py-3">
                    <span className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {it.image ? <img src={assetUrl(it.image)} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">—</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {it.productId ? (
                          <Link href={`/t/${slug}/products/${it.productId}`} className="hover:text-primary">
                            {it.name}
                          </Link>
                        ) : (
                          it.name
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[it.variantTitle, it.sku ? `SKU ${it.sku}` : null].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground sm:hidden">
                        {thb(it.unitPrice)} × {it.quantity}
                      </span>
                    </span>
                    <span className="hidden whitespace-nowrap text-sm text-muted-foreground tabular-nums sm:block">
                      {thb(it.unitPrice)} × {it.quantity}
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{thb(it.total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="grid gap-1.5 border-t px-6 py-4 text-sm">
                <Row label="ยอดสินค้า" value={thb(order.subtotal)} />
                {order.discountTotal > 0 && <Row label={`ส่วนลด${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`−${thb(order.discountTotal)}`} />}
                <Row label={`ค่าจัดส่ง${meta.codFee ? ` (รวมค่าธรรมเนียม COD ${thb(meta.codFee)})` : ""}`} value={order.shippingTotal === 0 ? "ฟรี" : thb(order.shippingTotal)} />
                {order.taxTotal > 0 && <Row label="ภาษี" value={thb(order.taxTotal)} />}
                <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <dt>ยอดสุทธิ</dt>
                  <dd className="tabular-nums">{thb(order.total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* payments */}
          <Card>
            <CardHeader>
              <CardTitle>การชำระเงิน</CardTitle>
              <CardDescription>{payments.length === 0 ? "ยังไม่มีรายการชำระเงิน" : `${payments.length} รายการ`}</CardDescription>
            </CardHeader>
            {payments.length > 0 && (
              <CardContent className="p-0">
                <ul className="divide-y">
                  {payments.map((p) => {
                    const st = PAYMENT_STATUS[p.status] ?? { label: p.status, tone: "muted" as const };
                    return (
                      <li key={p.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start">
                        <SlipPreview src={p.slipUrl ? assetUrl(p.slipUrl) : null} description={`${paymentMethodLabel(p.method)} · ${thb(p.amount)}`} />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tabular-nums">{thb(p.amount)}</span>
                            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                            <span className="text-sm text-muted-foreground">{paymentMethodLabel(p.method)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            สร้าง {fmtDate(p.createdAt, { withTime: true })}
                            {p.paidAt && <> · ชำระ {fmtDate(p.paidAt, { withTime: true })}</>}
                            {p.verifiedBy && <> · ตรวจโดย {p.verifiedBy === "auto" ? "ระบบ" : p.verifiedBy === ctx.userId ? "คุณ" : "เจ้าหน้าที่"}</>}
                            {p.expiresAt && p.status === "pending" && <> · หมดอายุ {fmtDate(p.expiresAt, { withTime: true })}</>}
                          </p>
                          {p.slipTransRef && <p className="text-xs text-muted-foreground">เลขอ้างอิงธนาคาร {p.slipTransRef}</p>}
                          {p.refundedAmount > 0 && <p className="text-xs text-destructive">คืนเงินแล้ว {thb(p.refundedAmount)}</p>}
                          {p.failureReason && <p className="text-xs text-destructive">เหตุผล: {p.failureReason}</p>}
                          <PaymentActions slug={slug} orderId={order.id} payment={{ id: p.id, status: p.status, amount: p.amount, refundedAmount: p.refundedAmount, method: p.method }} canWrite={canWrite} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            )}
          </Card>

          {/* shipments */}
          {shipments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-4" aria-hidden /> การจัดส่ง
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {shipments.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                      <span>
                        <span className="font-medium">{carrierLabel(s.carrier)}</span>
                        {s.trackingNumber && <span className="ml-2 font-mono">{s.trackingNumber}</span>}
                        <span className="block text-xs text-muted-foreground">
                          ส่งเมื่อ {fmtDate(s.shippedAt ?? s.createdAt, { withTime: true })}
                          {s.deliveredAt && <> · ถึงแล้ว {fmtDate(s.deliveredAt, { withTime: true })}</>}
                        </span>
                      </span>
                      {s.trackingUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={s.trackingUrl} target="_blank" rel="noreferrer">
                            ติดตามพัสดุ <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* timeline */}
          <Card>
            <CardHeader>
              <CardTitle>ไทม์ไลน์</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[1.6rem] top-1.5 size-3 rounded-full ring-4 ring-background ${t.tone === "success" ? "bg-emerald-500" : t.tone === "warning" ? "bg-amber-500" : t.tone === "destructive" ? "bg-destructive" : "bg-primary"}`} aria-hidden />
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(t.at, { withTime: true })}
                      {t.detail && <> · {t.detail}</>}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" aria-hidden /> ลูกค้า
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">
                {customer ? (
                  <Link href={`/t/${slug}/customers/${customer.id}`} className="hover:text-primary">
                    {order.customerName ?? customer.name ?? "ไม่ระบุชื่อ"}
                  </Link>
                ) : (
                  (order.customerName ?? "ไม่ระบุชื่อ")
                )}
              </p>
              {order.phone && (
                <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Phone className="size-3.5" aria-hidden /> {order.phone}
                </a>
              )}
              {order.email && (
                <a href={`mailto:${order.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Mail className="size-3.5" aria-hidden /> {order.email}
                </a>
              )}
              {customer && (
                <p className="text-xs text-muted-foreground">
                  ซื้อแล้ว {customer.ordersCount} ครั้ง · รวม {thb(customer.totalSpent)}
                </p>
              )}
              <Button asChild size="sm" variant="outline" className="mt-2">
                <a href={storefrontOrderUrl} target="_blank" rel="noreferrer">
                  หน้าออเดอร์ของลูกค้า <ExternalLink aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden /> {order.shippingMethodType === "pickup" ? "รับที่ร้าน" : "ที่อยู่จัดส่ง"}
              </CardTitle>
              <CardDescription>{order.shippingMethodName ?? "—"}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {addr ? (
                <address className="not-italic leading-relaxed">
                  <span className="block font-medium">
                    {addr.name} · {addr.phone}
                  </span>
                  <span className="block">{addr.line1}</span>
                  {addr.line2 && <span className="block">{addr.line2}</span>}
                  <span className="block">{[addr.subdistrict, addr.district, addr.province, addr.postalCode].filter(Boolean).join(" ")}</span>
                  {addr.note && <span className="block text-muted-foreground">หมายเหตุ: {addr.note}</span>}
                </address>
              ) : (
                <p className="text-muted-foreground">ไม่มีที่อยู่จัดส่ง</p>
              )}
            </CardContent>
          </Card>

          {/* notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4" aria-hidden /> โน้ต
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">จากลูกค้า</p>
                <p className={order.customerNote ? "whitespace-pre-wrap rounded-lg bg-muted p-3" : "text-muted-foreground"}>{order.customerNote ?? "ไม่มี"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">โน้ตภายใน (ลูกค้าไม่เห็น)</p>
                <InternalNote slug={slug} orderId={order.id} initial={order.internalNote ?? ""} canEdit={hasRole(ctx, "staff")} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
