import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BedDouble, ChevronLeft, ChevronRight, Moon, Search, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { listCustomerStays, type StayListItem } from "@rentweb/module-rental/services";
import { L, STAY_PAYMENT_STATUS, StayStatusBadge, formatThaiRange, formatThaiYmd } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "การเข้าพักของฉัน" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string }>;

/** /account/stays?scope=upcoming|past – the signed-in guest's stays. */
export default async function AccountStaysPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { scope: rawScope } = await searchParams;
  const scope: "upcoming" | "past" = rawScope === "past" ? "past" : "upcoming";
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/stays")}`);

  const { upcoming, past } = await tenantTx(tenantId, async (tx) => ({
    upcoming: await listCustomerStays(tx, tenantId, customer.id, { scope: "upcoming", limit: 100 }),
    past: await listCustomerStays(tx, tenantId, customer.id, { scope: "past", limit: 100 }),
  }));
  const list = scope === "upcoming" ? upcoming : past;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> บัญชีของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">{L.myStays}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {L.upcoming} {upcoming.length} รายการ · {L.history} {past.length} รายการ
              </p>
            </div>
            <Button asChild className="h-11">
              <Link href="/stay">
                <Search /> {L.search}
              </Link>
            </Button>
          </Reveal>

          <nav aria-label="ช่วงเวลา" className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <ScopeTab href="/account/stays" active={scope === "upcoming"}>
              {L.upcoming} ({upcoming.length})
            </ScopeTab>
            <ScopeTab href="/account/stays?scope=past" active={scope === "past"}>
              {L.history} ({past.length})
            </ScopeTab>
          </nav>

          {list.length === 0 ? (
            <div className="card mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <BedDouble className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{scope === "upcoming" ? L.noUpcoming : L.noHistory}</p>
              <Button asChild size="lg">
                <Link href="/rooms">{L.allRooms}</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-6 grid gap-3" data-testid="stay-list">
              {list.map((s) => (
                <StaggerItem key={s.id}>
                  <StayRow s={s} />
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

function StayRow({ s }: { s: StayListItem }) {
  const [d, mo] = formatThaiYmd(s.checkIn, { short: true }).split(" ");
  return (
    <Link href={`/stays/${s.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5" data-testid="stay-row">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-[var(--radius-lg)] bg-primary-soft py-2 text-primary">
        <span className="text-[11px]">{mo}</span>
        <span className="font-heading text-2xl font-semibold leading-none">{d}</span>
        <span className="text-[11px]">{L.nights(s.nights)}</span>
      </div>
      {s.cover ? <Img src={s.cover} alt="" className="hidden size-14 shrink-0 rounded-[var(--radius-lg)] object-cover sm:block" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{s.number}</span>
          <StayStatusBadge status={s.status} />
        </div>
        <p className="mt-1 truncate font-medium">{s.typeName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Moon className="size-3" /> {formatThaiRange(s.checkIn, s.checkOut)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" /> {L.guestsN(s.guests)}
          </span>
          <span>{STAY_PAYMENT_STATUS[s.paymentStatus] ?? s.paymentStatus}</span>
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-heading text-lg font-semibold text-primary">{thb(s.total)}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
