import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Sparkles, UserRound, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { countActiveSessions, formatBkkTime, formatThaiDate, listCustomerBookings, packagesEnabled, type BookingListItem } from "@rentweb/module-booking/services";
import { BookingStatusBadge, CompactIntro } from "@rentweb/module-booking/ui";
import { L, PAYMENT_STATUS } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "การจองของฉัน" };

/** course template (siteType "course"): the same page reads as "คลาสของฉัน" and shows the pass sessions left */

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

  const passes = packagesEnabled(runtime.config.modules, runtime.config.moduleConfig);
  const clinic = runtime.config.modules.includes("clinic");
  const course = runtime.config.siteType === "course";
  const { upcoming, past, sessionsLeft } = await tenantTx(tenantId, async (tx) => ({
    upcoming: await listCustomerBookings(tx, tenantId, customer.id, { scope: "upcoming", limit: 100 }),
    past: await listCustomerBookings(tx, tenantId, customer.id, { scope: "past", limit: 100 }),
    sessionsLeft: passes ? await countActiveSessions(tx, tenantId, customer) : 0,
  }));
  const list = scope === "upcoming" ? upcoming : past;
  const copy = course
    ? { title: "คลาสของฉัน", stats: `คลาสถัดไป ${upcoming.length} รอบ · เรียนไปแล้ว ${past.length} รอบ`, upcoming: "คลาสถัดไป", past: "เรียนแล้ว", emptyUpcoming: "ยังไม่มีคลาสถัดไป เลือกรอบจากตารางเรียนได้เลย", emptyPast: "ยังไม่มีประวัติการเรียน", cta: L.schedule, ctaHref: "/schedule" }
    : { title: "การจองของฉัน", stats: `นัดถัดไป ${upcoming.length} รายการ · ประวัติ ${past.length} รายการ`, upcoming: "นัดถัดไป", past: "ประวัติ", emptyUpcoming: "ยังไม่มีนัดถัดไป จองคิวใหม่ได้เลย", emptyPast: "ยังไม่มีประวัติการจอง", cta: L.bookNow, ctaHref: "/book" };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <div className="mx-auto max-w-3xl">
          <CompactIntro
            back={
              <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
                <ChevronLeft className="size-4" /> บัญชีของฉัน
              </Link>
            }
            title={copy.title}
            lead={
              <>
                {copy.stats}
                {passes && sessionsLeft > 0 ? ` · ${clinic ? "คอร์ส" : "คลาสพาส"}เหลือ ${sessionsLeft} ครั้ง` : ""}
              </>
            }
            right={
              <div className="flex flex-wrap gap-2">
                {passes && (
                  <Button asChild variant="outline" className="h-11 rounded-full">
                    <Link href="/account/packages">
                      <Wallet /> {clinic ? "คอร์สของฉัน" : L.myPasses}
                    </Link>
                  </Button>
                )}
                <Button asChild className="h-11 rounded-full">
                  <Link href={copy.ctaHref}>
                    <Sparkles /> {copy.cta}
                  </Link>
                </Button>
              </div>
            }
          />

          <nav aria-label="ช่วงเวลา" className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-muted/60 p-1">
            <ScopeTab href="/account/bookings" active={scope === "upcoming"}>
              {copy.upcoming} ({upcoming.length})
            </ScopeTab>
            <ScopeTab href="/account/bookings?scope=past" active={scope === "past"}>
              {copy.past} ({past.length})
            </ScopeTab>
          </nav>

          {list.length === 0 ? (
            <div className="bk-panel rw-fade mt-6 flex flex-col items-center gap-4 p-12 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <CalendarDays className="size-6" />
              </span>
              <p className="text-muted-foreground">{scope === "upcoming" ? copy.emptyUpcoming : copy.emptyPast}</p>
              <Button asChild size="lg" className="rounded-full">
                <Link href={copy.ctaHref}>{copy.cta}</Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-6 grid gap-3">
              {list.map((b, i) => (
                <li key={b.id} className="bk-pop" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                  <BookingRow b={b} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageBody>
  );
}

function ScopeTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-11 items-center justify-center rounded-full text-sm font-medium transition-colors duration-300", active ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_var(--primary)]" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}

function BookingRow({ b }: { b: BookingListItem }) {
  return (
    <Link href={`/bookings/${b.id}`} className="bk-panel group flex items-center gap-4 p-4 transition-[transform,box-shadow,border-color] duration-500 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_20px_50px_-30px_var(--primary)] md:p-5">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-[calc(var(--radius,.75rem)*1.1)] bg-primary-soft py-2 text-primary-ink">
        <span className="text-[11px] uppercase">{formatThaiDate(b.startsAt, { short: true }).split(" ")[1]}</span>
        <span className="font-accent text-2xl font-semibold leading-none">{formatThaiDate(b.startsAt).split(" ")[0]}</span>
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
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}
