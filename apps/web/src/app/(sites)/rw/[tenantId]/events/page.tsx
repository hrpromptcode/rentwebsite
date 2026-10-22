import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Eyebrow, RevealHeading, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import { countEvents, eventCardStats, listEventCategories, listEvents, listPublicEvents } from "@rentweb/module-events/services";
import { EvStyles, EventCard, L } from "@rentweb/module-events/ui";
import { EvPills } from "@rentweb/module-events/client";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string; category?: string; q?: string }>;

/** archive = events still "published" whose last session ended, plus ones the organiser marked "ended" */
const PAST_STATUSES: Array<"published" | "ended"> = ["published", "ended"];
const p2 = (n: number) => String(n).padStart(2, "0");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "events", "events", { title: L.eventsTitle, description: L.eventsIntro }) : {};
}

/**
 * /events?scope=upcoming|past&category=…&q=… — the poster wall (§5.10): giant intro, sliding scope / category pills,
 * a glowing search, and every published event as a stage poster (date stamp, beam glow + tilt, ticket stub price).
 * Marketing-light: reveals + hover only (no WebGL here). Filtered views never mention other events' titles.
 */
export default async function EventsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("events")) return cmsFallback(runtime, "events");
  const scope: "upcoming" | "past" = sp.scope === "past" ? "past" : "upcoming";
  const category = sp.category?.trim().slice(0, 60) || null;
  const q = sp.q?.trim().slice(0, 80) || null;

  const { events, categories, upcomingCount, pastCount, stats } = await tenantTx(tenantId, async (tx) => {
    const filter = { category, q, limit: 60 };
    const [events, categories, upcomingCount, pastCount] = await Promise.all([
      scope === "past" ? listEvents(tx, tenantId, { ...filter, scope: "past", status: PAST_STATUSES }) : listPublicEvents(tx, tenantId, filter),
      listEventCategories(tx, tenantId, { publishedOnly: true }),
      countEvents(tx, tenantId, { status: "published", scope: "upcoming" }),
      countEvents(tx, tenantId, { status: PAST_STATUSES, scope: "past" }),
    ]);
    return { events, categories, upcomingCount, pastCount, stats: await eventCardStats(tx, tenantId, events.map((e) => e.id)) };
  });

  const href = (patch: { scope?: "upcoming" | "past"; category?: string | null; q?: string | null }) => {
    const s = new URLSearchParams();
    const sc = patch.scope ?? scope;
    const cat = patch.category === undefined ? category : patch.category;
    const qq = patch.q === undefined ? q : patch.q;
    if (sc === "past") s.set("scope", "past");
    if (cat) s.set("category", cat);
    if (qq) s.set("q", qq);
    const str = s.toString();
    return `/events${str ? `?${str}` : ""}`;
  };
  const filtered = !!(q || category);
  // poster wall: 4 columns when 3 would leave a lone poster on the last row (4, 7, 8, 10 …), offset every other column
  const cols4 = events.length > 1 && (events.length % 4 === 0 || events.length % 3 === 1);
  const offset = (i: number) => (events.length >= 3 && (cols4 ? i % 2 === 1 : i % 3 === 1) ? "lg:translate-y-[9%]" : "");
  // the stage glow paints under an overlaying header → the page pads itself (same rule as PageBody)
  const lay = runtime.theme.layout;
  const overlay = lay.header === "floating" || (lay.headerTransparent && lay.headerSticky);

  return (
    <div>
      <EvStyles />
      <SectionStyles />
      <section className="relative overflow-x-clip">
        {/* decorative stage glow + outline wordmark behind the intro */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(45%_60%_at_85%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%),radial-gradient(35%_50%_at_60%_10%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)]" />
        <div className="container-x pb-16 md:pb-28">
          <header data-page-intro="" className={cn("grid gap-8 pb-10 md:pb-12 lg:grid-cols-12 lg:items-end", overlay ? "pt-28 md:pt-40" : "pt-8 md:pt-14")}>
            <div className="lg:col-span-8">
              <Eyebrow text={runtime.config.name} index={scope === "past" ? "02 / ARCHIVE" : "01 / LINE-UP"} className="mb-5" />
              <RevealHeading as="h1" text={L.eventsTitle} trigger="mount" className="font-heading text-step-6 font-bold text-balance" />
              <p className="rw-fade mt-4 max-w-xl text-step-1 leading-relaxed text-muted-foreground">{L.eventsIntro}</p>
            </div>
            <div className="flex items-end gap-8 lg:col-span-4 lg:justify-end">
              <p className="flex flex-col">
                <span className="ev-num ev-ink text-[clamp(3rem,2.2rem+3vw,5.75rem)] font-bold">{p2(upcomingCount)}</span>
                <span className="ev-mono mt-2 text-muted-foreground" data-script="thai">{L.upcoming}</span>
              </p>
              <p className="flex flex-col">
                <span className="ev-num text-[clamp(3rem,2.2rem+3vw,5.75rem)] font-bold text-foreground/30">{p2(pastCount)}</span>
                <span className="ev-mono mt-2 text-muted-foreground" data-script="thai">{L.past}</span>
              </p>
            </div>
          </header>

          {/* filters: scope pills · search · category pills */}
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <EvPills
              id="events-scope"
              testId="events-scope"
              ariaLabel="ช่วงเวลา"
              current="page"
              size="lg"
              items={[
                { href: href({ scope: "upcoming" }), label: L.upcoming, active: scope === "upcoming", count: upcomingCount },
                { href: href({ scope: "past" }), label: L.past, active: scope === "past", count: pastCount },
              ]}
            />
            <form method="get" action="/events" role="search" className="group relative flex items-center gap-2 lg:max-w-md lg:justify-self-end lg:w-full" data-testid="events-search">
              {scope === "past" && <input type="hidden" name="scope" value="past" />}
              {category && <input type="hidden" name="category" value={category} />}
              <label htmlFor="events-q" className="sr-only">
                {L.search}
              </label>
              <Search className="pointer-events-none absolute left-4 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden />
              <input
                id="events-q"
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder={L.searchPlaceholder}
                maxLength={80}
                className="h-12 w-full min-w-0 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-card/60 pr-4 pl-11 text-[15px] outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
              />
              <Button type="submit" size="lg" className="h-12 shrink-0 rounded-full" aria-label={L.search}>
                <Search className="size-4" /> <span className="hidden sm:inline">{L.search}</span>
              </Button>
            </form>
          </div>

          {categories.length > 1 && (
            <EvPills
              id="events-categories"
              testId="events-categories"
              ariaLabel={L.category}
              className="mt-4"
              items={[{ href: href({ category: null }), label: L.allCategories, active: !category }, ...categories.map((c) => ({ href: href({ category: c.category }), label: c.category, active: category === c.category, count: c.count }))]}
            />
          )}

          <div className="mt-8 flex items-center justify-between gap-4 border-t ev-hair pt-5 md:mt-10">
            <p className="ev-mono text-muted-foreground" aria-live="polite" data-script="thai">
              {L.resultsN(events.length)}
              {q ? ` · “${q}”` : ""}
              {category ? ` · ${category}` : ""}
            </p>
            {filtered && (
              <Link href={href({ category: null, q: null })} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                ล้างตัวกรอง <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>

          {events.length === 0 ? (
            <div className="relative mt-6 overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-dashed ev-hair px-6 py-16 text-center md:py-24" data-testid="events-empty">
              <div aria-hidden className="ev-ticket-x ev-ticket-bg ev-ticket-edge mx-auto mb-8 flex h-24 w-56 rotate-[-6deg] items-center justify-between rounded-xl px-5 opacity-80">
                <span className="ev-num text-3xl font-bold text-muted-foreground">00.00</span>
                <span className="ev-barcode h-14 w-10 text-muted-foreground" />
              </div>
              <p className="mx-auto max-w-md text-step-1 text-muted-foreground">{filtered ? L.emptySearch : scope === "past" ? L.emptyPast : L.emptyEvents}</p>
              <div className="mt-8 flex justify-center">
                <CtaButton href={filtered ? href({ category: null, q: null }) : scope === "past" ? "/events" : "/contact"} label={filtered ? L.allEvents : scope === "past" ? L.upcoming : "ติดต่อผู้จัด"} variant="outline" size="lg" />
              </div>
            </div>
          ) : (
            <div data-testid="events-grid">
              <StaggerList className={cn("mt-6 grid gap-5 sm:grid-cols-2 md:gap-6", cols4 ? "lg:grid-cols-4" : "lg:grid-cols-3", events.length >= 3 && "lg:pb-[4%]")} stagger={0.08}>
                {events.map((e, i) => (
                  <StaggerCell key={e.id} className="h-full">
                    <div className={cn("h-full", offset(i))}>
                      <EventCard event={e} stats={stats.get(e.id)} priority={i < 3} past={scope === "past"} />
                    </div>
                  </StaggerCell>
                ))}
              </StaggerList>
            </div>
          )}

          {scope === "upcoming" && events.length > 0 && (
            <div className="ev-ticket-x ev-ticket-bg ev-ticket-edge mt-16 grid items-center gap-6 rounded-[calc(var(--radius)*1.6)] p-6 sm:grid-cols-[minmax(0,1fr)_auto] md:mt-24 md:p-10" style={{ "--at": "62%" } as React.CSSProperties}>
              <div>
                <p className="ev-mono text-muted-foreground">Admit one</p>
                <p className="font-heading mt-2 text-step-3 leading-tight font-semibold text-balance">บัตรของคุณอยู่ในมือถือ</p>
                <p className="mt-2 max-w-xl text-muted-foreground">เข้าสู่ระบบด้วยเบอร์โทรที่ใช้ซื้อ แล้วเปิด QR ของทุกงานได้ในที่เดียว</p>
              </div>
              <CtaButton href="/account/tickets" label={L.myTickets} size="lg" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
