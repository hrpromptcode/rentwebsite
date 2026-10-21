import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal, ParallaxMedia } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { imageText } from "../definitions";
import { CtaButton, Eyebrow, Img, Prose, RevealHeading, Rise, Section, StaggerCell, StaggerList, fxOf, hasAccentFont, pad2, stepFor, type Fx } from "./_shared";

type Props = z.output<typeof imageText.schema>;

function Copy({ p, fx, accent, big, compact, className }: { p: Props; fx: Fx; accent: boolean; big?: boolean; compact?: boolean; className?: string }) {
  const hSize = compact ? stepFor(p.heading, ["text-step-4", "text-step-3", "text-step-3"], [10, 40]) : stepFor(p.heading, ["text-step-4", "text-step-4", "text-step-3"], [12, 20]);
  return (
    <div className={className}>
      {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6" />}
      {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className={cn("font-heading font-semibold text-balance", hSize)} />}
      {p.body && (
        <Rise fx={fx} delay={0.12}>
          <Prose text={p.body} className="mt-6 text-step-0 leading-[1.85] text-muted-foreground md:text-step-1 md:leading-relaxed" />
        </Rise>
      )}
      {p.bullets.length > 0 && (
        <StaggerList fx={fx} className={cn("mt-8 border-t border-border", big && "mt-12")}>
          {p.bullets.map((b, i) => (
            <StaggerCell key={b + i} fx={fx} className={cn("flex items-baseline gap-5 border-b border-border", big ? "py-7 md:py-9" : "py-4")}>
              <span className="font-mono text-xs tracking-[0.08em] text-primary-ink">{pad2(i + 1)}</span>
              <span className={cn(big ? "text-step-2 font-medium" : "text-base")}>{b}</span>
            </StaggerCell>
          ))}
        </StaggerList>
      )}
      {p.cta?.label && (
        <Rise fx={fx} delay={0.2} className="mt-10">
          <CtaButton href={p.cta.href} label={p.cta.label} variant="outline" size="lg" fx={fx} />
        </Rise>
      )}
    </div>
  );
}

export function ImageText({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const imageFirst = p.imagePosition === "left";
  const img = p.image.url;
  const reveal = (aspect: string, cls?: string, from: "left" | "right" | "bottom" = imageFirst ? "left" : "right") =>
    img ? (
      fx === "off" ? (
        <div className={cn("overflow-hidden", cls)} style={{ aspectRatio: aspect }}>
          <Img src={img} alt={p.image.alt} className="size-full object-cover" />
        </div>
      ) : (
        <ImageReveal src={img} alt={p.image.alt} aspect={aspect} from={from} parallax={0.1} sizes="(min-width: 1024px) 58vw, 100vw" className={cls} />
      )
    ) : (
      <div className={cn("bg-muted", cls)} style={{ aspectRatio: aspect }} aria-hidden />
    );

  if (p.style === "card") {
    return (
      <Section type="image-text" fx={fx}>
        <div className="container-x grid items-center lg:grid-cols-12">
          <div className={cn("row-start-1 lg:col-span-8", imageFirst ? "lg:col-start-1" : "lg:col-start-5")}>{reveal("16/11", "rounded-[var(--radius-2xl)]")}</div>
          <Rise fx={fx} delay={0.15} className={cn("relative z-10 row-start-2 -mt-14 mx-3 sm:mx-8 lg:row-start-1 lg:m-0 lg:col-span-5", imageFirst ? "lg:col-start-8" : "lg:col-start-1")}>
            <div className="card glass p-7 shadow-float sm:p-10 md:p-12">
              <Copy p={p} fx={fx} accent={accent} compact />
            </div>
          </Rise>
        </div>
      </Section>
    );
  }

  if (p.style === "overlap") {
    return (
      <Section type="image-text" fx={fx}>
        <div className="container-x grid items-center gap-12 lg:grid-cols-12 lg:gap-0">
          <div className={cn("relative lg:row-start-1 lg:col-span-7", imageFirst ? "lg:col-start-1" : "lg:col-start-6")}>
            <div aria-hidden className={cn("rw-par absolute top-[14%] -bottom-[8%] rounded-[var(--radius-3xl)] bg-primary-soft", imageFirst ? "-left-[6%] right-[18%]" : "left-[18%] -right-[6%]")} style={{ "--par": "12%" } as React.CSSProperties} />
            <div aria-hidden className={cn("rw-par absolute -top-6 size-24 rounded-full border border-primary/40 md:size-36", imageFirst ? "right-[8%]" : "left-[8%]")} style={{ "--par": "-28%" } as React.CSSProperties} />
            {img ? (
              fx === "off" ? (
                <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-2xl)] shadow-float sm:aspect-[5/4]">
                  <Img src={img} alt={p.image.alt} className="size-full object-cover" />
                </div>
              ) : (
                <ParallaxMedia speed={-0.12} className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-2xl)] shadow-float sm:aspect-[5/4]">
                  <Img src={img} alt={p.image.alt} className="size-full object-cover" />
                </ParallaxMedia>
              )
            ) : (
              <div className="relative aspect-[4/5] rounded-[var(--radius-2xl)] bg-muted" aria-hidden />
            )}
          </div>
          <div className={cn("relative z-10 lg:row-start-1 lg:col-span-6", imageFirst ? "lg:col-start-7" : "lg:col-start-1")}>
            <div className="rw-par" style={{ "--par": "-5%" } as React.CSSProperties}>
              <div className="card glass p-7 shadow-float sm:p-10 md:p-14">
                <Copy p={p} fx={fx} accent={accent} compact />
              </div>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (p.style === "pinned") {
    return (
      <Section type="image-text" fx={fx}>
        <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className={cn("lg:col-span-6", imageFirst ? "lg:order-1" : "lg:order-2 lg:col-start-7")}>
            <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+4svh)]">
              {img ? (
                <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-2xl)] lg:aspect-auto lg:h-[min(84svh,880px)]">
                  {fx === "off" ? (
                    <Img src={img} alt={p.image.alt} className="size-full object-cover" />
                  ) : (
                    <div className="absolute inset-0">
                      <ImageReveal src={img} alt={p.image.alt} from="bottom" parallax={0.12} className="h-full w-full" sizes="(min-width: 1024px) 50vw, 100vw" />
                    </div>
                  )}
                </div>
              ) : null}
              {p.image.alt && <p aria-hidden className="mt-4 truncate text-sm text-muted-foreground">{p.image.alt}</p>}
            </div>
          </div>
          <Copy p={p} fx={fx} accent={accent} big className={cn("lg:col-span-5 lg:py-[14svh]", imageFirst ? "lg:order-2 lg:col-start-8" : "lg:order-1")} />
        </div>
      </Section>
    );
  }

  // plain: editorial 7/5 asymmetry
  return (
    <Section type="image-text" fx={fx}>
      <div className="container-x grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <div className={cn("lg:col-span-7", imageFirst ? "lg:order-1" : "lg:order-2")}>
          {reveal("5/4", "rounded-[var(--radius-2xl)]")}
          {p.image.alt && (
            <p aria-hidden className="mt-4 flex items-center gap-3 truncate text-sm text-muted-foreground">
              <span aria-hidden className="h-px w-8 bg-border" />
              {p.image.alt}
            </p>
          )}
        </div>
        <Copy p={p} fx={fx} accent={accent} className={cn("lg:col-span-5", imageFirst ? "lg:order-2" : "lg:order-1")} />
      </div>
    </Section>
  );
}
