import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Ticket } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders, type OrderListItem } from "@rentweb/module-events/services";
import { DateBadge, L, OrderStatusBadge, formatThaiSession } from "@rentweb/module-events/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "บัตรของฉัน" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string }>;

/** /account/tickets?scope=upcoming|past – the signed-in customer's ticket orders. */
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
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> {L.backToAccount}
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">{L.myTickets}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {L.upcoming} {upcoming.length} รายการ · {L.history} {past.length} รายการ
              </p>
            </div>
            <Button asChild className="h-11">
              <Link href="/events">
                <Ticket /> {L.browse}
              </Link>
            </Button>
          </Reveal>

          <nav aria-label="ช่วงเวลา" className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <ScopeTab href="/account/tickets" active={scope === "upcoming"}>
              {L.upcoming} ({upcoming.length})
            </ScopeTab>
            <ScopeTab href="/account/tickets?scope=past" active={scope === "past"}>
              {L.history} ({past.length})
            </ScopeTab>
          </nav>

          {list.length === 0 ? (
            <div className="card mt-6 flex flex-col items-center gap-3 p-10 text-center" data-testid="tickets-empty">
              <Ticket className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{scope === "upcoming" ? L.noUpcoming : L.noPast}</p>
              <Button asChild size="lg">
                <Link href="/events">{L.browse}</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-6 grid gap-3" data-testid="order-list">
              {list.map((o) => (
                <StaggerItem key={o.order.id}>
                  <OrderRow o={o} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </PageBody>
  );
}

function ScopeTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-11 items-center justify-center rounded-full text-sm font-medium transition", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}

function OrderRow({ o }: { o: OrderListItem }) {
  const when = o.session?.startsAt ?? null;
  return (
    <Link href={`/tickets/${o.order.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5" data-testid="order-row">
      {when ? <DateBadge date={when} /> : <span className="flex w-16 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-primary-soft py-4 text-primary"><Ticket className="size-6" /></span>}
      {o.event.cover ? <Img src={o.event.cover} alt="" className="hidden size-14 shrink-0 rounded-[var(--radius-lg)] object-cover sm:block" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{o.order.number}</span>
          <OrderStatusBadge status={o.order.status} />
        </div>
        <p className="mt-1 truncate font-medium">{o.event.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {o.session && <span>{formatThaiSession(o.session.startsAt, o.session.endsAt)}</span>}
          {o.event.venueName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {o.event.venueName}
            </span>
          )}
          <span>{L.ticketsN(o.order.quantity)}</span>
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-heading text-lg font-semibold text-primary">{o.order.total > 0 ? thb(o.order.total) : L.free}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
