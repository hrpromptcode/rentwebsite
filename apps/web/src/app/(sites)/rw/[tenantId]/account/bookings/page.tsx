import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Sparkles, UserRound, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { formatBkkTime, formatThaiDate, listCustomerBookings, type BookingListItem } from "@rentweb/module-booking/services";
import { BookingStatusBadge } from "@rentweb/module-booking/ui";
import { L, PAYMENT_STATUS } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "การจองของฉัน" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string }>;

/** /account/bookings?scope=upcoming|past – the signed-in customer's appointments. */
export default async function AccountBookingsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { scope: rawScope } = await searchParams;
  const scope: "upcoming" | "past" = rawScope === "past" ? "past" : "upcoming";
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/bookings")}`);

  const { upcoming, past } = await tenantTx(tenantId, async (tx) => ({
    upcoming: await listCustomerBookings(tx, tenantId, customer.id, { scope: "upcoming", limit: 100 }),
    past: await listCustomerBookings(tx, tenantId, customer.id, { scope: "past", limit: 100 }),
  }));
  const list = scope === "upcoming" ? upcoming : past;
  const hasClinic = runtime.config.modules.includes("clinic");

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> บัญชีของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">การจองของฉัน</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                นัดถัดไป {upcoming.length} รายการ · ประวัติ {past.length} รายการ
              </p>
            </div>
            <div className="flex gap-2">
              {hasClinic && (
                <Button asChild variant="outline" className="h-11">
                  <Link href="/account/packages">
                    <Wallet /> คอร์สของฉัน
                  </Link>
                </Button>
              )}
              <Button asChild className="h-11">
                <Link href="/book">
                  <Sparkles /> {L.bookNow}
                </Link>
              </Button>
            </div>
          </Reveal>

          <nav aria-label="ช่วงเวลา" className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <ScopeTab href="/account/bookings" active={scope === "upcoming"}>
              นัดถัดไป ({upcoming.length})
            </ScopeTab>
            <ScopeTab href="/account/bookings?scope=past" active={scope === "past"}>
              ประวัติ ({past.length})
            </ScopeTab>
          </nav>

          {list.length === 0 ? (
            <div className="card mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <CalendarDays className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{scope === "upcoming" ? "ยังไม่มีนัดถัดไป จองคิวใหม่ได้เลย" : "ยังไม่มีประวัติการจอง"}</p>
              <Button asChild size="lg">
                <Link href="/book">{L.bookNow}</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-6 grid gap-3">
              {list.map((b) => (
                <StaggerItem key={b.id}>
                  <BookingRow b={b} />
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

function BookingRow({ b }: { b: BookingListItem }) {
  return (
    <Link href={`/bookings/${b.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-[var(--radius-lg)] bg-primary-soft py-2 text-primary">
        <span className="text-[11px] uppercase">{formatThaiDate(b.startsAt, { short: true }).split(" ")[1]}</span>
        <span className="font-heading text-2xl font-semibold leading-none">{formatThaiDate(b.startsAt).split(" ")[0]}</span>
        <span className="text-[11px]">{formatBkkTime(b.startsAt)}</span>
      </div>
      {b.serviceImage ? <Img src={b.serviceImage} alt="" className="hidden size-14 shrink-0 rounded-[var(--radius-lg)] object-cover sm:block" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{b.number}</span>
          <BookingStatusBadge status={b.status} />
        </div>
        <p className="mt-1 truncate font-medium">{b.serviceName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {formatBkkTime(b.startsAt)}–{formatBkkTime(b.endsAt)}
          </span>
          {b.staffName && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" /> {b.staffName}
            </span>
          )}
          <span>{PAYMENT_STATUS[b.paymentStatus] ?? b.paymentStatus}</span>
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-heading text-lg font-semibold text-primary">{b.price === 0 ? L.free : thb(b.price)}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
