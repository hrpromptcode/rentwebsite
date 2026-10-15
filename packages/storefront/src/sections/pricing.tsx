import * as React from "react";
import type { z } from "zod";
import { Check } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { pricing } from "../definitions";
import { Section, SectionHeading, SmartLink } from "./_shared";

type Props = z.output<typeof pricing.schema>;

export function Pricing({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.plans.length) return null;
  return (
    <Section>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className={cn("grid gap-6 lg:items-stretch", p.plans.length === 2 ? "md:grid-cols-2 lg:mx-auto lg:max-w-4xl" : p.plans.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3")}>
          {p.plans.map((pl, i) => (
            <StaggerItem key={i} className={cn("card relative flex flex-col p-8", pl.highlighted && "border-primary ring-2 ring-primary lg:-translate-y-3 lg:scale-[1.02] glow")}>
              {pl.badge && (
                <Badge className="absolute -top-3 left-6" variant={pl.highlighted ? "default" : "secondary"}>
                  {pl.badge}
                </Badge>
              )}
              <h3 className="font-heading text-xl font-semibold">{pl.name}</h3>
              {pl.description && <p className="mt-1 text-sm text-muted-foreground">{pl.description}</p>}
              <div className="mt-6 flex items-baseline gap-1">
                <span className="heading-display text-5xl font-semibold">{pl.price}</span>
                {pl.period && <span className="text-muted-foreground">/{pl.period}</span>}
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {pl.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" variant={pl.highlighted ? "default" : "outline"} className="mt-8 w-full">
                <SmartLink href={pl.cta.href}>{pl.cta.label}</SmartLink>
              </Button>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
