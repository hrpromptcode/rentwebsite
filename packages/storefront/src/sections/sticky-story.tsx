import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { StickyStory } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { stickyStory } from "../definitions";
import { Img, Rise, Section, SectionHeading, SmartLink, fxOf, hasAccentFont, pad2, sized } from "./_shared";

type Props = z.output<typeof stickyStory.schema>;
type Item = Props["items"][number];

/** Stage media per item in the chosen frame: card (glass caption), arch, full-bleed, phone device, round plate. */
function Media({ it, i, n, style }: { it: Item; i: number; n: number; style: Props["mediaStyle"] }) {
  const img = it.image ? <Img src={sized(it.image, 1200)} alt={it.title} className="size-full object-cover" /> : <span aria-hidden className="block size-full bg-[radial-gradient(120%_90%_at_30%_20%,color-mix(in_oklab,var(--primary)_35%,var(--surface)),var(--surface))]" />;
  const link = it.href ? (
    <SmartLink href={it.href} className="group/l pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-background/85 px-4 text-sm font-medium text-foreground backdrop-blur transition hover:bg-background">
      ดูเพิ่มเติม <ArrowUpRight aria-hidden className="size-4 transition-transform group-hover/l:rotate-45" />
    </SmartLink>
  ) : null;

  if (style === "plate") {
    return (
      <div className="flex size-full items-center justify-center rounded-[var(--radius-2xl)] bg-surface p-[8%]">
        <div className="rw-story-media" data-style="plate">
          {img}
        </div>
        <span className="absolute bottom-5 left-6 font-mono text-xs tracking-[0.08em] text-muted-foreground">
          {pad2(i + 1)} / {pad2(n)}
        </span>
        {link && <span className="absolute right-5 bottom-4">{link}</span>}
      </div>
    );
  }
  if (style === "device") {
    return (
      <div className="flex size-full items-center justify-center rounded-[var(--radius-2xl)] bg-[radial-gradient(90%_70%_at_50%_40%,color-mix(in_oklab,var(--primary)_22%,var(--surface)),var(--surface))] p-6">
        <div className="rw-story-media aspect-[9/19] h-[92%] w-auto" data-style="device">
          {img}
        </div>
        {link && <span className="absolute right-5 bottom-4">{link}</span>}
      </div>
    );
  }
  return (
    <div className={cn("rw-story-media", style !== "full" && "rounded-[var(--radius-2xl)]")} data-style={style}>
      {img}
      {style === "card" && (
        <div className="glass absolute right-5 bottom-5 left-5 rounded-[var(--radius-xl)] p-4 md:right-auto md:w-80">
          {it.kicker && <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground">{it.kicker}</p>}
          <p className="mt-1 font-heading text-lg font-semibold">{it.title}</p>
          {link && <div className="mt-3">{link}</div>}
        </div>
      )}
      {style !== "card" && link && <span className="absolute right-5 bottom-5">{link}</span>}
    </div>
  );
}

type StageTone = Exclude<Item["tone"], "auto">;

/** "time-of-day": 1st = morning (soft glow), 2nd = afternoon (accent), middle = sunset (glow), last = night. */
function toneOf(it: Item, i: number, n: number, tones: Props["tones"]): StageTone | undefined {
  if (it.tone !== "auto") return it.tone;
  if (tones !== "time-of-day" || n < 2) return undefined;
  if (i === n - 1) return "night";
  if (i === 0) return "soft";
  return i === 1 ? "accent" : "glow";
}

/** fastwork-style sticky story: titles scroll on one side while the pinned stage morphs per item. */
export function StickyStorySection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const n = p.items.length;
  const head = <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} />;

  if (fx !== "auto") {
    return (
      <Section type="sticky-story" fx={fx}>
        <div className="container-x">
          {head}
          <div className="grid gap-14">
            {p.items.map((it, i) => (
              <Rise key={i} fx={fx} className={cn("grid items-center gap-8 md:grid-cols-2 md:gap-14", p.side === "left" && "md:[&>*:first-child]:order-2")}>
                <div>
                  <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground">
                    {pad2(i + 1)} {it.kicker && `· ${it.kicker}`}
                  </p>
                  <h3 className="mt-3 font-heading text-step-4 font-semibold text-balance">{it.title}</h3>
                  {it.body && <p className="mt-4 text-step-1 leading-relaxed text-muted-foreground">{it.body}</p>}
                  {it.chips.length > 0 && (
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {it.chips.map((c) => (
                        <li key={c} className="rounded-full border border-border px-3 py-1 text-sm">
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="relative aspect-[4/5] md:aspect-[4/4.4]">
                  <Media it={it} i={i} n={n} style={p.mediaStyle} />
                </div>
              </Rise>
            ))}
          </div>
        </div>
      </Section>
    );
  }

  const tones = p.items.map((it, i) => toneOf(it, i, n, p.tones));
  const toned = tones.some((t) => t && t !== "base");
  return (
    <Section type="sticky-story" fx={fx} className={toned ? "rw-story-toned" : undefined}>
      <div className="container-x">
        {head}
        <StickyStory
          side={p.side === "left" ? "right" : "left"}
          mediaMode={p.mediaStyle === "full" ? "clip" : p.mediaStyle === "plate" ? "stack" : "crossfade"}
          counter={p.counter}
          items={p.items.map((it, i) => ({
            key: `s${i}`,
            title: it.title,
            kicker: it.kicker || undefined,
            body: it.body || undefined,
            chips: it.chips.length ? it.chips : undefined,
            media: <Media it={it} i={i} n={n} style={p.mediaStyle} />,
            tone: toned ? tones[i] : undefined,
          }))}
        />
      </div>
    </Section>
  );
}
