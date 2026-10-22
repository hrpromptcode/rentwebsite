import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { contactOf, type StorefrontCtx } from "../ctx";
import { lineChat } from "../line";
import type { contact } from "../definitions";
import { Prose, Rise, Section, SectionHeading, fxOf, hasAccentFont } from "./_shared";
import { ContactForm } from "./contact-form";

type Props = z.output<typeof contact.schema>;

/** An e-mail that may break only after "@" (then between domain labels), never mid-word: "contact@⏎northstar.co.th". */
function Email({ value }: { value: string }) {
  const at = value.indexOf("@");
  if (at < 1) return <>{value}</>;
  return (
    <>
      {value.slice(0, at + 1)}
      <wbr />
      <span className="whitespace-nowrap">{value.slice(at + 1)}</span>
    </>
  );
}

function Row({ icon, label, children, href, external, valueClassName }: { icon: React.ReactNode; label: string; children: React.ReactNode; href?: string; external?: boolean; valueClassName?: string }) {
  const body = (
    <>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border text-primary transition-colors duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className={cn("mt-0.5 block font-heading text-step-2 leading-snug font-medium break-words", valueClassName)}>{children}</span>
      </span>
      {href && <ArrowUpRight aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-500 group-hover:rotate-45 group-hover:text-foreground" />}
    </>
  );
  return href ? (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="group flex items-start gap-5 border-b border-border py-6 transition-colors">
      {body}
    </a>
  ) : (
    <div className="group flex items-start gap-5 border-b border-border py-6">{body}</div>
  );
}

export function Contact({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const c = contactOf(ctx);
  const phone = p.phone ?? c.phone;
  const email = p.email ?? c.email;
  // ADMIN_B2-10: a section-level LINE ID replaces the shop's (and its lineUrl); see ../line.ts for the accepted shapes
  const line = p.lineId ? lineChat({ lineId: p.lineId }) : lineChat(c);
  const address = p.address ?? c.address;
  const mapUrl = p.mapEmbedUrl ?? c.mapUrl;
  const hours = c.hours ?? [];
  const chips = p.variant === "chips";

  const details = (
    <div className="border-t border-border">
      {phone && (
        <Row icon={<Phone className="size-5" />} label={ctx.t("common.call")} href={`tel:${phone}`}>
          {phone}
        </Row>
      )}
      {line && (
        <Row icon={<MessageCircle className="size-5" />} label="LINE" href={line.href ?? undefined} external>
          {line.display}
        </Row>
      )}
      {email && (
        // long addresses step down a size in the narrow chips column; the domain never breaks mid-word
        <Row icon={<Mail className="size-5" />} label="อีเมล" href={`mailto:${email}`} valueClassName={email.length > (chips ? 18 : 26) ? "text-step-1" : undefined}>
          <Email value={email} />
        </Row>
      )}
      {address && (
        <Row icon={<MapPin className="size-5" />} label={ctx.t("common.address")}>
          <Prose text={address} className="font-body text-base leading-relaxed font-normal" />
        </Row>
      )}
      {p.showHours && hours.length > 0 && (
        <div className="flex items-start gap-5 border-b border-border py-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border text-primary">
            <Clock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">{ctx.t("common.openingHours")}</span>
            <dl className="mt-3 grid gap-2 text-sm">
              {hours.map((h) => (
                <div key={h.day} className="flex items-baseline gap-3">
                  <dt className="font-medium">{h.day}</dt>
                  <span aria-hidden className="flex-1 translate-y-[-0.2em] border-b border-dotted border-border" />
                  <dd className="text-muted-foreground tabular-nums">{h.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );

  const form = p.showForm ? (
    <Rise fx={fx} delay={0.1} className={cn("card p-6 sm:p-8 md:p-10", chips && "md:p-12")}>
      <ContactForm
        interests={chips ? p.interests : []}
        budgets={chips ? p.budgets : []}
        t={{ submit: ctx.t("form.submit"), sent: ctx.t("form.sent"), name: ctx.t("checkout.name"), phone: ctx.t("checkout.phone"), email: ctx.t("checkout.email"), message: ctx.t("form.message") }}
      />
    </Rise>
  ) : null;

  const map =
    p.showMap && mapUrl ? (
      <Rise fx={fx} delay={0.2} className="group relative overflow-hidden rounded-[var(--radius-2xl)] border border-border">
        <iframe src={mapUrl} title="แผนที่" className="rw-map-frame h-72 w-full md:h-96" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        <span aria-hidden className="rw-map-tint pointer-events-none absolute inset-0 bg-primary" />
      </Rise>
    ) : null;

  return (
    <Section id="contact" type="contact" fx={fx}>
      <div className="container-x">
        <SectionHeading heading={p.heading} subheading={p.body} align="left" layout="split" fx={fx} accent={accent} size={chips ? "lg" : "md"} />
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Rise fx={fx} className={cn(chips ? "lg:order-2 lg:col-span-4" : "lg:col-span-5")}>{details}</Rise>
          <div className={cn("space-y-8", chips ? "lg:order-1 lg:col-span-8" : "lg:col-span-7")}>
            {form}
            {map}
          </div>
        </div>
      </div>
    </Section>
  );
}
