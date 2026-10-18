import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Check, ChevronLeft, Clock, Maximize2, Moon, ShieldCheck, Users } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { fromPrices, getUnitTypeBySlug, isValidYmd, listExtras, parseExtrasParam, payOptionsFor, rentalConfig } from "@rentweb/module-rental/services";
import { L, PriceFrom, searchDates } from "@rentweb/module-rental/ui";
import { StayWidget } from "@rentweb/module-rental/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;
type Search = Promise<{ from?: string; to?: string; guests?: string; extras?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) return {};
  const type = await tenantTx(tenantId, (tx) => getUnitTypeBySlug(tx, tenantId, decodeSlug(slug)));
  if (!type) return {};
  return { title: type.name, description: type.description?.slice(0, 160) ?? undefined, openGraph: type.gallery[0] ? { images: [{ url: type.gallery[0] }] } : undefined };
}

/** /rooms/[slug]?from&to&guests&extras – gallery, details, amenities and the availability / price calendar + booking widget. */
export default async function RoomPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, slug } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) notFound();
  const config = rentalConfig(runtime.config.moduleConfig);
  const data = await tenantTx(tenantId, async (tx) => {
    const type = await getUnitTypeBySlug(tx, tenantId, decodeSlug(slug));
    if (!type || !type.active) return null;
    const [extras, prices] = await Promise.all([listExtras(tx, tenantId, { activeOnly: true }), fromPrices(tx, tenantId, [type])]);
    return { type, extras, fromPrice: prices[type.id] ?? type.basePrice };
  });
  if (!data) notFound();
  const { type, extras, fromPrice } = data;
  const { today, maxDate } = searchDates(config);
  const from = sp.from && isValidYmd(sp.from) && sp.from >= today ? sp.from : null;
  const to = from && sp.to && isValidYmd(sp.to) && sp.to > from ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.min(Math.floor(Number(sp.guests)), type.maxGuests) : null;
  const initialExtras = parseExtrasParam(sp.extras ?? null).filter((e) => extras.some((x) => x.id === e.id));
  const [cover, ...rest] = type.gallery;
  const contact = (runtime.config.settings.contact as { phone?: string } | undefined) ?? {};

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
        <Link href={from && to ? `/stay?from=${from}&to=${to}&guests=${guests ?? 2}` : "/rooms"} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="size-4" /> {from && to ? L.stayTitle : L.allRooms}
        </Link>

        {/* gallery: cover + up to four thumbnails, full-bleed feel inside the container */}
        <Reveal className="mt-4 grid gap-2 md:grid-cols-4 md:grid-rows-2">
          <div className="relative overflow-hidden rounded-[var(--radius-2xl)] md:col-span-2 md:row-span-2">
            <Img src={cover ?? ""} alt={type.name} className="aspect-[4/3] size-full object-cover md:aspect-auto md:h-full" priority />
          </div>
          {rest.slice(0, 4).map((url, i) => (
            <div key={url + i} className={i >= 2 ? "hidden overflow-hidden rounded-[var(--radius-xl)] md:block" : "overflow-hidden rounded-[var(--radius-xl)]"}>
              <Img src={url} alt={`${type.name} ${i + 2}`} className="aspect-[4/3] size-full object-cover" />
            </div>
          ))}
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
          <div className="min-w-0">
            <Reveal>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
              <h1 className="heading-display mt-2 text-4xl font-semibold md:text-5xl">{type.name}</h1>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <li className="inline-flex items-center gap-1.5">
                  <Users className="size-4 text-primary" aria-hidden /> {L.maxGuests(type.maxGuests)}
                </li>
                {type.beds && (
                  <li className="inline-flex items-center gap-1.5">
                    <BedDouble className="size-4 text-primary" aria-hidden /> {type.beds}
                  </li>
                )}
                {type.sizeSqm ? (
                  <li className="inline-flex items-center gap-1.5">
                    <Maximize2 className="size-4 text-primary" aria-hidden /> {L.sizeSqm(type.sizeSqm)}
                  </li>
                ) : null}
                {type.minNights > 1 && (
                  <li className="inline-flex items-center gap-1.5">
                    <Moon className="size-4 text-primary" aria-hidden /> {L.minNights(type.minNights)}
                  </li>
                )}
                <li className="inline-flex items-center gap-1.5">
                  <Clock className="size-4 text-primary" aria-hidden /> {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
                </li>
              </ul>
              <PriceFrom price={fromPrice} size="lg" className="mt-5" />
            </Reveal>

            {type.description && (
              <Reveal delay={0.05} className="prose-storefront mt-8 max-w-none text-base leading-relaxed text-foreground/90">
                {type.description.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="mt-4 first:mt-0">
                    {p}
                  </p>
                ))}
              </Reveal>
            )}

            {type.amenities.length > 0 && (
              <Reveal delay={0.1} className="mt-10">
                <h2 className="font-heading text-2xl font-semibold">{L.amenities}</h2>
                <Stagger className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2" stagger={0.03}>
                  {type.amenities.map((a) => (
                    <StaggerItem key={a} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <Check className="size-3" aria-hidden />
                      </span>
                      {a}
                    </StaggerItem>
                  ))}
                </Stagger>
              </Reveal>
            )}

            <Reveal delay={0.15} className="card mt-10 flex items-start gap-3 p-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div className="text-sm">
                <p className="font-medium">{L.policyTitle}</p>
                <p className="mt-1 text-muted-foreground">{L.policy(config.freeCancelDays, config.depositPercent)}</p>
                {payOptionsFor(config).length > 0 && <p className="mt-1 text-muted-foreground">{config.depositPercent >= 100 ? "ชำระเต็มจำนวนเพื่อยืนยันการจอง" : `ชำระมัดจำ ${config.depositPercent}% เพื่อยืนยัน ส่วนที่เหลือชำระที่ที่พัก`}</p>}
                {contact.phone && (
                  <p className="mt-2">
                    <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center text-primary hover:underline">
                      {L.callProperty} {contact.phone}
                    </a>
                  </p>
                )}
              </div>
            </Reveal>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <Reveal delay={0.1}>
              <StayWidget
                type={{ id: type.id, slug: type.slug, name: type.name, maxGuests: type.maxGuests, minNights: type.minNights, baseGuests: type.baseGuests, extraGuestPrice: type.extraGuestPrice }}
                extras={extras.map((e) => ({ id: e.id, name: e.name, description: e.description, price: e.price, pricing: e.pricing }))}
                config={{ depositPercent: config.depositPercent, freeCancelDays: config.freeCancelDays, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime, payOptions: payOptionsFor(config) }}
                today={today}
                maxDate={maxDate}
                initial={{ from, to, guests, extras: initialExtras }}
              />
            </Reveal>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
