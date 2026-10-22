import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, CheckCircle2, Clock, History, Lock, Receipt, Sparkles, Ticket, X, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { FloatingChatOptOut, Img } from "@rentweb/storefront";
import { PaymentPanel, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { eventsConfig, getOrderForCustomer, listTicketDetailsForOrder, ticketPaymentMethods, ticketQrDataUrl, type TicketDetail } from "@rentweb/module-events/services";
import { EvStyles, L, METHOD_LABELS, ThaiWrap, OrderLines, OrderStatusBadge, TicketCard, dotDate, formatThaiDateTime, formatThaiSession, hhmm } from "@rentweb/module-events/ui";
import { HoldCountdown, OrderActions, TicketTools } from "@rentweb/module-events/client";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; orderId: string }>;
type Search = Promise<{ k?: string }>;

export const metadata: Metadata = { title: "คำสั่งซื้อบัตร", robots: { index: false } };

const LIVE_TICKET = new Set(["valid", "checked_in"]);
type StepState = "done" | "now" | "todo" | "off";

/**
 * /tickets/[orderId]?k=<access key> – payment with hold countdown, then the e-tickets with QR; owner or key holder only.
 * Operational page (§6.4): compact intro, a 3-step progress line (สั่งซื้อ → ชำระเงิน → ออกบัตร), calm fades, the
 * perforated e-tickets (CSS tilt + holo, QR flat) and a sticky receipt beside them on desktop. No 3D, no scroll effects.
 */
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
        <EvStyles />
        <section className="container-x relative isolate pt-8 pb-20 md:pt-14 md:pb-28">
          <div aria-hidden className="ev-spot" />
          <div className="ev-fade ev-ticket ev-ticket-bg ev-ticket-edge mx-auto flex max-w-lg flex-col items-center gap-4 rounded-[calc(var(--radius)*1.4)] px-6 py-10 text-center md:px-10" data-testid="order-locked">
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-[color-mix(in_oklab,var(--foreground)_22%,transparent)]">
              <Lock className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <p className="ev-mono text-muted-foreground">Access · {L.orderTitle}</p>
            <h1 className="font-heading text-step-3 leading-tight font-semibold text-balance">{L.cannotOpen}</h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{L.cannotOpenHint}</p>
            <Button asChild size="lg" className="mt-2 h-12 rounded-full px-7">
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
  const stopped = order.status === "cancelled" || order.status === "expired";
  const HeadIcon = done ? CheckCircle2 : order.status === "pending" ? Clock : stopped ? XCircle : Sparkles;
  const steps: StepState[] = done ? ["done", "done", "done"] : order.status === "pending" ? ["done", "now", "todo"] : order.status === "refunded" ? ["done", "done", "off"] : ["done", "off", "todo"];
  const fill = done || order.status === "refunded" ? 1 : 0.5;
  const liveTickets = tickets.filter((t) => LIVE_TICKET.has(t.ticket.status)).length;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <EvStyles />
      <section className="container-x relative isolate pt-6 pb-16 md:pt-10 md:pb-24">
        <div aria-hidden className="ev-spot print:hidden" />
        <div className="mx-auto max-w-6xl">
          {/* ------------------------------------------------------------ compact intro + progress line */}
          <header className="ev-fade flex flex-wrap items-end justify-between gap-x-6 gap-y-4 print:hidden">
            <div className="min-w-0">
              <p className="ev-mono text-muted-foreground" data-script="thai">
                {L.orderNumber}
              </p>
              <h1 className="ev-num mt-2 text-[clamp(2.4rem,1.6rem+2.8vw,4.25rem)] font-bold" data-testid="order-number">
                {order.number}
              </h1>
            </div>
            <span data-testid="order-status">
              <OrderStatusBadge status={order.status} className="h-10 px-5 text-sm" />
            </span>
          </header>

          <ol className="ev-steps ev-fade mt-8 max-w-xl print:hidden" data-tone={stopped || order.status === "refunded" ? "off" : undefined} style={{ "--fill": fill, "--d": ".08s" } as React.CSSProperties} aria-label="ขั้นตอนคำสั่งซื้อ">
            {L.steps.map((label, i) => {
              const st = steps[i]!;
              return (
                <li key={label} className="ev-step" data-state={st} aria-current={st === "now" ? "step" : undefined}>
                  <i aria-hidden>{st === "done" ? <Check className="size-4" strokeWidth={3} /> : st === "off" ? <X className="size-4" strokeWidth={3} /> : <span className="ev-num text-xs font-bold">{i + 1}</span>}</i>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 grid gap-6 md:mt-10 lg:grid-cols-12 lg:gap-10">
            {/* ---------------------------------------------------------- main column */}
            <div className="min-w-0 space-y-6 lg:col-span-7 xl:col-span-8">
              <div className="ev-fade ev-receipt overflow-hidden" style={{ "--d": ".12s" } as React.CSSProperties}>
                <div className={cn("flex items-start gap-3 px-5 py-4 md:px-6", done ? "bg-primary-soft" : stopped ? "bg-destructive/10" : order.status === "pending" ? "bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]" : "bg-muted/60")}>
                  <HeadIcon className={cn("mt-0.5 size-5 shrink-0", stopped ? "text-destructive" : "text-primary")} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-heading text-lg leading-snug font-semibold" data-testid="order-headline">
                      {headline}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
                  </div>
                </div>
                <div className="flex items-stretch gap-4 p-4 md:gap-6 md:p-6">
                  <div className="relative w-24 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-muted sm:w-36">
                    {event.cover ? <Img src={event.cover} alt="" className="absolute inset-0 size-full object-cover" /> : <Ticket className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />}
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1">
                    <Link href={eventHref} className="group font-heading inline-flex items-start gap-1.5 text-lg leading-snug font-semibold transition-colors hover:text-primary md:text-xl">
                      <span className="min-w-0"><ThaiWrap text={event.title} /></span>
                      <ArrowUpRight className="mt-1 size-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden />
                    </Link>
                    {session && (
                      <p className="text-sm text-muted-foreground">
                        {session.name ? `${session.name} · ` : ""}
                        {formatThaiSession(session.startsAt, session.endsAt)}
                      </p>
                    )}
                    {event.venueName && (
                      <p className="text-sm text-muted-foreground">
                        <ThaiWrap text={event.venueName} />
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Ticket className="size-4 text-primary" aria-hidden /> {L.ticketsN(order.quantity)}
                      </span>
                      <span aria-hidden className="text-muted-foreground">·</span>
                      <span className="ev-num font-bold">{order.total > 0 ? thb(order.total) : L.free}</span>
                    </p>
                  </div>
                  {session && (
                    <div aria-hidden className="hidden shrink-0 flex-col items-end justify-center border-l border-dashed border-[color-mix(in_oklab,var(--foreground)_18%,transparent)] pl-6 text-right sm:flex">
                      <span className="ev-num ev-ink text-[2.5rem] leading-none font-bold">{dotDate(session.startsAt)}</span>
                      <span className="ev-num mt-2 text-sm font-semibold text-muted-foreground">{hhmm(session.startsAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {showPayment && payment && (
                <div className="ev-fade" style={{ "--d": ".16s" } as React.CSSProperties} data-testid="order-payment">
                  {holdCountdownAt && (
                    <div className="mb-3 flex justify-center sm:justify-start">
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
                  {payment.status === "pending" && <p className="mt-2 text-center text-xs text-muted-foreground sm:text-left">{L.payWithin(config.holdMinutes)}</p>}
                </div>
              )}

              {order.status === "pending" && (
                <div className="ev-fade" style={{ "--d": ".2s" } as React.CSSProperties}>
                  <OrderActions orderId={order.id} accessKey={key} canCancel renew={renewReason ? { reason: renewReason, amountLabel: thb(order.total), failureReason: payment?.failureReason ?? null, methods } : null} />
                </div>
              )}

              {tickets.length > 0 && (
                <div className="ev-fade pt-2" style={{ "--d": ".16s" } as React.CSSProperties} data-testid="ticket-section">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-heading flex items-center gap-2.5 text-step-2 font-semibold">
                        <Ticket className="size-6 text-primary" aria-hidden /> {L.eTickets}
                      </h2>
                      {liveTickets > 0 && <p className="mt-1 text-sm text-muted-foreground">{L.ticketsReady(liveTickets)}</p>}
                    </div>
                    {done && <TicketTools shareUrl={selfHref} shareTitle={`${event.title} – ${order.number}`} icsHref={`/tickets/${order.id}/ics${keyQs}`} icsFilename={`${order.number}.ics`} />}
                  </div>
                  {/* phones: the floating LINE button must never sit on a QR */}
                  <FloatingChatOptOut>
                  <div className="mt-5 grid gap-5 md:gap-6" data-testid="ticket-list">
                    {tickets.map((t: TicketDetail, i) => (
                      <TicketCard
                        key={t.ticket.id}
                        className="ev-fade"
                        ticket={{ id: t.ticket.id, code: t.ticket.code, holderName: t.ticket.holderName, status: t.ticket.status, typeName: t.typeName, seatLabel: t.ticket.seatLabel, checkedInAt: t.ticket.checkedInAt }}
                        qrDataUrl={qrs[i] ?? null}
                        event={{ title: t.event.title, venueName: t.event.venueName, cover: t.event.cover }}
                        session={t.session}
                        index={L.ticketN(i + 1, tickets.length)}
                        href={`/tickets/t/${encodeURIComponent(t.qrPayload)}`}
                      />
                    ))}
                  </div>
                  </FloatingChatOptOut>
                </div>
              )}
            </div>

            {/* ---------------------------------------------------------- receipt (sticky on desktop) */}
            <aside className="min-w-0 lg:col-span-5 xl:col-span-4 print:hidden">
              <div className="space-y-4 lg:sticky lg:top-[calc(var(--header-h,72px)+1.5rem)]">
                <div className="ev-fade ev-receipt" style={{ "--d": ".2s" } as React.CSSProperties}>
                  <div className="p-5 md:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                        <Receipt className="size-5 text-primary" aria-hidden /> {L.summary}
                      </h2>
                      <span className="ev-mono text-muted-foreground">{order.number}</span>
                    </div>
                    <div className="mt-4">
                      <OrderLines data={{ lines: order.lines, quantity: order.quantity, subtotal: order.subtotal, discount: order.discount, total: order.total, promoCode: order.promoCode }} />
                    </div>
                  </div>
                  <div className="border-t-2 border-dashed border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] p-5 md:p-6">
                    <dl className="grid gap-3.5 text-sm">
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
                    <div aria-hidden className="ev-barcode mt-6 h-10 rounded-sm text-foreground" />
                  </div>
                </div>
                <div className="ev-fade grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1" style={{ "--d": ".24s" } as React.CSSProperties}>
                  <Button asChild size="lg" variant={stopped || order.status === "refunded" ? "default" : "outline"} className="h-12 rounded-full">
                    <Link href={eventHref}>
                      <Sparkles className="size-4" /> {L.buyAgain}
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-full">
                    <Link href={customer ? "/account/tickets" : `/account/login?next=${encodeURIComponent("/account/tickets")}`}>
                      <History className="size-4" /> {L.myTickets}
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right font-medium break-words", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
