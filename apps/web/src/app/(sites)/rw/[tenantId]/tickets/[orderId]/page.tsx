import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, History, Lock, MapPin, Receipt, Sparkles, Ticket, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { PaymentPanel, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { eventsConfig, getOrderForCustomer, listTicketDetailsForOrder, ticketPaymentMethods, ticketQrDataUrl, type TicketDetail } from "@rentweb/module-events/services";
import { L, METHOD_LABELS, OrderLines, OrderStatusBadge, TicketCard, formatThaiDateTime, formatThaiSession } from "@rentweb/module-events/ui";
import { HoldCountdown, OrderActions, TicketTools } from "@rentweb/module-events/client";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; orderId: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "คำสั่งซื้อบัตร", robots: { index: false } };

const LIVE_TICKET = new Set(["valid", "checked_in"]);

/** /tickets/[orderId]?k=<access key> – payment with hold countdown, then the e-tickets with QR; owner or key holder only. */
export default async function TicketOrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, orderId } = await params;
  const { k } = await searchParams;
  const key = k ?? null;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) notFound();
  if (!isUuid(orderId)) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const data = await tenantTx(tenantId, async (tx) => {
    const detail = await getOrderForCustomer(tx, tenantId, orderId, { customerId: customer?.id, key });
    if (!detail) return null;
    const tickets = detail.order.status === "pending" || detail.order.status === "expired" ? [] : await listTicketDetailsForOrder(tx, tenantId, orderId);
    return { detail, tickets };
  });

  if (!data) {
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
          <div className="card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center" data-testid="order-locked">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Lock className="size-6 text-muted-foreground" />
            </span>
            <h1 className="font-heading text-2xl font-semibold">{L.cannotOpen}</h1>
            <p className="text-sm text-muted-foreground">{L.cannotOpenHint}</p>
            <Button asChild size="lg">
              <Link href={`/account/login?next=${encodeURIComponent(`/tickets/${orderId}`)}`}>{L.login}</Link>
            </Button>
          </div>
        </section>
      </PageBody>
    );
  }

  const { detail, tickets } = data;
  const { order, event, session, payment } = detail;
  const config = eventsConfig(runtime.config.moduleConfig);
  const pay = paymentSettings(runtime.config.settings);
  const now = new Date();
  const keyQs = key ? `?k=${encodeURIComponent(key)}` : "";
  const selfHref = `/tickets/${order.id}${keyQs}`;
  const eventHref = `/events/${encodeURIComponent(event.slug)}`;
  const paymentExpired = !!payment && payment.status === "pending" && !!payment.expiresAt && payment.expiresAt < now;
  const needsPayment = order.status === "pending" && order.total > 0;
  const paymentLive = !!payment && (payment.status === "pending_verification" || (payment.status === "pending" && !paymentExpired));
  const showPayment = needsPayment && paymentLive;
  const renewReason: "expired" | "failed" | "none" | null = needsPayment && !paymentLive ? (paymentExpired || payment?.status === "expired" ? "expired" : payment?.status === "failed" ? "failed" : "none") : null;
  const methods: PaymentMethodOption[] = ticketPaymentMethods(runtime.config.settings).map((m) => ({ value: m, label: METHOD_LABELS[m]!.label, description: METHOD_LABELS[m]!.description }));
  const qrs = await Promise.all(tickets.map((t) => (LIVE_TICKET.has(t.ticket.status) ? ticketQrDataUrl(t.qrPayload, { width: 384 }) : Promise.resolve(null))));
  const holdCountdownAt = showPayment && payment?.status === "pending" ? payment.expiresAt : null;
  const headline = L.headline[order.status] ?? L.orderTitle;
  const hint =
    order.status === "pending"
      ? order.total > 0
        ? L.payToIssue(thb(order.total))
        : L.loading
      : order.status === "paid"
        ? L.showQr
        : order.status === "expired"
          ? L.expiredHint
          : order.status === "refunded"
            ? L.refundedHint
            : L.cancelledHint;
  const done = order.status === "paid";
  const HeadIcon = done ? CheckCircle2 : order.status === "pending" ? Clock : order.status === "cancelled" || order.status === "expired" ? XCircle : Sparkles;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal className="flex flex-wrap items-end justify-between gap-3 print:hidden">
            <div>
              <p className="text-sm text-muted-foreground">{L.orderNumber}</p>
              <h1 className="font-heading text-3xl font-semibold tracking-wide md:text-4xl" data-testid="order-number">
                {order.number}
              </h1>
            </div>
            <span data-testid="order-status">
              <OrderStatusBadge status={order.status} className="px-4 py-1.5 text-sm" />
            </span>
          </Reveal>

          <Reveal delay={0.05} className="mt-6">
            <div className="card overflow-hidden p-0">
              <div className="flex items-start gap-3 bg-primary-soft px-5 py-4 md:px-7">
                <HeadIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="font-heading text-lg font-semibold" data-testid="order-headline">
                    {headline}
                  </p>
                  <p className="text-sm text-muted-foreground">{hint}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-5 md:p-7">
                {event.cover ? <Img src={event.cover} alt="" className="size-20 shrink-0 rounded-[var(--radius-lg)] object-cover" /> : <span className="flex size-20 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-muted"><Ticket className="size-6 text-muted-foreground" /></span>}
                <div className="min-w-0">
                  <Link href={eventHref} className="font-heading text-xl font-semibold leading-tight hover:text-primary">
                    {event.title}
                  </Link>
                  <p className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
                    {session && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 shrink-0" /> {session.name ? `${session.name} · ` : ""}{formatThaiSession(session.startsAt, session.endsAt)}
                      </span>
                    )}
                    {event.venueName && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" /> {event.venueName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Ticket className="size-3.5 shrink-0" /> {L.ticketsN(order.quantity)} · {order.total > 0 ? thb(order.total) : L.free}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          {showPayment && payment && (
            <Reveal delay={0.1} className="mt-5" data-testid="order-payment">
              {holdCountdownAt && (
                <div className="mb-3 flex justify-center">
                  <HoldCountdown expiresAt={holdCountdownAt.toISOString()} />
                </div>
              )}
              <PaymentPanel
                payment={{ id: payment.id, method: payment.method, status: payment.status, amount: payment.amount, qrDataUrl: payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null, expiresAt: payment.expiresAt?.toISOString() ?? null, slipUrl: payment.slipUrl }}
                amountLabel={thb(payment.amount)}
                promptpayName={pay.promptpayName}
                promptpayId={pay.promptpayId}
                bankAccounts={pay.bankAccounts ?? []}
                successHref={selfHref}
                accessKey={key}
              />
              {payment.status === "pending" && <p className="mt-2 text-center text-xs text-muted-foreground">{L.payWithin(config.holdMinutes)}</p>}
            </Reveal>
          )}

          {order.status === "pending" && (
            <Reveal delay={0.1} className="mt-5">
              <OrderActions orderId={order.id} accessKey={key} canCancel renew={renewReason ? { reason: renewReason, amountLabel: thb(order.total), failureReason: payment?.failureReason ?? null, methods } : null} />
            </Reveal>
          )}

          {tickets.length > 0 && (
            <Reveal delay={0.1} className="mt-8" data-testid="ticket-section">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-heading flex items-center gap-2 text-2xl font-semibold">
                  <Ticket className="size-6 text-primary" aria-hidden /> {L.eTickets}
                </h2>
                {done && <TicketTools shareUrl={selfHref} shareTitle={`${event.title} – ${order.number}`} icsHref={`/tickets/${order.id}/ics${keyQs}`} icsFilename={`${order.number}.ics`} />}
              </div>
              <div className="mt-4 grid gap-4" data-testid="ticket-list">
                {tickets.map((t: TicketDetail, i) => (
                  <TicketCard key={t.ticket.id} ticket={{ id: t.ticket.id, code: t.ticket.code, holderName: t.ticket.holderName, status: t.ticket.status, typeName: t.typeName, seatLabel: t.ticket.seatLabel, checkedInAt: t.ticket.checkedInAt }} qrDataUrl={qrs[i] ?? null} event={{ title: t.event.title, venueName: t.event.venueName }} session={t.session} index={L.ticketN(i + 1, tickets.length)} href={`/tickets/t/${encodeURIComponent(t.qrPayload)}`} />
                ))}
              </div>
            </Reveal>
          )}

          <Reveal delay={0.15} className="card mt-5 p-5 md:p-7 print:hidden">
            <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
              <Receipt className="size-5 text-primary" /> {L.summary}
            </h2>
            <div className="mt-4">
              <OrderLines data={{ lines: order.lines, quantity: order.quantity, subtotal: order.subtotal, discount: order.discount, total: order.total, promoCode: order.promoCode }} />
            </div>
            <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
              <Row label={L.buyerDetails} value={order.contactName} />
              {order.contactPhone && <Row label={L.phone} value={order.contactPhone} mono />}
              {order.contactEmail && <Row label={L.email} value={order.contactEmail} />}
              {payment && <Row label={L.paymentMethod} value={METHOD_LABELS[payment.method]?.label ?? payment.method} />}
              {order.total === 0 && <Row label={L.paymentMethod} value={METHOD_LABELS.free!.label} />}
              <Row label={L.orderedAt} value={formatThaiDateTime(order.createdAt)} />
              {order.paidAt && <Row label={L.paidAt} value={formatThaiDateTime(order.paidAt)} />}
              {order.cancelledAt && <Row label={L.cancelledAt} value={formatThaiDateTime(order.cancelledAt)} />}
              {order.cancelReason && <Row label={L.note} value={order.cancelReason} />}
              {order.refundedAmount > 0 && <Row label="คืนเงินแล้ว" value={thb(order.refundedAmount)} />}
              {order.note && <Row label={L.note} value={order.note} />}
            </dl>
          </Reveal>

          <div className="mt-8 flex flex-wrap gap-3 print:hidden">
            <Button asChild size="lg" variant={done ? "outline" : "default"}>
              <Link href={eventHref}>
                <Sparkles className="size-4" /> {L.buyAgain}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={customer ? "/account/tickets" : `/account/login?next=${encodeURIComponent("/account/tickets")}`}>
                <History className="size-4" /> {L.myTickets}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
