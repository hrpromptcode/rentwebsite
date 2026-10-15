import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem, TiltCard } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { features } from "../definitions";
import { Icon, Img, Section, SectionHeading } from "./_shared";

type Props = z.output<typeof features.schema>;

const COLS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" };

export function Features({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (p.variant === "list") {
    return (
      <Section>
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 lg:sticky lg:top-28" />
          </div>
          <Stagger className="divide-y lg:col-span-7">
            {p.items.map((it, i) => (
              <StaggerItem key={i} className="flex gap-5 py-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-soft text-primary">
                  <Icon name={it.icon} className="size-5" />
                </div>
                <div>
                  <h3 className="font-heading text-xl font-semibold">{it.title}</h3>
                  {it.description && <p className="mt-1.5 leading-relaxed text-muted-foreground">{it.description}</p>}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>
    );
  }

  if (p.variant === "bento") {
    return (
      <Section>
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
          <Stagger className="grid gap-4 md:grid-cols-6 md:auto-rows-[220px]">
            {p.items.map((it, i) => {
              const span = i === 0 ? "md:col-span-4 md:row-span-2" : i === 1 ? "md:col-span-2 md:row-span-2" : "md:col-span-2";
              return (
                <StaggerItem key={i} className={cn("card group relative overflow-hidden p-6", span)}>
                  {it.image && (
                    <Img src={it.image} alt="" className="absolute inset-0 size-full object-cover opacity-25 transition duration-700 group-hover:scale-105 group-hover:opacity-40" />
                  )}
                  <div className="relative flex h-full flex-col justify-end">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
                      <Icon name={it.icon} className="size-5" />
                    </div>
                    <h3 className="font-heading text-xl font-semibold">{it.title}</h3>
                    {it.description && <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>}
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </Section>
    );
  }

  if (p.variant === "icons") {
    return (
      <Section tone="muted">
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
          <Stagger className={cn("grid gap-10 text-center sm:grid-cols-2", COLS[p.columns])}>
            {p.items.map((it, i) => (
              <StaggerItem key={i}>
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-background text-primary shadow-sm">
                  <Icon name={it.icon} className="size-7" />
                </div>
                <h3 className="font-heading text-lg font-semibold">{it.title}</h3>
                {it.description && <p className="mt-1.5 text-sm text-muted-foreground">{it.description}</p>}
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className={cn("grid gap-5 sm:grid-cols-2", COLS[p.columns])}>
          {p.items.map((it, i) => (
            <StaggerItem key={i}>
              <TiltCard max={5} className="card h-full p-7 transition hover:-translate-y-1">
                <div className="mb-5 flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-primary-soft text-primary">
                  <Icon name={it.icon} className="size-6" />
                </div>
                <h3 className="font-heading text-xl font-semibold">{it.title}</h3>
                {it.description && <p className="mt-2 leading-relaxed text-muted-foreground">{it.description}</p>}
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
