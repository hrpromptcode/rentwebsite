import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Home, Phone, Trees, Users, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { FloatingChatOptOut } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { bangkokParts, lastBookableDay, listZones, parseHours, restaurantConfigOf, restaurantPaymentNotice, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import { ReserveForm, RestaurantStyles } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { createReservationAction } from "./actions";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ date?: string; time?: string; size?: string; zone?: string }>;

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "restaurant", "reserve", { title: "จองโต๊ะ" }) : {};
}

/** /reserve – date, time slots, party stepper, zone, occasion, contact → /reservations/[number]?p= */
export default async function ReservePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("restaurant")) return cmsFallback(runtime, "reserve");
  const cfg = restaurantConfigOf(runtime.config);
  const settings = runtime.config.settings;
  const contact = (settings.contact as { hours?: Array<{ day?: string; time?: string }>; phone?: string } | undefined) ?? {};
  const hours = parseHours(contact.hours);
  const now = new Date();
  const today = bangkokParts(now).ymd;
  const zones = await tenantTx(tenantId, (tx) => listZones(tx, tenantId));
  const deposit = cfg.reservationDeposit;
  const methods = deposit > 0 ? restaurantPaymentOptions(settings, "reservation") : [];
  // ADMIN_B2-04: a deposit is required but no receiver is configured → say so (and offer the phone) instead of a form that cannot be sent
  const payNotice = deposit > 0 ? restaurantPaymentNotice(settings, "reservation") : null;
  const tel = contact.phone ? `tel:${contact.phone.replace(/[^0-9+]/g, "")}` : null;
  const action = createReservationAction.bind(null, tenantId);
  const size = sp.size ? Number.parseInt(sp.size, 10) : undefined;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <RestaurantStyles />
      <section className="container-x pt-8 pb-28 md:pt-12 md:pb-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7 xl:col-span-8">
            <header className="rr-fade">
              <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em] text-primary-ink">
                <CalendarCheck className="size-4" aria-hidden /> {L.reserve}
              </p>
              <h1 className="mt-2 font-heading text-step-4 leading-[1.25] font-semibold">{L.reserveTitle}</h1>
              <p className="mt-3 max-w-xl text-step-0 leading-relaxed text-muted-foreground">{L.reserveSubtitle}</p>
            </header>

            <div className="rr-fade-2 card mt-8 p-5 md:p-9">
              {payNotice ? (
                <div role="status" data-payment-notice className="flex flex-col items-center gap-4 py-8 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Wallet className="size-6" />
                  </span>
                  <p className="max-w-md text-base leading-relaxed font-medium">{payNotice}</p>
                  {tel && (
                    <Button asChild size="lg">
                      <a href={tel}>
                        <Phone className="size-4" /> โทรจอง {contact.phone}
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                /* modules_finish follow-up: on phones the floating LINE button covered the zone cards; hide it while the form is in view */
                <FloatingChatOptOut>
                  <ReserveForm
                    hours={hours}
                    zones={zones}
                    deposit={deposit}
                    methods={methods}
                    today={today}
                    maxDate={lastBookableDay(now, cfg.reservationMaxAdvanceDays)}
                    nowIso={now.toISOString()}
                    initial={{ date: sp.date, time: sp.time, size: Number.isFinite(size) ? size : undefined, zone: sp.zone }}
                    action={action}
                  />
                </FloatingChatOptOut>
              )}
            </div>
          </div>

          <aside className="rr-fade-3 lg:col-span-5 xl:col-span-4">
            <div className="grid gap-4 lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)]">
              <div className="rr-night relative isolate overflow-hidden rounded-[var(--radius-2xl)] p-6 md:p-7">
                <p className="rr-dim text-sm font-semibold tracking-[0.02em]">{runtime.config.name}</p>
                <h2 className="mt-3 font-heading text-2xl font-semibold">ข้อมูลการจอง</h2>
                <ul className="mt-5 grid gap-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Clock className="mt-0.5 size-4 shrink-0 opacity-80" />
                    <span>
                      เปิด {hours.open}–{hours.close} น. · รอบละ {cfg.reservationMinutes} นาที
                    </span>
                  </li>
                  {zones.map((z) => {
                    const Icon = z.zone === "สวน" ? Trees : Home;
                    return (
                      <li key={z.zone} className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-4 shrink-0 opacity-80" />
                        <span>
                          {L.zone} {z.zone}: {z.tables} โต๊ะ · สูงสุด {z.maxSeats} ที่/โต๊ะ
                        </span>
                      </li>
                    );
                  })}
                  <li className="flex items-start gap-3">
                    <Users className="mt-0.5 size-4 shrink-0 opacity-80" />
                    <span>กลุ่ม 12 ท่านขึ้นไป แนะนำโทรจองล่วงหน้า 2 วัน</span>
                  </li>
                  {deposit > 0 && (
                    <li className="flex items-start gap-3">
                      <CalendarCheck className="mt-0.5 size-4 shrink-0 opacity-80" />
                      <span>
                        {L.deposit} {thb(deposit)} หักจากบิลในวันที่มา
                      </span>
                    </li>
                  )}
                </ul>
              </div>
              {contact.phone && (
                <a href={tel ?? undefined} className="card group flex min-h-16 items-center gap-4 p-4 transition-colors hover:border-primary/40">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-105">
                    <Phone className="size-4" />
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground">โทรจอง</span>
                    <span className="font-medium">{contact.phone}</span>
                  </span>
                </a>
              )}
            </div>
          </aside>
        </div>
      </section>
    </PageBody>
  );
}
