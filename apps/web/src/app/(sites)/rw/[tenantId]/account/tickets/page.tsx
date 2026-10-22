import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Ticket } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders, type OrderListItem } from "@rentweb/module-events/services";
import { EvStyles, L, OrderStatusBadge, ThaiWrap, dotDate, formatThaiSession, weekdayTime } from "@rentweb/module-events/ui";
import { EvPills } from "@rentweb/module-events/client";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "บัตรของฉัน" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string }>;

/**
 * /account/tickets?scope=upcoming|past – the signed-in customer's ticket orders. Operational (§6.4): compact intro,
 * sliding scope pills, each order a ticket stub (accent-font date | perforation | cover, title, status | total).
 */
export default async function AccountTicketsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { scope: rawScope } = await searchParams;
  const scope: "upcoming" | "past" = rawScope === "past" ? "past" : "upcoming";
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/tickets")}`);

  const { upcoming, past } = await tenantTx(tenantId, async (tx) => ({
    upcoming: await listCustomerOrders(tx, tenantId, customer.id, { scope: "upcoming", limit: 100 }),
    past: await listCustomerOrders(tx, tenantId, customer.id, { scope: "past", limit: 100 }),
  }));
  const list = scope === "upcoming" ? upcoming : past;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <EvStyles />
      <section className="container-x relative isolate pt-6 pb-16 md:pt-10 md:pb-24">
        <div aria-hidden className="ev-spot" />
        <div className="mx-auto max-w-4xl">
          <Link href="/account" className="group inline-flex h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden /> {L.backToAccount}
          </Link>
          <header className="ev-fade mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
            <div>
              <p className="ev-mono text-muted-foreground">
                <span className="text-primary">●</span> My tickets · {runtime.config.name}
              </p>
              <h1 className="font-heading mt-2 text-step-5 leading-[1.15] font-semibold" data-script="thai">
                {L.myTickets}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {L.upcoming} {upcoming.length} รายการ · {L.history} {past.length} รายการ
              </p>
            </div>
            <Button asChild className="group h-12 rounded-full px-6">
              <Link href="/events">
                <Ticket /> {L.browse}
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </Button>
          </header>

          <EvPills
            id="account-ticket-scope"
            ariaLabel="ช่วงเวลา"
            current="page"
            className="ev-fade mt-8"
            items={[
              { href: "/account/tickets", label: L.upcoming, active: scope === "upcoming", count: upcoming.length },
              { href: "/account/tickets?scope=past", label: L.history, active: scope === "past", count: past.length },
            ]}
          />

          {list.length === 0 ? (
            <div className="ev-fade mt-6 flex flex-col items-center gap-4 rounded-[calc(var(--radius)*1.4)] border-2 border-dashed border-[color-mix(in_oklab,var(--foreground)_16%,transparent)] px-6 py-14 text-center" data-testid="tickets-empty">
              <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                <Ticket className="size-7" aria-hidden />
              </span>
              <p className="font-heading text-lg font-semibold">{scope === "upcoming" ? L.noUpcoming : L.noPast}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{L.emptyHint}</p>
              <Button asChild size="lg" className="mt-1 h-12 rounded-full px-7">
                <Link href="/events">{L.browse}</Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4" data-testid="order-list">
              {list.map((o, i) => (
                <li key={o.order.id} className="ev-fade" style={{ "--d": `${Math.min(i, 8) * 0.05}s` } as React.CSSProperties}>
                  <OrderRow o={o} past={scope === "past"} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageBody>
  );
}

function OrderRow({ o, past }: { o: OrderListItem; past: boolean }) {
  const when = o.session?.startsAt ?? null;
  const dim = past || o.order.status === "cancelled" || o.order.status === "expired" || o.order.status === "refunded";
  return (
    <Link href={`/tickets/${o.order.id}`} className="ev-orow ev-ticket-bg ev-ticket-edge group grid grid-cols-[5.75rem_minmax(0,1fr)] overflow-hidden rounded-[calc(var(--radius)*1.4)] sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]" data-testid="order-row">
      {/* date stub */}
      <div className="flex flex-col items-center justify-center gap-1.5 border-r-2 border-dashed border-[color-mix(in_oklab,var(--foreground)_16%,transparent)] px-2 py-5 text-center">
        {when ? (
          <>
            <span aria-hidden className={cn("ev-num text-[1.2rem] leading-none font-bold sm:text-[1.6rem]", dim ? "text-muted-foreground" : "ev-ink")}>
              {dotDate(when)}
            </span>
            <span aria-hidden className="ev-mono text-muted-foreground" data-script="thai">
              {weekdayTime(when)}
            </span>
          </>
        ) : (
          <Ticket className="size-6 text-primary" aria-hidden />
        )}
      </div>
      {/* body */}
      <div className="flex min-w-0 items-center gap-4 p-4 md:p-5">
        {o.event.cover ? (
          <span className="relative hidden h-16 w-20 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-muted sm:block">
            <Img src={o.event.cover} alt="" className={cn("absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-110", dim && "grayscale")} />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{o.order.number}</span>
            <OrderStatusBadge status={o.order.status} />
          </div>
          <p className="font-heading mt-1.5 line-clamp-2 text-base leading-snug font-semibold md:text-lg">
            <ThaiWrap text={o.event.title} />
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {o.session && <span>{formatThaiSession(o.session.startsAt, o.session.endsAt)}</span>}
            {o.event.venueName && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" aria-hidden /> <span className="truncate">{o.event.venueName}</span>
              </span>
            )}
            <span>{L.ticketsN(o.order.quantity)}</span>
            <span className="ev-num font-semibold text-foreground sm:hidden">{o.order.total > 0 ? thb(o.order.total) : L.free}</span>
          </p>
        </div>
      </div>
      {/* total + go */}
      <div className="hidden items-center gap-4 pr-5 sm:flex">
        <span className="ev-num text-lg font-bold">{o.order.total > 0 ? thb(o.order.total) : L.free}</span>
        <span aria-hidden className="ev-orow-go inline-flex size-11 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--foreground)_16%,transparent)]">
          <ArrowRight className="size-5" />
        </span>
      </div>
    </Link>
  );
}
