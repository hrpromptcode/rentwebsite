import * as React from "react";
import Link from "next/link";
import { CalendarCheck, Phone } from "lucide-react";
import type { z } from "zod";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { Img, Section, type StorefrontCtx } from "@rentweb/storefront";
import type { reservationCta } from "@rentweb/storefront/definitions";
import { bangkokParts, parseHours } from "../services/time";
import { ReservationMiniForm } from "../components/reservation-mini-form";
import { L } from "../labels";

type Props = z.output<typeof reservationCta.schema>;

/** Split banner: photo on one side, heading + date/time/party mini form on the other → /reserve?date&time&size */
export async function ReservationCtaSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const settings = ctx.tenant.settings as { contact?: { hours?: Array<{ day?: string; time?: string }>; phone?: string } };
  const hours = parseHours(settings.contact?.hours);
  const now = new Date();
  const today = bangkokParts(now).ymd;
  const phone = settings.contact?.phone;

  return (
    <Section id={id} className="!py-0">
      <div className="grid lg:grid-cols-2">
        <Reveal className="relative min-h-64 lg:min-h-[32rem]">
          {p.image?.url ? (
            <Img src={p.image.url} alt={p.image.alt ?? ""} className="absolute inset-0 size-full object-cover" sizes="(min-width: 1024px) 50vw, 100vw" />
          ) : (
            <div className="absolute inset-0 bg-primary-soft" aria-hidden />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent lg:bg-gradient-to-r" aria-hidden />
        </Reveal>
        <div className="relative flex items-center overflow-hidden bg-primary text-primary-foreground">
          <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
          <Reveal delay={0.1} className="relative w-full px-6 py-12 sm:px-10 md:py-16 lg:px-14">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-80">
              <CalendarCheck className="size-4" /> {L.reserve}
            </p>
            <h2 className="font-heading text-3xl font-semibold text-balance md:text-5xl">{p.heading}</h2>
            {p.body && <p className="mt-4 max-w-xl text-base leading-relaxed opacity-85 md:text-lg">{p.body}</p>}
            <ReservationMiniForm hours={hours} today={today} nowIso={now.toISOString()} dark className="mt-8" />
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm opacity-85">
              <span>
                เปิด {hours.open}–{hours.close} น.
              </span>
              {phone && (
                <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="inline-flex h-11 items-center gap-1.5 underline-offset-4 hover:underline">
                  <Phone className="size-4" /> {phone}
                </a>
              )}
              <Button asChild variant="link" className="h-11 px-0 text-primary-foreground">
                <Link href="/reserve">ดูรอบทั้งหมด</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
