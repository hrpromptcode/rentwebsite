import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BedDouble, CalendarSearch, SearchX } from "lucide-react";
import { Img, PageIntro, StaggerCell, StaggerList, pad2, sized } from "@rentweb/storefront";
import { isValidYmd, rentalConfig, searchStays, type SearchResult } from "@rentweb/module-rental/services";
import { AmenityChips, L, Price, PriceFrom, RentalStyles, RoomSpecs, StaySearchBar, formatThaiRange, searchDates } from "@rentweb/module-rental/ui";
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

/**
 * /stay?from&to&guests – availability search (operational route: calm, no 3D / pinning). Compact intro, the glass
 * search bar (calendar drops down), then every available type with its full quote, and the ones that cannot take the
 * request with the reason.
 */
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
      <RentalStyles />
      <section className="container-x pb-16 md:pb-24">
        <PageIntro compact eyebrow={runtime.config.name} title={L.stayTitle} lead={from && to ? L.resultsFor(formatThaiRange(from, to), guests) : "เลือกวันเช็กอิน เช็กเอาต์ และจำนวนผู้เข้าพัก เพื่อดูห้องว่างและราคารวม"} className="pb-6 md:pb-8" />
        <div className="relative z-20 -mt-2">
          <StaySearchBar ctx={ctx} initial={{ from, to, guests }} />
        </div>

        {results && (
          <div className="mt-12" aria-live="polite">
            {available.length === 0 ? (
              <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface px-6 py-14 text-center md:py-20">
                <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
                  <SearchX className="size-7" aria-hidden />
                </span>
                <p className="mx-auto mt-5 max-w-xl font-heading text-step-2 font-semibold text-balance">{L.noResults}</p>
                {others.length > 0 && (
                  <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2 text-sm">
                    {others.map((o) => (
                      <li key={o.type.id} className="rounded-full border border-border bg-background px-3.5 py-1.5 text-muted-foreground">
                        {o.type.name}: {o.error ? (L.errors[o.error] ?? o.error) : L.unavailable}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/rooms" className="rw-press mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-primary hover:text-primary-foreground">
                  <BedDouble className="size-4" aria-hidden /> {L.allRooms}
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
                  <p className="font-heading text-step-2 font-semibold">
                    ว่าง <span className="rw-price-num text-primary-ink">{available.length}</span> ประเภทห้อง
                  </p>
                  <p className="mono-label text-muted-foreground">
                    {L.nights(available[0]!.quote!.nights)} · {L.guestsN(guests)}
                  </p>
                </div>
                <StaggerList className="grid gap-5" stagger={0.08}>
                  {available.map((r, i) => (
                    <StaggerCell key={r.type.id}>
                      <ResultCard r={r} query={query} index={i} priority={i < 2} />
                    </StaggerCell>
                  ))}
                </StaggerList>
                {others.length > 0 && (
                  <div className="mt-14">
                    <h2 className="font-heading text-step-1 font-semibold text-muted-foreground">ไม่ว่าง / ไม่ตรงเงื่อนไขสำหรับวันที่เลือก</h2>
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {others.map((o) => (
                        <li key={o.type.id} className="flex items-center gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-3">
                          <Img src={sized(o.type.gallery[0] ?? "", 240)} alt="" className="size-16 shrink-0 rounded-[var(--radius-md)] object-cover grayscale" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{o.type.name}</p>
                            <p className="text-xs text-destructive">{o.error ? (L.errors[o.error] ?? o.error) : L.unavailable}</p>
                          </div>
                          <Link href={`/rooms/${encodeURIComponent(o.type.slug)}`} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary-ink hover:underline">
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
          <div className="mt-12 grid gap-6 rounded-[var(--radius-2xl)] border border-dashed border-border px-6 py-12 text-center md:py-16">
            <CalendarSearch className="mx-auto size-10 text-primary-ink" aria-hidden />
            <p className="mx-auto max-w-lg text-muted-foreground">{L.selectDatesHint} แล้วกดค้นหา เราจะแสดงเฉพาะห้องที่ว่างพร้อมราคารวมทุกคืน</p>
            <Link href="/rooms" className="rw-press mx-auto inline-flex min-h-12 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold hover:border-foreground">
              <BedDouble className="size-4" aria-hidden /> {L.allRooms}
            </Link>
          </div>
        )}
      </section>
    </PageBody>
  );
}

function ResultCard({ r, query, index, priority }: { r: SearchResult; query: string; index: number; priority?: boolean }) {
  const q = r.quote!;
  const href = `/rooms/${encodeURIComponent(r.type.slug)}${query}`;
  return (
    <article className="rw-room-card group grid overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-testid="stay-result">
      <Link href={href} className="rw-room-media relative block aspect-[16/10] md:aspect-auto md:min-h-[18rem]" aria-label={r.type.name} tabIndex={-1}>
        <span className="rw-swap-a absolute inset-0">
          <Img src={sized(r.type.gallery[0] ?? "", 900)} alt={r.type.name} priority={priority} />
        </span>
        {r.type.gallery[1] ? (
          <span className="rw-swap-b">
            <Img src={sized(r.type.gallery[1], 900)} alt="" />
          </span>
        ) : null}
        {r.remaining <= 2 && (
          <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-background/95 px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> {L.lastUnits(r.remaining)}
          </span>
        )}
      </Link>
      <div className="flex flex-col p-5 md:p-7">
        <p className="rw-index text-muted-foreground">{pad2(index + 1)}</p>
        <h2 className="mt-2 font-heading text-step-3 leading-tight font-semibold">
          <Link href={href} className="rw-link-line hover:text-primary-ink">
            {r.type.name}
          </Link>
        </h2>
        <RoomSpecs type={r.type} className="mt-3" />
        <AmenityChips items={r.type.amenities} limit={4} icons className="mt-4" />
        {q.appliedRules.length > 0 && <p className="mt-4 text-xs text-muted-foreground">ราคานี้รวม: {q.appliedRules.join(" · ")}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5 md:mt-6">
          <div>
            <p className="text-xs text-muted-foreground">
              รวม {L.nights(q.nights)} · {L.guestsN(q.guests)}
              {q.extraGuestTotal > 0 ? ` (รวมผู้เข้าพักเพิ่ม)` : ""}
            </p>
            <p className="mt-1 text-step-4 leading-none text-primary-ink" data-testid="result-total">
              <Price amount={q.total} />
            </p>
            <PriceFrom price={r.fromPrice} size="sm" className="mt-2 opacity-80" />
          </div>
          <Link href={href} data-testid="result-select" className="rw-press group/sel inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-14px_var(--primary)] hover:bg-primary/90">
            {L.bookNow} <ArrowRight className="size-4 transition-transform duration-300 group-hover/sel:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
