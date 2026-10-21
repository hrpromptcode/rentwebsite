import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { HorizontalScroll } from "@rentweb/ui/motion";
import { GlowCard } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { horizontalScroll } from "../definitions";
import { Img, Section, SectionHeading, SmartLink, fxOf, hasAccentFont, pad2, sized } from "./_shared";

type Props = z.output<typeof horizontalScroll.schema>;
type Item = Props["items"][number];

const RATIO: Record<Props["ratio"], string> = { "3/4": "aspect-[3/4]", "4/5": "aspect-[4/5]", "16/10": "aspect-[16/10]", "1/1": "aspect-square" };
const WIDTH: Record<Props["ratio"], string> = {
  "3/4": "w-[70vw] sm:w-[40vw] lg:w-[26vw]",
  "4/5": "w-[72vw] sm:w-[42vw] lg:w-[28vw]",
  "16/10": "w-[84vw] sm:w-[62vw] lg:w-[44vw]",
  "1/1": "w-[72vw] sm:w-[42vw] lg:w-[30vw]",
};

function CardInner({ it, i, n, style, ratio }: { it: Item; i: number; n: number; style: Props["cardStyle"]; ratio: Props["ratio"] }) {
  if (style === "poster") {
    return (
      <div className={cn("relative overflow-hidden rounded-[var(--radius-2xl)] bg-neutral-900 text-white", RATIO[ratio])}>
        <div className="rw-zoom absolute inset-0">
          <Img src={sized(it.image, 1100)} alt={it.title} className="size-full object-cover" draggable={false} />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 font-mono text-xs tracking-[0.08em] text-white/80">
          <span>{pad2(i + 1)} / {pad2(n)}</span>
          {it.tag && <span className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur">{it.tag}</span>}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
          <h3 className="font-heading text-step-3 leading-tight font-semibold text-balance">{it.title}</h3>
          {it.body && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/80">{it.body}</p>}
        </div>
        {it.href && <ArrowUpRight aria-hidden className="absolute right-5 bottom-6 size-6 text-white transition-transform duration-500 group-hover:rotate-45" />}
      </div>
    );
  }
  if (style === "numbered") {
    return (
      <GlowCard className="card flex h-full flex-col overflow-hidden p-6 md:p-8">
        <p aria-hidden className="font-accent text-step-6 leading-none font-semibold text-primary/25">{pad2(i + 1)}</p>
        <h3 className="mt-8 font-heading text-step-2 font-semibold text-balance">{it.title}</h3>
        {it.body && <p className="mt-3 leading-relaxed text-muted-foreground">{it.body}</p>}
        {it.image && (
          <div className="rw-zoom mt-auto overflow-hidden rounded-[var(--radius-lg)] pt-8">
            <Img src={sized(it.image, 900)} alt="" className="aspect-[16/10] w-full rounded-[var(--radius-lg)] object-cover" draggable={false} />
          </div>
        )}
      </GlowCard>
    );
  }
  return (
    <div>
      <div className={cn("rw-zoom overflow-hidden rounded-[var(--radius-xl)]", RATIO[ratio])}>
        <Img src={sized(it.image, 1100)} alt={it.title} className="size-full object-cover" draggable={false} />
      </div>
      <div className="mt-5 flex items-baseline gap-4">
        <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-step-2 font-semibold">{it.title}</h3>
          {it.body && <p className="mt-2 leading-relaxed text-muted-foreground">{it.body}</p>}
        </div>
        {it.tag && <span className="rounded-full border border-border px-2.5 py-1 text-xs">{it.tag}</span>}
      </div>
    </div>
  );
}

/** Pinned horizontal track (desktop + motion); a native swipe row on phones, reduced motion and fx calm/off. */
export function HorizontalScrollSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const items = p.items.filter((it) => it.title);
  if (!items.length) return null;
  const fx = fxOf(p);
  const head = <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={hasAccentFont(ctx)} index={`(${pad2(items.length)})`} />;
  const cards = items.map((it, i) => {
    const inner = <CardInner it={it} i={i} n={items.length} style={p.cardStyle} ratio={p.ratio} />;
    return (
      <article key={i} className={cn("shrink-0", WIDTH[p.ratio])}>
        {it.href ? (
          <SmartLink href={it.href} className="group block h-full" data-cursor="view" data-cursor-label="เปิดดู">
            {inner}
          </SmartLink>
        ) : (
          <div className="group h-full">{inner}</div>
        )}
      </article>
    );
  });

  if (fx !== "auto") {
    return (
      <Section type="horizontal-scroll" fx={fx}>
        <div className="container-x">{head}</div>
        <div role="region" aria-label={p.heading || "รายการ"} className="rw-swipe" tabIndex={0}>
          {cards}
        </div>
      </Section>
    );
  }
  return (
    <Section type="horizontal-scroll" fx={fx} heavy className="!py-0">
      <HorizontalScroll
        label={p.heading || "รายการ"}
        header={<div className="container-x pt-[calc(clamp(4.5rem,9vw,9.5rem)*var(--density,1))]">{head}</div>}
        trackClassName="gap-5 px-[var(--gutter)] md:gap-8 md:pl-[max(var(--gutter),calc((100vw-var(--container,80rem))/2+var(--gutter)))]"
      >
        {cards}
      </HorizontalScroll>
    </Section>
  );
}
