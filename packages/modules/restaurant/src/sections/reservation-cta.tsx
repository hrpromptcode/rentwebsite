import * as React from "react";
import Link from "next/link";
import { CalendarCheck, Phone } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { ImageReveal } from "@rentweb/ui/motion";
import { ScenePoster, ShaderBackdrop } from "@rentweb/ui/three";
import { Eyebrow, RevealHeading, Rise, Section, allow3d, hasAccentFont, sized, type StorefrontCtx } from "@rentweb/storefront";
import type { reservationCta } from "@rentweb/storefront/definitions";
import { bangkokParts, parseHours } from "../services/time";
import { listZones } from "../services/reservations";
import { ReservationMiniForm } from "../components/reservation-mini-form";
import { RestaurantStyles } from "../components/styles";
import { L } from "../labels";

type Props = z.output<typeof reservationCta.schema>;

/**
 * Split band: candle-lit photo (warm ember shader glowing over it, CSS poster when 3D is off) next to a calm surface
 * with the heading and the date / time / party mini form → /reserve?date&time&size.
 */
export async function ReservationCtaSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const settings = ctx.tenant.settings as { contact?: { hours?: Array<{ day?: string; time?: string }>; phone?: string } };
  const hours = parseHours(settings.contact?.hours);
  const now = new Date();
  const today = bangkokParts(now).ymd;
  const phone = settings.contact?.phone;
  const zones = await withTenant(getDb(), tenantId, (tx) => listZones(tx, tenantId)).catch(() => [] as Array<{ zone: string; tables: number; maxSeats: number }>);
  const use3d = allow3d(ctx, "auto");

  return (
    <Section id={id} type="reservation-cta" heavy={use3d} className="!py-0">
      <RestaurantStyles />
      <div className="grid lg:min-h-[44rem] lg:grid-cols-12">
        <div className="relative isolate min-h-[22rem] overflow-clip bg-neutral-950 text-white sm:min-h-[28rem] lg:col-span-6 lg:min-h-full">
          {p.image?.url ? (
            <div className="absolute inset-0">
              <ImageReveal src={sized(p.image.url, 1600)} alt={p.image.alt ?? ""} from="left" parallax={0.06} className="size-full" imgClassName="size-full object-cover" sizes="(min-width: 1024px) 58vw, 100vw" />
            </div>
          ) : (
            <ScenePoster variant="ember" />
          )}
          {/* candle-warm light breathing over the photo (screen blend: only adds warmth, never darkens) */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-75 mix-blend-screen">
            {use3d ? <ShaderBackdrop variant="ember" colors={["glow", "primary", "glow", "#000000"]} speed={0.6} intensity={0.9} pointer={false} grain={0} /> : <ScenePoster variant="ember" grain={0} />}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 p-6 md:p-10">
            {zones.length > 0 && (
              <ul className="grid gap-1.5">
                {zones.map((z, i) => (
                  <li key={z.zone} className="flex items-baseline gap-3 text-white/85">
                    <span className="rr-res-meta text-white/55">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-heading text-step-1 font-semibold text-white">{z.zone}</span>
                    <span className="text-sm">
                      {z.tables} โต๊ะ · สูงสุด {z.maxSeats} ที่นั่ง
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="rr-res-meta text-white/70">
              {hours.open} — {hours.close} · BKK
            </p>
          </div>
        </div>

        <div className="relative flex items-center bg-surface lg:col-span-6">
          <div className="w-full px-[var(--gutter)] py-14 md:py-20 lg:px-14 xl:px-16">
            <Eyebrow text={L.reserve} index="(R)" className="mb-5" />
            <RevealHeading text={p.heading} as="h2" accent={hasAccentFont(ctx)} className="font-heading text-[clamp(2.25rem,1.6rem+2.4vw,3.75rem)] font-semibold" />
            {p.body && (
              <Rise delay={0.12}>
                <p className="mt-5 max-w-xl text-step-0 leading-relaxed text-pretty text-muted-foreground">{p.body}</p>
              </Rise>
            )}
            <Rise delay={0.2}>
              <ReservationMiniForm hours={hours} today={today} nowIso={now.toISOString()} className="mt-9" />
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex min-h-11 items-center gap-1.5">
                  <CalendarCheck className="size-4 text-primary" aria-hidden />
                  เปิด {hours.open}–{hours.close} น.
                </span>
                {phone && (
                  <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-foreground underline-offset-4 hover:underline">
                    <Phone className="size-4 text-primary" aria-hidden /> {phone}
                  </a>
                )}
                <Link href="/reserve" className="inline-flex min-h-11 items-center font-medium text-primary-ink underline underline-offset-4 hover:no-underline">
                  ดูรอบทั้งหมด
                </Link>
              </div>
            </Rise>
          </div>
        </div>
      </div>
    </Section>
  );
}
