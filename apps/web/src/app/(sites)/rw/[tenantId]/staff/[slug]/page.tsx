import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronRight, Clock } from "lucide-react";
import { HoverPreview } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Eyebrow, Prose, RevealHeading, Rise, SectionStyles } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { getStaffBySlug } from "@rentweb/module-booking/services";
import { BookingStyles, Portrait, lookOf, pad2, titleStep } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

/** 56 px thumbnails: ask Unsplash for 160 px, not the 800 px card image */
const thumb = (url: string) => (/images\.unsplash\.com/.test(url) ? url.replace(/([?&]w=)\d+/, "$1160") : url);

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const s = await tenantTx(tenantId, (tx) => getStaffBySlug(tx, tenantId, slug));
  return s ? { title: s.name, description: s.bio ?? s.title ?? undefined } : {};
}

/** /staff/[slug] – profile: sticky portrait, giant name, bio, and the services this person performs as an editorial index. */
export default async function StaffProfilePage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const person = await tenantTx(tenantId, (tx) => getStaffBySlug(tx, tenantId, slug));
  if (!person || !person.active) notFound();
  const services = person.services.filter((s) => s.active);
  const look = lookOf(runtime.config);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <SectionStyles />
      <BookingStyles />
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-32">
        <nav aria-label="breadcrumb" className="mb-6 flex items-center text-sm text-muted-foreground md:mb-10">
          <Link href="/staff" className="inline-flex h-11 items-center hover:text-foreground">
            {L.staff}
          </Link>
          <ChevronRight aria-hidden className="mx-1 size-3.5" />
          <span className="truncate text-foreground">{person.name}</span>
        </nav>
        <div className="grid gap-10 md:grid-cols-12 md:gap-14">
          <div className="md:col-span-5">
            <div className="group mx-auto max-w-[24rem] md:sticky md:top-[calc(var(--header-h,72px)+2rem)] md:max-w-none">
              <Portrait src={person.avatar} alt={person.name} name={person.name} color={person.color} look={look} aspect={look === "studio" ? "aspect-[3/4.4]" : "aspect-[4/5]"} priority />
            </div>
          </div>
          <div className="md:col-span-7 md:pt-6">
            {person.title && <Eyebrow text={person.title} className="mb-5" />}
            <RevealHeading as="h1" text={person.name} trigger="mount" mode="words" className={cn("font-heading font-semibold text-balance", titleStep(person.name))} />
            {person.bio && <Prose text={person.bio} className="mt-6 max-w-2xl text-step-1 text-muted-foreground" />}
            {person.acceptsOnlineBooking ? (
              <div className="mt-9 flex flex-wrap gap-3">
                <CtaButton href={`/book?staff=${encodeURIComponent(person.slug)}`} label={L.bookWith(person.name)} size="xl" className="w-full sm:w-auto" />
              </div>
            ) : (
              <p className="bk-panel mt-8 p-4 text-sm text-muted-foreground">ขณะนี้ไม่เปิดรับจองออนไลน์ กรุณาติดต่อร้านโดยตรง</p>
            )}

            <Rise className="mt-16 flex items-end justify-between gap-4 md:mt-24">
              <h2 className="font-heading text-step-3 font-semibold">{L.staffServices}</h2>
              <span className="font-mono text-xs text-muted-foreground">({pad2(services.length)})</span>
            </Rise>
            {services.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">ยังไม่มีบริการที่เปิดให้จอง</p>
            ) : (
              <HoverPreview className="mt-6" width={260} ratio={0.8}>
                <ul className="border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]">
                  {services.map((s, i) => {
                    const price = s.priceOverride ?? s.price;
                    const duration = s.durationOverrideMin ?? s.durationMin;
                    return (
                      <li key={s.id} data-preview-src={s.image ?? undefined} className="bk-row group border-b border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]">
                        <Link href={`/book?service=${encodeURIComponent(s.slug)}&staff=${encodeURIComponent(person.slug)}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-5">
                          {s.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb(s.image)} alt="" loading="lazy" decoding="async" className={cn("size-14 object-cover", look === "spa" ? "bk-pebble" : look === "clinic" ? "bk-arch" : "rounded-[var(--radius-lg)]")} />
                          ) : (
                            <span className="w-7 font-mono text-xs text-muted-foreground">{pad2(i + 1)}</span>
                          )}
                          <span className="min-w-0">
                            <span className="bk-row-name block truncate font-heading text-lg font-semibold">{s.name}</span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="size-3" /> {L.minutes(duration)}
                              {s.categoryName && <span>· {s.categoryName}</span>}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 text-right">
                            <span>
                              <span className="block font-heading font-semibold tabular-nums">{price === 0 ? s.priceNote || L.free : thb(price)}</span>
                              <span className="block text-xs text-muted-foreground">{L.bookNow}</span>
                            </span>
                            <ArrowUpRight className="size-5 text-primary transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </HoverPreview>
            )}
          </div>
        </div>
      </section>
    </PageBody>
  );
}
