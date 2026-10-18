import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2, Search, Ticket } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { countEvents, eventCardStats, listEventCategories, listEvents, listPublicEvents } from "@rentweb/module-events/services";
import { EventCard, L } from "@rentweb/module-events/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ scope?: string; category?: string; q?: string }>;

/** archive = events still "published" whose last session ended, plus ones the organiser marked "ended" */
const PAST_STATUSES: Array<"published" | "ended"> = ["published", "ended"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "events", "events", { title: L.eventsTitle, description: L.eventsIntro }) : {};
}

/** /events?scope=upcoming|past&category=…&q=… – every published event with its date, venue and "from" price. */
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

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{L.eventsTitle}</h1>
          <p className="mt-4 text-muted-foreground">{L.eventsIntro}</p>
        </Reveal>

        <Reveal delay={0.05} className="mt-8 grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
          <nav aria-label="ช่วงเวลา" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 sm:inline-grid" data-testid="events-scope">
            <ScopeTab href={href({ scope: "upcoming" })} active={scope === "upcoming"}>
              {L.upcoming} ({upcomingCount})
            </ScopeTab>
            <ScopeTab href={href({ scope: "past" })} active={scope === "past"}>
              {L.past} ({pastCount})
            </ScopeTab>
          </nav>
          <form method="get" action="/events" role="search" className="flex gap-2 lg:max-w-md lg:justify-self-end" data-testid="events-search">
            {scope === "past" && <input type="hidden" name="scope" value="past" />}
            {category && <input type="hidden" name="category" value={category} />}
            <label htmlFor="events-q" className="sr-only">
              {L.search}
            </label>
            <Input id="events-q" name="q" type="search" defaultValue={q ?? ""} placeholder={L.searchPlaceholder} className="h-12" maxLength={80} />
            <Button type="submit" size="lg" className="h-12 shrink-0" aria-label={L.search}>
              <Search className="size-4" /> <span className="hidden sm:inline">{L.search}</span>
            </Button>
          </form>
        </Reveal>

        {categories.length > 1 && (
          <Reveal delay={0.1} className="mt-4 flex flex-wrap gap-2" data-testid="events-categories">
            <Chip href={href({ category: null })} active={!category}>
              {L.allCategories}
            </Chip>
            {categories.map((c) => (
              <Chip key={c.category} href={href({ category: c.category })} active={category === c.category}>
                {c.category} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </Reveal>
        )}

        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {L.resultsN(events.length)}
          {q ? ` · “${q}”` : ""}
        </p>

        {events.length === 0 ? (
          <div className="card mt-4 flex flex-col items-center gap-3 p-10 text-center" data-testid="events-empty">
            {filtered ? <Search className="size-10 text-muted-foreground" /> : <CalendarX2 className="size-10 text-muted-foreground" />}
            <p className="text-muted-foreground">{filtered ? L.emptySearch : scope === "past" ? L.emptyPast : L.emptyEvents}</p>
            <Button asChild size="lg" variant="outline">
              <Link href={filtered ? href({ category: null, q: null }) : scope === "past" ? "/events" : "/contact"}>{filtered ? L.allEvents : scope === "past" ? L.upcoming : "ติดต่อผู้จัด"}</Link>
            </Button>
          </div>
        ) : (
          <Stagger className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05} data-testid="events-grid">
            {events.map((e, i) => (
              <StaggerItem key={e.id} className="h-full">
                <EventCard event={e} stats={stats.get(e.id)} priority={i < 3} past={scope === "past"} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        {scope === "upcoming" && events.length > 0 && (
          <Reveal className="mt-12 flex flex-col items-center gap-2 text-center">
            <Ticket className="size-6 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">{L.eventsIntro}</p>
          </Reveal>
        )}
      </section>
    </PageBody>
  );
}

function ScopeTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50")}>
      {children}
    </Link>
  );
}
