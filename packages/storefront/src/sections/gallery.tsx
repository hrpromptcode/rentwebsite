import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { gallery } from "../definitions";
import { Img, Section, SectionHeading } from "./_shared";

type Props = z.output<typeof gallery.schema>;
const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

export function Gallery({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (p.layout === "filmstrip" || p.layout === "carousel") {
    return (
      <Section className="overflow-hidden">
        <div className="container-x">
          <SectionHeading heading={p.heading} subheading={p.subheading} />
        </div>
        <div className="no-scrollbar snap-x-mandatory flex gap-4 overflow-x-auto px-[max(1rem,calc((100vw-var(--container))/2))] pb-4">
          {p.images.map((im, i) => (
            <figure key={i} className="snap-child group relative w-[78vw] shrink-0 overflow-hidden rounded-[var(--radius-xl)] sm:w-[48vw] lg:w-[32vw]">
              <Img src={im.url} alt={im.alt} className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105" />
              {im.caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sm text-white">{im.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </Section>
    );
  }

  if (p.layout === "masonry") {
    return (
      <Section>
        <div className="container-x">
          <SectionHeading heading={p.heading} subheading={p.subheading} />
          <Stagger className={cn("columns-2 gap-4 space-y-4", p.columns >= 3 && "md:columns-3", p.columns === 4 && "lg:columns-4")}>
            {p.images.map((im, i) => (
              <StaggerItem key={i} className="group relative break-inside-avoid overflow-hidden rounded-[var(--radius-xl)]">
                <Img src={im.url} alt={im.alt} className="w-full object-cover transition duration-700 group-hover:scale-105" />
                {im.caption && <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/60 p-3 text-sm text-white transition group-hover:translate-y-0">{im.caption}</div>}
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
        <SectionHeading heading={p.heading} subheading={p.subheading} />
        <Stagger className={cn("grid gap-4", COLS[p.columns])}>
          {p.images.map((im, i) => (
            <StaggerItem key={i} className="group relative overflow-hidden rounded-[var(--radius-xl)]">
              <Img src={im.url} alt={im.alt} className="aspect-square w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="pointer-events-none absolute inset-0 bg-primary/0 transition duration-500 group-hover:bg-primary/15" />
              {im.caption && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sm text-white">{im.caption}</div>}
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
