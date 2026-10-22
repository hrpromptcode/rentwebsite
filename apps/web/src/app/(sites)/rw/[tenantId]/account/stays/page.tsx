import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, BedDouble, ChevronLeft, Moon, Search, Users } from "lucide-react";
import { Img, PageIntro, StaggerCell, StaggerList, sized } from "@rentweb/storefront";
import { listCustomerStays, type StayListItem } from "@rentweb/module-rental/services";
import { L, Price, RentalStyles, STAY_PAYMENT_STATUS, StayStatusBadge, formatThaiRange } from "@rentweb/module-rental/ui";
import { THAI_MONTHS_SHORT } from "@rentweb/module-rental/time";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { ScopeTabs } from "./scope-tabs";

export const metadata: Metadata = { title: "การเข้าพักของฉัน" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string }>;

/** /account/stays?scope=upcoming|past – the signed-in guest's stays (operational: calm list, sliding tab pill). */
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
      <RentalStyles />
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <PageIntro compact eyebrow="บัญชีของฉัน" title={L.myStays} lead={`${L.upcoming} ${upcoming.length} รายการ · ${L.history} ${past.length} รายการ`} className="pb-6 md:pb-8">
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link href="/account" className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden /> บัญชีของฉัน
              </Link>
              <Link href="/stay" className="rw-press ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-primary hover:text-primary-foreground">
                <Search className="size-4" aria-hidden /> {L.search}
              </Link>
            </div>
          </PageIntro>

          <ScopeTabs
            tabs={[
              { href: "/account/stays", label: `${L.upcoming} (${upcoming.length})`, active: scope === "upcoming" },
              { href: "/account/stays?scope=past", label: `${L.history} (${past.length})`, active: scope === "past" },
            ]}
          />

          {list.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-[var(--radius-2xl)] border border-dashed border-border px-6 py-14 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-surface text-muted-foreground">
                <BedDouble className="size-7" aria-hidden />
              </span>
              <p className="max-w-sm text-muted-foreground">{scope === "upcoming" ? L.noUpcoming : L.noHistory}</p>
              <Link href="/rooms" className="rw-press inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                {L.allRooms}
              </Link>
            </div>
          ) : (
            <StaggerList className="mt-6 grid gap-3" stagger={0.06}>
              {list.map((s) => (
                <StaggerCell key={s.id}>
                  <StayRow s={s} />
                </StaggerCell>
              ))}
            </StaggerList>
          )}
        </div>
      </section>
    </PageBody>
  );
}

function StayRow({ s }: { s: StayListItem }) {
  const [y, m, d] = s.checkIn.split("-").map(Number) as [number, number, number];
  return (
    <Link href={`/stays/${s.id}`} className="rw-room-card group flex items-center gap-4 rounded-[var(--radius-2xl)] border border-border bg-card p-3.5 pr-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:gap-5 md:p-4 md:pr-6" data-testid="stay-row">
      <div className="relative flex w-[4.5rem] shrink-0 flex-col items-center justify-center self-stretch overflow-hidden rounded-[var(--radius-xl)] bg-primary-soft py-2 text-primary-ink md:w-20">
        {s.cover ? <Img src={sized(s.cover, 200)} alt="" className="absolute inset-0 size-full object-cover opacity-[.18]" /> : null}
        <span className="relative text-[0.7rem] font-semibold">{THAI_MONTHS_SHORT[m - 1]}</span>
        <span className="rw-price-num relative text-3xl leading-none">{d}</span>
        <span className="relative text-[0.7rem]">{y + 543}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{s.number}</span>
          <StayStatusBadge status={s.status} />
        </div>
        <p className="mt-1.5 truncate font-heading text-step-1 font-semibold">{s.typeName}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Moon className="size-3" aria-hidden /> {formatThaiRange(s.checkIn, s.checkOut)} · {L.nights(s.nights)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" aria-hidden /> {L.guestsN(s.guests)}
          </span>
          <span>{STAY_PAYMENT_STATUS[s.paymentStatus] ?? s.paymentStatus}</span>
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <Price amount={s.total} className="text-xl text-primary-ink" />
      </div>
      <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border transition-all duration-500 group-hover:rotate-45 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}
