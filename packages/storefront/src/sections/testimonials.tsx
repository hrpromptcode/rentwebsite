import * as React from "react";
import type { z } from "zod";
import { Quote, Star } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Marquee, Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { testimonials } from "../definitions";
import { Section, SectionHeading } from "./_shared";

type Props = z.output<typeof testimonials.schema>;
type Item = Props["items"][number];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5 text-accent" aria-label={`${n} ดาว`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn("size-4", i < n ? "fill-current" : "opacity-25")} />
      ))}
    </div>
  );
}

function Card({ it, className }: { it: Item; className?: string }) {
  return (
    <figure className={cn("card flex h-full flex-col gap-4 p-6", className)}>
      <Stars n={it.rating} />
      <blockquote className="flex-1 text-base leading-relaxed">“{it.quote}”</blockquote>
      <figcaption className="flex items-center gap-3">
        {it.avatar ? (
          <img src={it.avatar} alt="" className="size-10 rounded-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-primary-soft font-heading text-primary">{it.name.slice(0, 1)}</div>
        )}
        <div>
          <div className="text-sm font-semibold">{it.name}</div>
          {it.role && <div className="text-xs text-muted-foreground">{it.role}</div>}
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;

  if (p.variant === "marquee") {
    const half = Math.ceil(p.items.length / 2);
    return (
      <Section tone="muted" className="overflow-hidden">
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} />
        </div>
        <div className="space-y-4">
          <Marquee duration={50}>
            {p.items.slice(0, half).map((it, i) => (
              <Card key={i} it={it} className="w-[22rem]" />
            ))}
          </Marquee>
          {p.items.length > 1 && (
            <Marquee duration={60} reverse>
              {p.items.slice(half).concat(p.items.slice(0, Math.max(0, 3 - (p.items.length - half)))).map((it, i) => (
                <Card key={i} it={it} className="w-[22rem]" />
              ))}
            </Marquee>
          )}
        </div>
      </Section>
    );
  }

  if (p.variant === "spotlight") {
    const [first, ...rest] = p.items;
    return (
      <Section>
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align="left" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Reveal className="card relative overflow-hidden bg-primary p-10 text-primary-foreground lg:col-span-2">
              <Quote className="absolute -top-4 -right-4 size-40 opacity-10" />
              <blockquote className="font-heading text-2xl leading-snug md:text-4xl">“{first!.quote}”</blockquote>
              <div className="mt-8 flex items-center gap-3">
                {first!.avatar && <img src={first!.avatar} alt="" className="size-12 rounded-full object-cover" />}
                <div>
                  <div className="font-semibold">{first!.name}</div>
                  <div className="text-sm opacity-80">{first!.role}</div>
                </div>
              </div>
            </Reveal>
            <Stagger className="grid gap-4">
              {rest.slice(0, 2).map((it, i) => (
                <StaggerItem key={i}>
                  <Card it={it} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} />
        <Stagger className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {p.items.map((it, i) => (
            <StaggerItem key={i}>
              <Card it={it} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
