import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Banknote, Clock, ExternalLink, History, Lock, MapPin, Package, Receipt, Search, Store, Truck } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { getOrderForCustomer, orderStep } from "@rentweb/module-commerce/services";
import { CancelOrderButton, CommerceStyles, OrderStatusBadge, OrderTimeline, dateTimeTh } from "@rentweb/module-commerce/components";
import { L, PAYMENT_LABELS, label } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { cancelOrderAction } from "./actions";

type Params = Promise<{ tenantId: string; orderId: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "คำสั่งซื้อ", robots: { index: false, follow: false } };

/** Animated check (circle + tick draw once; static under reduced motion). */
function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={`rwc-check ${className ?? ""}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27l7 7 15-15" />
    </svg>
  );
}

const card = "card p-5 md:p-7";
const sectionTitle = "font-heading flex items-center gap-2.5 text-step-1 font-semibold";

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
        <CommerceStyles />
        <section className="container-x pt-10 pb-20 md:pt-20 md:pb-28">
          <Reveal className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
            <span className="rwc-bob mb-2 flex size-20 items-center justify-center rounded-full bg-foreground text-background">
              <Lock className="size-8" />
            </span>
            <h1 className="font-heading text-step-4 leading-[1.2] font-semibold">ไม่พบคำสั่งซื้อ</h1>
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
  const paid = order.paymentStatus === "paid" && !cancelled;
  const [titleText, numberText] = (() => {
    const t = label("orderTitle", { number: order.number });
    const i = t.indexOf(order.number);
    return i >= 0 ? [t.slice(0, i), order.number] : [t, ""];
  })();

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CommerceStyles />
      <section className="container-x pt-6 pb-20 md:pt-12 md:pb-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/15 pb-7 md:pb-10">
            <div className="min-w-0">
              <p className="rwc-mono-label text-primary-ink" data-script="thai">
                {L.orderStatus}
              </p>
              <h1 className="mt-3 font-heading text-step-4 leading-[1.15] font-semibold">
                {titleText}
                {numberText && <span className="font-accent tracking-tight">{numberText}</span>}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {L.orderPlacedAt} <span className="rwc-num">{dateTimeTh(order.placedAt)}</span>
              </p>
            </div>
            <OrderStatusBadge status={order.status} paymentStatus={order.paymentStatus} />
          </Reveal>

          {paid && (
            <Reveal delay={0.05} className="mt-6 flex items-center gap-4 rounded-[var(--radius-xl)] bg-foreground p-5 text-background md:mt-8 md:p-6">
              <DrawnCheck className="size-11 shrink-0 text-[color-mix(in_oklab,var(--primary)_55%,var(--background))]" />
              <p className="text-base md:text-lg">
                {L.paidThanks}
                {order.paidAt && <span className="block text-sm opacity-70 md:ml-2 md:inline">{dateTimeTh(order.paidAt)}</span>}
              </p>
            </Reveal>
          )}

          <div className="mt-6 grid gap-5 md:mt-8 lg:grid-cols-12 lg:items-start lg:gap-8">
            <div className="grid gap-5 lg:col-span-7">
              <Reveal delay={0.05} className={card}>
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
                <Reveal delay={0.1} className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4 text-sm md:p-5">
                  {cod ? <Banknote className="mt-0.5 size-5 shrink-0 text-primary" /> : <Store className="mt-0.5 size-5 shrink-0 text-primary" />}
                  <div>
                    <p className="font-medium">{PAYMENT_LABELS[paymentMethod]?.label}</p>
                    <p className="text-muted-foreground">{label(cod ? "codNotice" : "cashNotice", { amount: thb(order.total) })}</p>
                  </div>
                </Reveal>
              )}

              {awaitingSlip && (cod || cash || !panelPayment) && (
                <Reveal delay={0.1} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                  <Clock className="size-5 shrink-0 text-amber-700" />
                  <p>{L.pendingVerification}</p>
                </Reveal>
              )}

              {tracked.length > 0 && (
                <Reveal delay={0.12} className={card}>
                  <h2 className={sectionTitle}>
                    <Truck className="size-5 text-primary" /> {L.tracking}
                  </h2>
                  <ul className="mt-4 grid gap-3">
                    {tracked.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-muted/60 px-4 py-3 text-sm">
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

              {/* receipt */}
              <Reveal delay={0.15} className={card}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={sectionTitle}>
                    <Package className="size-5 text-primary" /> {L.itemsTitle}
                  </h2>
                  <span className="rwc-num text-muted-foreground">{order.number}</span>
                </div>
                <ul className="mt-4 divide-y divide-dashed divide-foreground/15 border-y border-dashed border-foreground/15">
                  {items.map((it) => (
                    <li key={it.id} className="flex items-center gap-4 py-4">
                      <span className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted">{it.image && <img src={it.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-medium leading-snug">{it.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {it.variantTitle && <span>{it.variantTitle} · </span>}
                          <span className="tabular-nums">
                            {thb(it.unitPrice)} × {it.quantity}
                          </span>
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">{thb(it.total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{L.subtotal}</dt>
                    <dd className="tabular-nums">{thb(order.subtotal)}</dd>
                  </div>
                  {order.discountTotal > 0 && (
                    <div className="flex justify-between text-primary">
                      <dt>
                        {L.discount}
                        {order.couponCode && <span className="ml-1 font-mono text-xs">({order.couponCode})</span>}
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
                  <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-foreground/25 pt-4">
                    <dt className="font-medium">{L.total}</dt>
                    <dd className="rwc-price-accent font-heading text-step-3 font-semibold tabular-nums">
                      <span className="font-semibold">{thb(order.total)}</span>
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt>{L.paymentMethod}</dt>
                    <dd>{PAYMENT_LABELS[paymentMethod]?.label ?? paymentMethod}</dd>
                  </div>
                </dl>
              </Reveal>
            </div>

            <div className="grid gap-5 lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)] lg:col-span-5">
              <Reveal delay={0.2} className={card}>
                <h2 className={sectionTitle}>
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
                  <p className="mt-4 rounded-[var(--radius-md)] bg-muted/60 px-4 py-3 text-sm">
                    <span className="block text-xs text-muted-foreground">{L.customerNote}</span>
                    {order.customerNote}
                  </p>
                )}
              </Reveal>

              <Reveal delay={0.25} className="grid gap-3">
                <Button asChild size="lg" variant={showPanel ? "outline" : "default"} className="group w-full">
                  <Link href="/products">
                    <Receipt className="size-4" /> {L.continueShopping}
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link href={customer ? "/account/orders" : "/orders/track"}>
                    <History className="size-4" /> {customer ? L.myOrders : L.trackTitle}
                  </Link>
                </Button>
                {canCancel && (
                  <div className="flex justify-center">
                    <CancelOrderButton action={cancelOrderAction.bind(null, tenantId, order.id, k ?? null)} />
                  </div>
                )}
              </Reveal>
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
        </div>
      </section>
    </PageBody>
  );
}
