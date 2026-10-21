import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { ScrubText } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { text } from "../definitions";
import { Eyebrow, Prose, RevealHeading, Rise, Section, fxOf, hasAccentFont, isThaiText } from "./_shared";

type Props = z.output<typeof text.schema>;

/**
 * text: `normal` = editorial column (heading left / body right on desktop, lead paragraph larger);
 * `large` = statement whose words light up as you scroll (ScrubText), any further paragraphs as calm prose.
 */
export function TextSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.heading && !p.body && !p.eyebrow) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const center = p.align === "center";
  const paras = p.body.split(/\n{2,}/).filter((s) => s.trim());

  if (p.size === "large") {
    const [statement = "", ...rest] = paras;
    return (
      <Section type="text" fx={fx}>
        <div className={cn("container-x", center && "text-center")}>
          {(p.eyebrow || p.heading) && (
            <div className={cn("mb-10 flex flex-wrap items-baseline gap-x-6 gap-y-3 md:mb-14", center && "justify-center")}>
              {p.eyebrow && <Eyebrow text={p.eyebrow} />}
              {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="font-heading text-step-2 font-semibold text-muted-foreground" />}
            </div>
          )}
          {statement &&
            (fx === "off" ? (
              <p className={cn("rw-h max-w-6xl font-heading text-step-4 leading-[1.3] font-semibold text-balance md:text-step-5", center && "mx-auto")} data-script={isThaiText(statement) ? "thai" : "latin"}>
                {statement}
              </p>
            ) : (
              <ScrubText as="p" text={statement} className={cn("max-w-6xl font-heading text-step-4 leading-[1.3] font-semibold text-balance md:text-step-5", center && "mx-auto")} />
            ))}
          {rest.length > 0 && (
            <Rise fx={fx} className={cn("mt-12 max-w-2xl", center ? "mx-auto" : "md:ml-auto md:mr-[8%]")}>
              <Prose text={rest.join("\n\n")} className="text-step-1 text-muted-foreground" />
            </Rise>
          )}
        </div>
      </Section>
    );
  }

  if (center) {
    return (
      <Section type="text" fx={fx}>
        <div className="container-x mx-auto max-w-3xl text-center">
          {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6 justify-center" />}
          {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="font-heading text-step-4 font-semibold text-balance" />}
          {p.body && (
            <Rise fx={fx} delay={0.15}>
              <Prose text={p.body} className="mt-8 text-step-1 text-muted-foreground [&>p:first-child]:text-foreground" />
            </Rise>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section type="text" fx={fx}>
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2.5rem)]">
            {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6" />}
            {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="font-heading text-step-4 font-semibold text-balance" />}
          </div>
        </div>
        {p.body && (
          <Rise fx={fx} delay={0.1} className="lg:col-span-6 lg:col-start-7">
            <Prose text={p.body} className="text-step-0 leading-[1.85] text-muted-foreground md:text-step-1 [&>p:first-child]:text-step-1 [&>p:first-child]:text-foreground md:[&>p:first-child]:text-step-2 [&>p:first-child]:leading-relaxed" />
          </Rise>
        )}
      </div>
    </Section>
  );
}
