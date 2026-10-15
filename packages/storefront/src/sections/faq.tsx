import * as React from "react";
import type { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentweb/ui/components/accordion";
import { Reveal } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { faq } from "../definitions";
import { Section, SectionHeading } from "./_shared";

type Props = z.output<typeof faq.schema>;

export function Faq({ props: p, id }: { ctx: StorefrontCtx; props: Props; id: string }) {
  if (!p.items.length) return null;
  const list = (items: Props["items"], offset = 0) => (
    <Accordion type="single" collapsible className="card divide-y px-6">
      {items.map((it, i) => (
        <AccordionItem key={i} value={`${id}-${i + offset}`}>
          <AccordionTrigger>{it.q}</AccordionTrigger>
          <AccordionContent>{it.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
  const half = Math.ceil(p.items.length / 2);
  return (
    <Section tone="muted">
      <div className="container-x max-w-5xl">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Reveal>
          {p.layout === "two-column" ? (
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
              {list(p.items.slice(0, half))}
              {list(p.items.slice(half), half)}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl">{list(p.items)}</div>
          )}
        </Reveal>
      </div>
    </Section>
  );
}
