import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { steps } from "../definitions";
import { Icon, Section, SectionHeading } from "./_shared";

type Props = z.output<typeof steps.schema>;

export function Steps({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const vertical = p.variant === "vertical";
  return (
    <Section tone="surface">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} />
        <Stagger className={cn("relative grid gap-8", vertical ? "mx-auto max-w-2xl" : "md:grid-cols-3")}>
          {!vertical && <div className="absolute top-7 right-[16%] left-[16%] hidden h-px border-t-2 border-dashed border-border md:block" />}
          {p.items.map((it, i) => (
            <StaggerItem key={i} className={cn("relative", vertical && "flex gap-6", p.variant === "cards" && "card p-7")}>
              <div className={cn("relative z-10 flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-xl font-semibold text-primary-foreground shadow-lg shadow-glow/40", !vertical && "mx-auto")}>
                {it.icon ? <Icon name={it.icon} className="size-6" /> : i + 1}
              </div>
              <div className={cn(!vertical && "mt-5 text-center")}>
                <h3 className="font-heading text-xl font-semibold">{it.title}</h3>
                {it.description && <p className="mt-1.5 text-muted-foreground">{it.description}</p>}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
