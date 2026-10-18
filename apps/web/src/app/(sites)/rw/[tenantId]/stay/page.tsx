import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BedDouble, SearchX } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { staySearch } from "@rentweb/storefront/definitions";
import { thb } from "@rentweb/core/money";
import { isValidYmd, rentalConfig, searchStays, type SearchResult } from "@rentweb/module-rental/services";
import { AmenityChips, L, PriceFrom, RoomSpecs, StaySearchSection, formatThaiRange, searchDates } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "rental", "stay", { title: L.stayTitle, robots: { index: false } }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ from?: string; to?: string; guests?: string }>;

/** /stay?from&to&guests – availability search results for a date range (every type, with its quote or the reason it cannot take the request). */
export default async function StayPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("rental")) return cmsFallback(runtime, "stay");
  const ctx = await buildCtx(runtime);
  const config = rentalConfig(runtime.config.moduleConfig);
  const { today } = searchDates(config);
  const from = sp.from && isValidYmd(sp.from) && sp.from >= today ? sp.from : null;
  const to = from && sp.to && isValidYmd(sp.to) && sp.to > from ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.min(50, Math.floor(Number(sp.guests))) : 2;
  const results = from && to ? await tenantTx(tenantId, (tx) => searchStays(tx, tenantId, { checkIn: from, checkOut: to, guests, config })) : null;
  const available = (results ?? []).filter((r) => r.quote && r.remaining > 0);
  const others = (results ?? []).filter((r) => !(r.quote && r.remaining > 0));
  const query = from && to ? `?from=${from}&to=${to}&guests=${guests}` : "";

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{L.stayTitle}</h1>
          <p className="mt-4 text-muted-foreground">{from && to ? L.resultsFor(formatThaiRange(from, to), guests) : "เลือกวันเช็กอิน เช็กเอาต์ และจำนวนผู้เข้าพัก เพื่อดูห้องว่างและราคารวม"}</p>
        </Reveal>
        <Reveal delay={0.05} className="card mt-6 p-4 md:p-5">
          <StaySearchSection ctx={ctx} props={staySearch.schema.parse({})} id="stay-search" index={1} initial={{ from, to, guests }} bare />
        </Reveal>

        {results && (
          <div className="mt-10" aria-live="polite">
            {available.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 p-10 text-center">
                <SearchX className="size-10 text-muted-foreground" />
                <p className="font-heading text-xl font-semibold">{L.noResults}</p>
                <p className="text-sm text-muted-foreground">{others.length ? others.map((o) => `${o.type.name}: ${o.error ? (L.errors[o.error] ?? o.error) : L.unavailable}`).join(" · ") : null}</p>
                <Button asChild size="lg" variant="outline">
                  <Link href="/rooms">{L.allRooms}</Link>
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  ว่าง {available.length} ประเภทห้อง · {L.nights(available[0]!.quote!.nights)} · {L.guestsN(guests)}
                </p>
                <Stagger className="grid gap-5">
                  {available.map((r) => (
                    <StaggerItem key={r.type.id}>
                      <ResultCard r={r} query={query} />
                    </StaggerItem>
                  ))}
                </Stagger>
                {others.length > 0 && (
                  <div className="mt-10">
                    <h2 className="font-heading text-lg font-semibold text-muted-foreground">ไม่ว่าง / ไม่ตรงเงื่อนไขสำหรับวันที่เลือก</h2>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {others.map((o) => (
                        <li key={o.type.id} className="card flex items-center gap-3 p-3 opacity-80">
                          <Img src={o.type.gallery[0] ?? ""} alt="" className="size-16 shrink-0 rounded-[var(--radius-md)] object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{o.type.name}</p>
                            <p className="text-xs text-destructive">{o.error ? (L.errors[o.error] ?? o.error) : L.unavailable}</p>
                          </div>
                          <Link href={`/rooms/${encodeURIComponent(o.type.slug)}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
                            {L.viewRoom}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!results && (
          <div className="mt-10 text-center">
            <Button asChild size="lg" variant="outline">
              <Link href="/rooms">
                <BedDouble className="size-4" /> {L.allRooms}
              </Link>
            </Button>
          </div>
        )}
      </section>
    </PageBody>
  );
}

function ResultCard({ r, query }: { r: SearchResult; query: string }) {
  const q = r.quote!;
  const href = `/rooms/${encodeURIComponent(r.type.slug)}${query}`;
  return (
    <article className="card grid gap-0 overflow-hidden p-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-testid="stay-result">
      <Link href={href} className="relative block aspect-[4/3] md:aspect-auto md:h-full" aria-label={r.type.name}>
        <Img src={r.type.gallery[0] ?? ""} alt={r.type.name} className="size-full object-cover" />
        {r.remaining <= 2 && <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">{L.lastUnits(r.remaining)}</span>}
      </Link>
      <div className="flex flex-col p-5 md:p-6">
        <h2 className="font-heading text-2xl font-semibold">
          <Link href={href} className="hover:text-primary">
            {r.type.name}
          </Link>
        </h2>
        <RoomSpecs type={r.type} className="mt-2" />
        <AmenityChips items={r.type.amenities} limit={4} className="mt-3" />
        {q.appliedRules.length > 0 && <p className="mt-3 text-xs text-muted-foreground">ราคานี้รวม: {q.appliedRules.join(" · ")}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
          <div>
            <p className="text-xs text-muted-foreground">
              {L.nights(q.nights)} · {L.guestsN(q.guests)}
              {q.extraGuestTotal > 0 ? ` (รวมผู้เข้าพักเพิ่ม)` : ""}
            </p>
            <p className="font-heading text-3xl font-semibold tabular-nums text-primary" data-testid="result-total">
              {thb(q.total)}
            </p>
            <PriceFrom price={r.fromPrice} size="sm" className="mt-0.5 opacity-80" />
          </div>
          <Button asChild size="lg">
            <Link href={href} data-testid="result-select">
              {L.bookNow} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
