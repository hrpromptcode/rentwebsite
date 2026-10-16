import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Home, Phone, Trees, Users } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { bangkokParts, lastBookableDay, listZones, parseHours, restaurantConfigOf, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import { ReserveForm } from "@rentweb/module-restaurant/components";
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
  const action = createReservationAction.bind(null, tenantId);
  const size = sp.size ? Number.parseInt(sp.size, 10) : undefined;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-28 md:pt-10 md:pb-24">
        <Reveal>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            <CalendarCheck className="size-3.5" /> {L.reserve}
          </p>
          <h1 className="font-heading mt-1 text-4xl font-semibold md:text-6xl">{L.reserveTitle}</h1>
          <p className="mt-3 max-w-xl text-muted-foreground md:text-lg">{L.reserveSubtitle}</p>
        </Reveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <Reveal delay={0.1} className="card p-5 md:p-8">
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
          </Reveal>

          <Reveal delay={0.2} className="grid content-start gap-4">
            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold">ข้อมูลการจอง</h2>
              <ul className="mt-3 grid gap-3 text-sm">
                <li className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    เปิด {hours.open}–{hours.close} น. · รอบละ {cfg.reservationMinutes} นาที
                  </span>
                </li>
                {zones.map((z) => {
                  const Icon = z.zone === "สวน" ? Trees : Home;
                  return (
                    <li key={z.zone} className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>
                        {L.zone} {z.zone}: {z.tables} โต๊ะ · สูงสุด {z.maxSeats} ที่/โต๊ะ
                      </span>
                    </li>
                  );
                })}
                <li className="flex items-start gap-2.5">
                  <Users className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>กลุ่ม 12 ท่านขึ้นไป แนะนำโทรจองล่วงหน้า 2 วัน</span>
                </li>
                {deposit > 0 && (
                  <li className="flex items-start gap-2.5">
                    <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      {L.deposit} {thb(deposit)} หักจากบิลในวันที่มา
                    </span>
                  </li>
                )}
              </ul>
            </div>
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className="card flex min-h-14 items-center gap-3 p-4 transition hover:bg-muted">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Phone className="size-4" />
                </span>
                <span>
                  <span className="block text-xs text-muted-foreground">โทรจอง</span>
                  <span className="font-medium">{contact.phone}</span>
                </span>
              </a>
            )}
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}
