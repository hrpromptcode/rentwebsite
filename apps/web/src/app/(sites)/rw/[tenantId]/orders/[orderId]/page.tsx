import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Banknote, CheckCircle2, Clock, ExternalLink, History, Lock, MapPin, Package, Receipt, Search, Store, Truck } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { getOrderForCustomer, orderStep } from "@rentweb/module-commerce/services";
import { CancelOrderButton, OrderStatusBadge, OrderTimeline, dateTimeTh } from "@rentweb/module-commerce/components";
import { L, PAYMENT_LABELS, label } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cancelOrderAction } from "./actions";

type Params = Promise<{ tenantId: string; orderId: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "คำสั่งซื้อ", robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, orderId } = await params;
  const { k } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const detail = await tenantTx(tenantId, (tx) => getOrderForCustomer(tx, tenantId, orderId, { customerId: customer?.id ?? null, accessKey: k ?? null }));

  if (!detail) {
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <section className="container-x pb-16 md:pb-24">
          <Reveal className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="size-7" />
            </span>
            <h1 className="font-heading text-2xl font-semibold">ไม่พบคำสั่งซื้อ</h1>
            <p className="text-muted-foreground">เปิดจากลิงก์ยืนยันคำสั่งซื้อ เข้าสู่ระบบด้วยเบอร์ที่ใช้สั่งซื้อ หรือค้นหาด้วยเลขที่คำสั่งซื้อ</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button asChild size="lg">
                <Link href={`/account/login?next=${encodeURIComponent(`/orders/${orderId}`)}`}>{L.loginForHistory}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/orders/track">
                  <Search className="size-4" /> {L.trackTitle}
                </Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </PageBody>
    );
  }

  const { order, items, payment, shipments } = detail;
  const meta = (order.metadata ?? {}) as { paymentMethod?: string; codFee?: number; shippingBase?: number };
  const paymentMethod = meta.paymentMethod ?? payment?.method ?? "promptpay_qr";
  const cancelled = order.status === "cancelled";
  const cod = paymentMethod === "cod";
  const cash = paymentMethod === "cash";
  const unpaid = order.paymentStatus === "unpaid" && !cancelled;
  const awaitingSlip = order.paymentStatus === "pending_verification" && !cancelled;
  const panelPayment = payment && (payment.status === "pending" || payment.status === "pending_verification") ? payment : null;
  const showPanel = (unpaid || awaitingSlip) && !cod && !cash && panelPayment;
  const canCancel = unpaid && !cancelled && order.status !== "shipped" && order.status !== "completed";
  const settings = paymentSettings(runtime.config.settings);
  const keyQs = k ? `?k=${encodeURIComponent(k)}` : "";
  const addr = order.shippingAddress;
  const isPickup = order.shippingMethodType === "pickup";
  const shippingBase = meta.shippingBase ?? order.shippingTotal - (meta.codFee ?? 0);
  const codFee = meta.codFee ?? 0;
  const tracked = shipments.filter((s) => s.trackingNumber || s.trackingUrl);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">{L.orderStatus}</p>
              <h1 className="heading-display mt-1 text-4xl font-semibold md:text-5xl">{label("orderTitle", { number: order.number })}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {L.orderPlacedAt} {dateTimeTh(order.placedAt)}
              </p>
            </div>
            <OrderStatusBadge status={order.status} paymentStatus={order.paymentStatus} />
          </Reveal>

          <div className="grid gap-5">
            <Reveal delay={0.05} className="card p-5 md:p-7">
              <OrderTimeline step={orderStep(order)} cancelled={cancelled} cod={cod || cash} />
            </Reveal>

            {showPanel && (
              <Reveal delay={0.1}>
                <PaymentPanel
                  payment={{ id: panelPayment.id, method: panelPayment.method, status: panelPayment.status, amount: panelPayment.amount, qrDataUrl: panelPayment.qrPayload ? await promptpayQrDataUrl(panelPayment.qrPayload) : null, expiresAt: panelPayment.expiresAt?.toISOString() ?? null, slipUrl: panelPayment.slipUrl }}
                  amountLabel={thb(panelPayment.amount)}
                  promptpayName={settings.promptpayName}
                  promptpayId={settings.promptpayId}
                  bankAccounts={settings.bankAccounts ?? []}
                  successHref={`/orders/${order.id}${keyQs}`}
                />
              </Reveal>
            )}

            {unpaid && (cod || cash) && (
              <Reveal delay={0.1} className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4 text-sm">
                {cod ? <Banknote className="mt-0.5 size-5 shrink-0 text-primary" /> : <Store className="mt-0.5 size-5 shrink-0 text-primary" />}
                <div>
                  <p className="font-medium">{PAYMENT_LABELS[paymentMethod]?.label}</p>
                  <p className="text-muted-foreground">{label(cod ? "codNotice" : "cashNotice", { amount: thb(order.total) })}</p>
                </div>
              </Reveal>
            )}

            {order.paymentStatus === "paid" && !cancelled && (
              <Reveal delay={0.1} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                <p>
                  {L.paidThanks}
                  {order.paidAt && <span className="text-muted-foreground"> · {dateTimeTh(order.paidAt)}</span>}
                </p>
              </Reveal>
            )}

            {awaitingSlip && (cod || cash || !panelPayment) && (
              <Reveal delay={0.1} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <Clock className="size-5 shrink-0 text-amber-600" />
                <p>{L.pendingVerification}</p>
              </Reveal>
            )}

            {tracked.length > 0 && (
              <Reveal delay={0.12} className="card p-5 md:p-7">
                <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                  <Truck className="size-5 text-primary" /> {L.tracking}
                </h2>
                <ul className="mt-3 grid gap-3">
                  {tracked.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-muted/50 px-4 py-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">
                          {L.carrier}: <span className="font-medium text-foreground uppercase">{s.carrier}</span>
                        </p>
                        {s.trackingNumber && (
                          <p className="text-muted-foreground">
                            {L.trackingNumber}: <span className="font-mono font-medium text-foreground">{s.trackingNumber}</span>
                          </p>
                        )}
                      </div>
                      {s.trackingUrl && (
                        <Button asChild variant="outline" size="sm" className="h-11">
                          <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
                            {L.trackLink} <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            <Reveal delay={0.15} className="card p-5 md:p-7">
              <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                <Package className="size-5 text-primary" /> {L.itemsTitle}
              </h2>
              <ul className="mt-4 divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-4 py-3">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted">{it.image && <img src={it.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium leading-snug">{it.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {it.variantTitle && <span>{it.variantTitle} · </span>}
                        {thb(it.unitPrice)} × {it.quantity}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{thb(it.total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{L.subtotal}</dt>
                  <dd className="tabular-nums">{thb(order.subtotal)}</dd>
                </div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between text-primary">
                    <dt>
                      {L.discount}
                      {order.couponCode && <span className="ml-1 text-xs">({order.couponCode})</span>}
                    </dt>
                    <dd className="tabular-nums">−{thb(order.discountTotal)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {L.shipping}
                    {order.shippingMethodName && <span className="ml-1 text-xs">({order.shippingMethodName})</span>}
                  </dt>
                  <dd className="tabular-nums">{shippingBase === 0 ? L.freeShipping : thb(shippingBase)}</dd>
                </div>
                {codFee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{L.codFee}</dt>
                    <dd className="tabular-nums">{thb(codFee)}</dd>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between border-t pt-3">
                  <dt className="font-medium">{L.total}</dt>
                  <dd className="font-heading text-2xl font-semibold tabular-nums">{thb(order.total)}</dd>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>{L.paymentMethod}</dt>
                  <dd>{PAYMENT_LABELS[paymentMethod]?.label ?? paymentMethod}</dd>
                </div>
              </dl>
            </Reveal>

            <Reveal delay={0.2} className="card p-5 md:p-7">
              <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                {isPickup ? <Store className="size-5 text-primary" /> : <MapPin className="size-5 text-primary" />} {isPickup ? L.pickupAt : L.shipTo}
              </h2>
              {isPickup ? (
                <p className="mt-3 text-sm">
                  {order.shippingMethodName}
                  <span className="block text-muted-foreground">
                    {order.customerName} · {order.phone}
                  </span>
                </p>
              ) : addr ? (
                <address className="mt-3 text-sm not-italic leading-relaxed">
                  <span className="font-medium">{addr.name}</span> · {addr.phone}
                  <br />
                  {addr.line1}
                  {addr.line2 && <> {addr.line2}</>}
                  <br />
                  {[addr.subdistrict, addr.district, addr.province, addr.postalCode].filter(Boolean).join(" ")}
                </address>
              ) : null}
              {order.customerNote && (
                <p className="mt-4 rounded-[var(--radius-md)] bg-muted/50 px-4 py-3 text-sm">
                  <span className="block text-xs text-muted-foreground">{L.customerNote}</span>
                  {order.customerNote}
                </p>
              )}
            </Reveal>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  <Receipt className="size-4" /> {L.continueShopping}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={customer ? "/account/orders" : "/orders/track"}>
                  <History className="size-4" /> {customer ? L.myOrders : L.trackTitle}
                </Link>
              </Button>
              {canCancel && (
                <div className="ml-auto">
                  <CancelOrderButton action={cancelOrderAction.bind(null, tenantId, order.id, k ?? null)} />
                </div>
              )}
            </div>
            {k && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" /> {L.shareOrderLink}
              </p>
            )}
            {!customer && (
              <p className="text-sm text-muted-foreground">
                <Link href={`/account/login?next=${encodeURIComponent(`/orders/${order.id}`)}`} className="inline-flex h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">
                  {L.loginForHistory} <ArrowRight className="size-3.5" />
                </Link>{" "}
                {L.loginForHistoryHint}
              </p>
            )}
          </div>
        </div>
      </section>
    </PageBody>
  );
}
