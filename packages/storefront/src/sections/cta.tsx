import * as React from "react";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Magnetic, Reveal } from "@rentweb/ui/motion";
import { GradientMesh } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { cta } from "../definitions";
import { Img, Prose, Section, SmartLink } from "./_shared";

type Props = z.output<typeof cta.schema>;

export function Cta({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  const Buttons = ({ inverse }: { inverse?: boolean }) => (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Magnetic strength={0.2}>
        <Button asChild size="xl" variant={inverse ? "inverse" : "default"} className={cn(inverse && "bg-background text-foreground hover:bg-background/90")}>
          <SmartLink href={p.primaryCta.href}>
            {p.primaryCta.label}
            <ArrowRight className="size-5" />
          </SmartLink>
        </Button>
      </Magnetic>
      {p.secondaryCta?.label && (
        <Button asChild size="xl" variant="ghost" className={cn(inverse && "text-primary-foreground hover:bg-white/10")}>
          <SmartLink href={p.secondaryCta.href}>{p.secondaryCta.label}</SmartLink>
        </Button>
      )}
    </div>
  );

  if (p.variant === "split" && p.image?.url) {
    return (
      <Section>
        <div className="container-x">
          <Reveal className="card grid overflow-hidden p-0 md:grid-cols-2">
            <div className="p-8 md:p-14">
              <h2 className="font-heading text-3xl font-semibold md:text-5xl">{p.heading}</h2>
              <Prose text={p.body} className="mt-4 text-muted-foreground md:text-lg" />
              <Buttons />
            </div>
            <Img src={p.image.url} alt={p.image.alt} className="h-64 w-full object-cover md:h-full" />
          </Reveal>
        </div>
      </Section>
    );
  }

  if (p.variant === "card") {
    return (
      <Section>
        <div className="container-x">
          <Reveal className="card relative overflow-hidden p-10 text-center md:p-20">
            <GradientMesh className="opacity-60" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-heading text-3xl font-semibold md:text-5xl">{p.heading}</h2>
              <Prose text={p.body} className="mt-4 text-muted-foreground md:text-lg" />
              <div className="flex justify-center">
                <Buttons />
              </div>
            </div>
          </Reveal>
        </div>
      </Section>
    );
  }

  if (p.variant === "glow") {
    return (
      <Section tone="foreground" className="overflow-hidden">
        <div className="absolute inset-0 opacity-70">
          <GradientMesh />
        </div>
        <div className="container-x relative text-center">
          <Reveal>
            <h2 className="heading-display text-4xl font-semibold text-background md:text-7xl">{p.heading}</h2>
            <Prose text={p.body} className="mx-auto mt-5 max-w-2xl text-background/75 md:text-xl" />
            <div className="flex justify-center">
              <Buttons inverse />
            </div>
          </Reveal>
        </div>
      </Section>
    );
  }

  return (
    <Section tone="primary" className="overflow-hidden">
      <div className="pointer-events-none absolute -top-1/2 -right-1/4 size-[60vmax] rounded-full bg-glow/40 blur-[120px]" />
      <div className="container-x relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <Reveal>
          <h2 className="font-heading text-3xl font-semibold md:text-5xl">{p.heading}</h2>
          <Prose text={p.body} className="mt-3 max-w-2xl opacity-85 md:text-lg" />
        </Reveal>
        <Reveal delay={0.15}>
          <Buttons inverse />
        </Reveal>
      </div>
    </Section>
  );
}
