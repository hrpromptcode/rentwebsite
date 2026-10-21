import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { VelocityMarquee } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { logos } from "../definitions";
import { Img, Rise, Section, fxOf, isThaiText, pad2 } from "./_shared";

type Props = z.output<typeof logos.schema>;

/**
 * Logo strip: images (grayscale → colour on hover) and/or typographic wordmarks (accent font) on a scroll-reactive
 * velocity marquee; a static centred row when marquee is off or fx=off. Placeholder dummy images are skipped when
 * names are given.
 */
export function Logos({ ctx: _ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const names = p.names.map((s) => s.trim()).filter(Boolean);
  const images = p.items.filter((im) => im.url && !(names.length && /dummyimage\.com/.test(im.url)));
  if (!images.length && !names.length) return null;
  const count = images.length + names.length;

  const nodes: React.ReactNode[] = [
    ...images.map((im, i) => <Img key={`i${i}`} src={im.url} alt={im.alt} className="rw-logo-img h-8 w-auto max-w-[10rem] object-contain md:h-10" />),
    ...names.map((n, i) => (
      <span key={`n${i}`} data-script={isThaiText(n) ? "thai" : "latin"} className={cn("rw-logo-name font-accent text-step-3 leading-none font-semibold whitespace-nowrap", !isThaiText(n) && "tracking-[-0.03em]")}>
        {n}
      </span>
    )),
  ];

  return (
    <Section type="logos" fx={fx} className="!py-[calc(clamp(3rem,6vw,5rem)*var(--density,1))] overflow-x-clip">
      <div className="container-x">
        <Rise fx={fx} className="mb-8 flex items-center justify-between gap-6 md:mb-12">
          {p.heading && <p className="text-sm text-muted-foreground md:text-base">{p.heading}</p>}
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">({pad2(count)})</span>
        </Rise>
      </div>
      {p.marquee && fx !== "off" ? (
        <VelocityMarquee items={nodes} speed={34} reactToScroll={fx === "auto"} skew={fx === "auto"} gap="clamp(2.5rem, 6vw, 5rem)" separator={null} label={p.heading || "พาร์ตเนอร์"} className="[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]" />
      ) : (
        <div className="container-x">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">{nodes}</div>
        </div>
      )}
    </Section>
  );
}
