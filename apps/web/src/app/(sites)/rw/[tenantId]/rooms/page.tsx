import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BedDouble, CalendarDays, Clock } from "lucide-react";
import { HoverPreview } from "@rentweb/ui/motion";
import { CtaButton, PageIntro, Rise, pad2, sized } from "@rentweb/storefront";
import { fromPrices, listUnitTypes, rentalConfig, isValidYmd } from "@rentweb/module-rental/services";
import { L, Price, RentalStyles, RoomCard, RoomName, formatThaiRange } from "@rentweb/module-rental/ui";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "rental", "rooms", { title: L.roomsTitle }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ from?: string; to?: string; guests?: string }>;

/**
 * /rooms – every room type: page intro, a hover-preview index (rows → floating photo that follows the cursor), then
 * one large editorial block per room (clip-revealed photo + hover swap, amenity icons, from-price). The searched dates
 * (if any) are carried into each room page.
 */
export default async function RoomsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("rental")) return cmsFallback(runtime, "rooms");
  const config = rentalConfig(runtime.config.moduleConfig);
  const from = sp.from && isValidYmd(sp.from) ? sp.from : null;
  const to = from && sp.to && isValidYmd(sp.to) && sp.to > from ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.floor(Number(sp.guests)) : null;
  const query = from && to ? `?from=${from}&to=${to}${guests ? `&guests=${guests}` : ""}` : "";

  const { types, prices } = await tenantTx(tenantId, async (tx) => {
    const types = await listUnitTypes(tx, tenantId, { activeOnly: true });
    return { types, prices: await fromPrices(tx, tenantId, types) };
  });

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <RentalStyles />
      <div className="container-x">
        <PageIntro eyebrow={runtime.config.name} index={`${pad2(types.length)} / ROOMS`} title={L.roomsTitle} lead={`${types.length} ประเภทห้อง · ราคา “${L.from}” คือราคาต่อคืนต่ำสุดในช่วง 60 วันข้างหน้า`}>
          <div className="rw-fade mt-7 flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm">
              <Clock className="size-4 text-primary-ink" aria-hidden /> {L.checkInTime(config.checkInTime)}
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm">
              <Clock className="size-4 text-primary-ink" aria-hidden /> {L.checkOutTime(config.checkOutTime)}
            </span>
            {from && to ? (
              <Link href={`/stay${query}`} className="rw-press inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-primary hover:text-primary-foreground">
                <CalendarDays className="size-4" aria-hidden /> {formatThaiRange(from, to)} · {L.changeDates}
              </Link>
            ) : (
              <Link href="/stay" className="rw-press inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-primary hover:text-primary-foreground">
                <CalendarDays className="size-4" aria-hidden /> {L.search}
              </Link>
            )}
          </div>
        </PageIntro>
      </div>

      {types.length === 0 ? (
        <section className="container-x pb-24">
          <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface px-6 py-16 text-center">
            <BedDouble className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <p className="mt-4 font-heading text-step-2 font-semibold">{L.noRooms}</p>
            <div className="mt-6 flex justify-center">
              <CtaButton href="/contact" label="ติดต่อที่พัก" variant="outline" size="lg" />
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* index: big rows, the photo follows the cursor (fine pointers) */}
          <section className="container-x pb-6 md:pb-10" aria-label="สารบัญห้องพัก">
            <HoverPreview as="ul" width={360} ratio={1.5} className="border-t border-border">
              {types.map((t, i) => (
                <li key={t.id} className="border-b border-border">
                  <a
                    href={`#room-${t.slug}`}
                    data-preview-src={sized(t.gallery[0] ?? "", 720)}
                    data-cursor="view"
                    data-cursor-label="ดูห้อง"
                    className="rw-row rw-room-row group grid min-h-16 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-5 md:grid-cols-[4rem_minmax(0,1fr)_14rem_12rem_2rem] md:py-7"
                  >
                    <span className="rw-index rw-row-idx text-muted-foreground">{pad2(i + 1)}</span>
                    <RoomName name={t.name} className="rw-row-title font-heading text-step-3 leading-tight font-semibold" />
                    <span className="col-start-2 text-sm text-muted-foreground md:col-start-auto">
                      {L.maxGuests(t.maxGuests)}
                      {t.sizeSqm ? ` · ${L.sizeSqm(t.sizeSqm)}` : ""}
                    </span>
                    <span className="col-start-3 row-start-1 text-right text-sm md:col-start-auto md:row-start-auto">
                      <span className="hidden text-muted-foreground md:inline">{L.from} </span>
                      <Price amount={prices[t.id] ?? t.basePrice} className="text-lg text-primary-ink md:text-xl" />
                    </span>
                    <ArrowUpRight className="rw-row-arrow hidden size-5 md:block" aria-hidden />
                  </a>
                </li>
              ))}
            </HoverPreview>
          </section>

          <div className="container-x space-y-24 py-14 md:space-y-36 md:py-24">
            {types.map((t, i) => (
              <div key={t.id} id={`room-${t.slug}`} className="scroll-mt-[calc(var(--header-h,5rem)+2rem)]">
                <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} query={query} variant="editorial" index={i} total={types.length} flip={i % 2 === 1} priority={i === 0} />
              </div>
            ))}
          </div>

          <section className="container-x pb-20 md:pb-28">
            <Rise className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-foreground px-6 py-14 text-center text-background md:py-20">
              <p className="mono-label opacity-70">ยังเลือกไม่ได้?</p>
              <h2 className="mx-auto mt-4 max-w-3xl font-heading text-step-4 font-semibold text-balance">บอกวันเข้าพัก แล้วเราจะแสดงเฉพาะห้องที่ว่างพร้อมราคารวม</h2>
              <div className="mt-8 flex justify-center">
                <CtaButton href={from && to ? `/stay${query}` : "/stay"} label={L.search} />
              </div>
            </Rise>
          </section>
        </>
      )}
    </PageBody>
  );
}

