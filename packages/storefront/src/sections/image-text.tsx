import * as React from "react";
import type { z } from "zod";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Parallax, Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { imageText } from "../definitions";
import { Img, Prose, Section, SmartLink } from "./_shared";

type Props = z.output<typeof imageText.schema>;

export function ImageText({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  const imageFirst = p.imagePosition === "left";
  return (
    <Section className={cn(p.style === "card" && "bg-muted")}>
      <div className={cn("container-x grid items-center gap-10 lg:grid-cols-2 lg:gap-16", p.style === "card" && "card p-6 md:p-12")}>
        <Reveal direction={imageFirst ? "right" : "left"} className={cn(imageFirst ? "lg:order-1" : "lg:order-2", "relative")}>
          <Parallax speed={0.12} className={cn("overflow-hidden rounded-[var(--radius-2xl)]", p.style === "overlap" && "lg:translate-x-8")}>
            <Img src={p.image.url} alt={p.image.alt} className="aspect-[4/3] w-full object-cover transition duration-700 hover:scale-105" />
          </Parallax>
          {p.style === "overlap" && <div className="absolute -inset-4 -z-10 rounded-[var(--radius-3xl)] bg-primary-soft" />}
        </Reveal>
        <div className={cn(imageFirst ? "lg:order-2" : "lg:order-1")}>
          <Reveal>
            {p.eyebrow && <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">{p.eyebrow}</p>}
            {p.heading && <h2 className="font-heading text-3xl font-semibold md:text-5xl">{p.heading}</h2>}
            <Prose text={p.body} className="mt-5 text-base text-muted-foreground md:text-lg" />
          </Reveal>
          {p.bullets.length > 0 && (
            <Stagger className="mt-6 space-y-3">
              {p.bullets.map((b) => (
                <StaggerItem key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" />
                  </span>
                  <span>{b}</span>
                </StaggerItem>
              ))}
            </Stagger>
          )}
          {p.cta?.label && (
            <Reveal delay={0.2} className="mt-8">
              <Button asChild size="lg" variant="outline">
                <SmartLink href={p.cta.href}>
                  {p.cta.label}
                  <ArrowRight className="size-4" />
                </SmartLink>
              </Button>
            </Reveal>
          )}
        </div>
      </div>
    </Section>
  );
}
