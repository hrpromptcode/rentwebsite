import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, Clock, Maximize2, Moon, Phone, ShieldCheck, Users } from "lucide-react";
import { ParallaxMedia } from "@rentweb/ui/motion";
import { CtaButton, Eyebrow, Img, Rise, SectionStyles, StaggerCell, StaggerList, pad2, sized } from "@rentweb/storefront";
import { fromPrices, getUnitTypeBySlug, isValidYmd, listExtras, listUnitTypes, parseExtrasParam, payOptionsFor, rentalConfig } from "@rentweb/module-rental/services";
import { L, PriceFrom, RentalStyles, RoomCard, RoomName, amenityIcon, searchDates } from "@rentweb/module-rental/ui";
import { Filmstrip, StayWidget } from "@rentweb/module-rental/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";

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

/**
 * /rooms/[slug]?from&to&guests&extras – panoramic parallax hero (the H1 over the photo), the room story + spec tiles +
 * amenity icons beside a sticky quote box (availability / price calendar, guests, add-ons, live quote → /stay/book),
 * a draggable panoramic filmstrip of the gallery and the other room types.
 */
export default async function RoomPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, slug } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) notFound();
  const config = rentalConfig(runtime.config.moduleConfig);
  const data = await tenantTx(tenantId, async (tx) => {
    const type = await getUnitTypeBySlug(tx, tenantId, decodeSlug(slug));
    if (!type || !type.active) return null;
    const [extras, all] = await Promise.all([listExtras(tx, tenantId, { activeOnly: true }), listUnitTypes(tx, tenantId, { activeOnly: true })]);
    const others = all.filter((t) => t.id !== type.id).slice(0, 3);
    const prices = await fromPrices(tx, tenantId, [type, ...others]);
    return { type, extras, others, prices, position: all.findIndex((t) => t.id === type.id), count: all.length };
  });
  if (!data) notFound();
  const { type, extras, others, prices, position, count } = data;
  const fromPrice = prices[type.id] ?? type.basePrice;
  const { today, maxDate } = searchDates(config);
  const from = sp.from && isValidYmd(sp.from) && sp.from >= today ? sp.from : null;
  const to = from && sp.to && isValidYmd(sp.to) && sp.to > from ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.min(Math.floor(Number(sp.guests)), type.maxGuests) : null;
  const initialExtras = parseExtrasParam(sp.extras ?? null).filter((e) => extras.some((x) => x.id === e.id));
  const contact = (runtime.config.settings.contact as { phone?: string } | undefined) ?? {};
  const theme = runtime.theme;
  const overlayHeader = theme.layout.header === "floating" || (theme.layout.headerTransparent && theme.layout.headerSticky);
  const query = from && to ? `?from=${from}&to=${to}&guests=${guests ?? 2}` : "";
  const backHref = from && to ? `/stay${query}` : "/rooms";
  const [lead, ...paras] = (type.description ?? "").split(/\n{2,}/).filter((s) => s.trim());
  const tiles: Array<{ icon: typeof Users; label: string; value: string }> = [
    { icon: Users, label: "ผู้เข้าพัก", value: L.maxGuests(type.maxGuests) },
    ...(type.sizeSqm ? [{ icon: Maximize2, label: "ขนาดห้อง", value: L.sizeSqm(type.sizeSqm) }] : []),
    ...(type.beds ? [{ icon: BedDouble, label: "เตียง", value: type.beds }] : []),
    ...(type.minNights > 1 ? [{ icon: Moon, label: "การเข้าพัก", value: L.minNights(type.minNights) }] : []),
  ];

  return (
    <div>
      <RentalStyles />
      <SectionStyles />

      {/* panoramic hero: the photo parallaxes under the title; the transparent header turns light over it */}
      <section data-hero-dark={overlayHeader ? "" : undefined} className="relative isolate overflow-clip text-white">
        <div className="relative h-[72svh] min-h-[30rem] md:h-[86svh] md:min-h-[36rem]">
          <ParallaxMedia speed={-0.18} scale={1.14} className="absolute inset-0" innerClassName="h-full">
            <Img src={sized(type.gallery[0] ?? "", 2000)} alt={type.name} priority className="rw-hero-photo-img h-full w-full object-cover" />
          </ParallaxMedia>
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(12_9_5/.66)_0%,rgb(12_9_5/.38)_14%,transparent_32%,transparent_45%,rgb(12_9_5/.78)_100%)]" />
          <div className="container-x absolute inset-x-0 bottom-0 pb-8 md:pb-14">
            <Link href={backHref} className="rw-press mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-black/25 px-4 text-sm text-white backdrop-blur-md transition-colors hover:bg-white hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden /> {from && to ? L.stayTitle : L.allRooms}
            </Link>
            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-8">
                <p className="mb-4 flex items-center gap-3 text-sm text-white/80">
                  <span className="rw-index">{`${pad2(position + 1)} / ${pad2(count)}`}</span>
                  <span aria-hidden className="h-px w-8 bg-white/50" />
                  <span>{runtime.config.name}</span>
                </p>
                <RoomName as="h1" name={type.name} reveal delay={0.2} className="font-heading text-step-5 leading-[1.22] font-semibold text-balance text-white [text-shadow:0_2px_24px_rgb(0_0_0/.25)]" />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-4 lg:flex-col lg:items-end">
                <PriceFrom price={fromPrice} size="lg" tone="inverse" />
                <p className="flex items-center gap-2 text-sm text-white/80">
                  <Clock className="size-4" aria-hidden /> {config.checkInTime} – {config.checkOutTime} น.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x grid gap-x-14 gap-y-10 py-12 md:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* A: story + spec tiles */}
        <div className="min-w-0">
          <Eyebrow text="รายละเอียดห้อง" className="mb-5" />
          {lead && <p className="font-heading text-step-2 leading-relaxed text-pretty">{lead}</p>}
          <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-xl)] border border-border bg-border sm:grid-cols-4">
            {tiles.map((t) => (
              <li key={t.label} className="flex flex-col gap-2 bg-card p-4">
                <t.icon className="size-5 text-primary-ink" aria-hidden />
                <span className="text-xs text-muted-foreground">{t.label}</span>
                <span className="text-sm font-semibold leading-snug">{t.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* W: sticky quote box (after the specs on phones, beside everything on desktop) */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-[calc(var(--header-h,5rem)+1rem)]">
            <StayWidget
              type={{ id: type.id, slug: type.slug, name: type.name, maxGuests: type.maxGuests, minNights: type.minNights, baseGuests: type.baseGuests, extraGuestPrice: type.extraGuestPrice }}
              extras={extras.map((e) => ({ id: e.id, name: e.name, description: e.description, price: e.price, pricing: e.pricing }))}
              config={{ depositPercent: config.depositPercent, freeCancelDays: config.freeCancelDays, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime, payOptions: payOptionsFor(config) }}
              today={today}
              maxDate={maxDate}
              fromPrice={fromPrice}
              initial={{ from, to, guests, extras: initialExtras }}
            />
          </div>
        </div>

        {/* B: the rest of the story, amenities, policy */}
        <div className="min-w-0">
          {paras.length > 0 && (
            <div className="max-w-2xl space-y-4 text-step-0 leading-[1.8] text-foreground/85">
              {paras.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          {type.amenities.length > 0 && (
            <div className="mt-2">
              <h2 className="font-heading text-step-3 font-semibold">{L.amenities}</h2>
              <StaggerList className="mt-6 grid gap-x-8 gap-y-1 sm:grid-cols-2" stagger={0.04}>
                {type.amenities.map((a) => {
                  const I = amenityIcon(a);
                  return (
                    <StaggerCell key={a} className="flex items-center gap-3 border-b border-border py-3.5 text-sm">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                        <I className="size-4" aria-hidden />
                      </span>
                      {a}
                    </StaggerCell>
                  );
                })}
              </StaggerList>
            </div>
          )}

          <Rise className="mt-10 flex items-start gap-4 rounded-[var(--radius-xl)] border border-border bg-surface p-5 md:p-6">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary-ink" aria-hidden />
            <div className="text-sm leading-relaxed">
              <p className="font-heading text-base font-semibold">{L.policyTitle}</p>
              <p className="mt-1 text-muted-foreground">{L.policy(config.freeCancelDays, config.depositPercent)}</p>
              {payOptionsFor(config).length > 0 && <p className="mt-1 text-muted-foreground">{config.depositPercent >= 100 ? "ชำระเต็มจำนวนเพื่อยืนยันการจอง" : `ชำระมัดจำ ${config.depositPercent}% เพื่อยืนยัน ส่วนที่เหลือชำระที่ที่พัก`}</p>}
              <p className="mt-1 text-muted-foreground">
                {L.checkInTime(config.checkInTime)} · {L.checkOutTime(config.checkOutTime)}
              </p>
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-primary-ink hover:underline">
                  <Phone className="size-4" aria-hidden /> {L.callProperty} {contact.phone}
                </a>
              )}
            </div>
          </Rise>
        </div>
      </section>

      {type.gallery.length > 1 && (
        <section className="overflow-x-clip pb-16 md:pb-24" aria-label={`ภาพ ${type.name}`}>
          <div className="container-x mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow text="แกลเลอรี" index={pad2(type.gallery.length)} className="mb-3" />
              <h2 className="font-heading text-step-3 font-semibold">มองไปรอบ ๆ ห้อง</h2>
            </div>
            <p className="mono-label text-muted-foreground">ลากหรือปัดเพื่อดูภาพ</p>
          </div>
          <Filmstrip label={`ภาพห้อง ${type.name}`}>
            {type.gallery.map((url, i) => (
              <figure key={url + i} className="rw-film-item">
                <div className="rw-pano-img" data-pano="">
                  <Img src={sized(url, 1600)} alt={`${type.name} ${i + 1}`} draggable={false} />
                </div>
                <figcaption className="rw-index absolute bottom-4 left-4 z-[2] rounded-full bg-black/35 px-2.5 py-1 text-white backdrop-blur">{`${pad2(i + 1)} / ${pad2(type.gallery.length)}`}</figcaption>
              </figure>
            ))}
          </Filmstrip>
        </section>
      )}

      {others.length > 0 && (
        <section className="border-t border-border bg-surface py-16 md:py-24">
          <div className="container-x">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow text="ห้องพักอื่น" className="mb-3" />
                <h2 className="font-heading text-step-4 font-semibold">ยังมีอีกหลายมุมให้เลือก</h2>
              </div>
              <CtaButton href={`/rooms${query}`} label={L.allRooms} variant="outline" size="lg" />
            </div>
            <StaggerList className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
              {others.map((t) => (
                <StaggerCell key={t.id} className="h-full">
                  <RoomCard type={t} fromPrice={prices[t.id] ?? t.basePrice} query={query} />
                </StaggerCell>
              ))}
            </StaggerList>
          </div>
        </section>
      )}
    </div>
  );
}
