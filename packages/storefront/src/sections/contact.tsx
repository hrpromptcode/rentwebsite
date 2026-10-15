import * as React from "react";
import type { z } from "zod";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { contactOf, type StorefrontCtx } from "../ctx";
import type { contact } from "../definitions";
import { Prose, Section, SectionHeading } from "./_shared";
import { ContactForm } from "./contact-form";

type Props = z.output<typeof contact.schema>;

export function Contact({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const c = contactOf(ctx);
  const phone = p.phone ?? c.phone;
  const email = p.email ?? c.email;
  const lineId = p.lineId ?? c.lineId;
  const address = p.address ?? c.address;
  const mapUrl = p.mapEmbedUrl ?? c.mapUrl;
  const hours = c.hours ?? [];

  return (
    <Section id="contact">
      <div className="container-x">
        <SectionHeading heading={p.heading} subheading={p.body} align="left" />
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="space-y-6 lg:col-span-5">
            {phone && (
              <a href={`tel:${phone}`} className="flex items-start gap-4 rounded-[var(--radius-lg)] p-3 transition hover:bg-muted">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Phone className="size-5" />
                </span>
                <span>
                  <span className="block text-sm text-muted-foreground">{ctx.t("common.call")}</span>
                  <span className="text-lg font-medium">{phone}</span>
                </span>
              </a>
            )}
            {lineId && (
              <a href={c.lineUrl ?? `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`} target="_blank" rel="noreferrer" className="flex items-start gap-4 rounded-[var(--radius-lg)] p-3 transition hover:bg-muted">
                <span className="flex size-11 items-center justify-center rounded-full bg-[#06C755]/15 text-[#06C755]">
                  <MessageCircle className="size-5" />
                </span>
                <span>
                  <span className="block text-sm text-muted-foreground">LINE</span>
                  <span className="text-lg font-medium">{lineId}</span>
                </span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-start gap-4 rounded-[var(--radius-lg)] p-3 transition hover:bg-muted">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Mail className="size-5" />
                </span>
                <span>
                  <span className="block text-sm text-muted-foreground">อีเมล</span>
                  <span className="text-lg font-medium">{email}</span>
                </span>
              </a>
            )}
            {address && (
              <div className="flex items-start gap-4 p-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <MapPin className="size-5" />
                </span>
                <span>
                  <span className="block text-sm text-muted-foreground">{ctx.t("common.address")}</span>
                  <Prose text={address} className="text-base" />
                </span>
              </div>
            )}
            {p.showHours && hours.length > 0 && (
              <div className="flex items-start gap-4 p-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Clock className="size-5" />
                </span>
                <div className="w-full">
                  <span className="block text-sm text-muted-foreground">{ctx.t("common.openingHours")}</span>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    {hours.map((h) => (
                      <React.Fragment key={h.day}>
                        <dt className="font-medium">{h.day}</dt>
                        <dd className="text-muted-foreground">{h.time}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </Reveal>
          <div className="space-y-6 lg:col-span-7">
            {p.showForm && (
              <Reveal delay={0.1} className="card p-6 md:p-8">
                <ContactForm t={{ submit: ctx.t("form.submit"), sent: ctx.t("form.sent"), name: ctx.t("checkout.name"), phone: ctx.t("checkout.phone"), email: ctx.t("checkout.email"), message: ctx.t("form.message") }} />
              </Reveal>
            )}
            {p.showMap && mapUrl && (
              <Reveal delay={0.2} className="overflow-hidden rounded-[var(--radius-2xl)] border">
                <iframe src={mapUrl} title="แผนที่" className="h-72 w-full md:h-80" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
