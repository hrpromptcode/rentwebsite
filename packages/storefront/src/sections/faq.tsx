import * as React from "react";
import type { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentweb/ui/components/accordion";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "../ctx";
import type { faq } from "../definitions";
import { Rise, Section, SectionHeading, fxOf, hasAccentFont, pad2 } from "./_shared";

type Props = z.output<typeof faq.schema>;

/**
 * FAQ: numbered accordion rows at --step-2, plus → × rotation, eased height + the answer rising out of a mask
 * (CSS on the Radix content). Two-column = heading left / questions right on desktop.
 */
export function Faq({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const list = (
    <Accordion type="single" collapsible className="rw-faq border-t border-border">
      {p.items.map((it, i) => (
        <AccordionItem key={i} value={`${id}-${i}`} className="rw-faq-item border-b border-border">
          <AccordionTrigger className="rw-faq-trigger group items-center gap-5 py-6 hover:text-foreground md:gap-8 md:py-8 [&>svg]:hidden">
            <span aria-hidden className="w-8 shrink-0 font-mono text-xs tracking-[0.08em] text-muted-foreground transition-colors group-hover:text-primary md:w-10 md:text-sm">
              {pad2(i + 1)}
            </span>
            <span className="flex-1 font-heading text-step-2 leading-snug font-medium text-balance">{it.q}</span>
            <span aria-hidden className="rw-faq-icon flex size-11 shrink-0 items-center justify-center rounded-full border border-border">
              <span className="rw-plus" />
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-8 md:pb-10">
            <div className="rw-faq-a pl-[3.25rem] md:pl-[4.5rem] md:pr-20">
              <p className="max-w-3xl text-step-1 leading-relaxed whitespace-pre-line text-muted-foreground">{it.a}</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  if (p.layout === "two-column") {
    return (
      <Section type="faq" fx={fx}>
        <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2.5rem)]">
              <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 md:mb-0" fx={fx} accent={accent} />
            </div>
          </div>
          <Rise fx={fx} className="lg:col-span-8">
            {list}
          </Rise>
        </div>
      </Section>
    );
  }
  return (
    <Section type="faq" fx={fx}>
      <div className="container-x">
        <div className="mx-auto max-w-5xl">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} index={`(${pad2(p.items.length)})`} className={cn("max-w-none")} />
          <Rise fx={fx}>{list}</Rise>
        </div>
      </div>
    </Section>
  );
}
