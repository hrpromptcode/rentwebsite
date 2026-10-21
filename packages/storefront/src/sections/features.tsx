import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { HoverPreview, ImageReveal, StickyStory } from "@rentweb/ui/motion";
import { GlowCard } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { features } from "../definitions";
import { Icon, Img, Rise, Section, SectionHeading, StaggerCell, StaggerList, fxOf, hasAccentFont, pad2, type Fx } from "./_shared";

type Props = z.output<typeof features.schema>;
type Item = Props["items"][number];

const COLS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" };

const ICON_BASIS: Record<number, string> = {
  2: "sm:w-[calc(50%-0.625rem)]",
  3: "sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.84rem)]",
  4: "sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-0.94rem)]",
};

/** bento spans by item count (6-col grid): every count fills its rows. */
function bentoSpan(n: number, i: number): string {
  const big = "md:col-span-4 md:row-span-2";
  if (n === 1) return "md:col-span-6 md:row-span-2";
  if (n === 2) return "md:col-span-3 md:row-span-2";
  if (i === 0) return big;
  if (n === 3) return "md:col-span-2";
  if (n === 4) return i === 3 ? "md:col-span-6" : "md:col-span-2";
  if (n === 5) return i >= 3 ? "md:col-span-3" : "md:col-span-2";
  if (n === 6) return i === 1 ? "md:col-span-2 md:row-span-2" : "md:col-span-2";
  return "md:col-span-2";
}

function CardBody({ it, i, big }: { it: Item; i: number; big?: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="rw-icon-tile flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-primary-soft text-primary">
          <Icon name={it.icon} className="size-5.5" />
        </span>
        <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>
      </div>
      <div className={cn("mt-auto", big ? "pt-16" : "pt-10")}>
        <h3 className={cn("font-heading font-semibold text-balance", big ? "text-step-3" : "text-step-2")}>{it.title}</h3>
        {it.description && <p className={cn("mt-3 leading-relaxed text-muted-foreground", big && "max-w-md text-step-1")}>{it.description}</p>}
      </div>
    </>
  );
}

function Cards({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  return (
    <Section type="features" fx={fx}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} />
        <StaggerList fx={fx} className={cn("grid gap-4 sm:grid-cols-2 md:gap-5", COLS[p.columns])}>
          {p.items.map((it, i) => (
            <StaggerCell key={i} fx={fx} className="h-full">
              <GlowCard as="article" className="card rw-lift group relative flex h-full min-h-72 flex-col overflow-hidden p-7 md:p-8">
                {it.image && (
                  <div className="rw-zoom -mx-7 -mt-7 mb-7 aspect-[16/10] md:-mx-8 md:-mt-8">
                    <Img src={it.image} alt="" className="size-full object-cover" />
                  </div>
                )}
                <CardBody it={it} i={i} />
              </GlowCard>
            </StaggerCell>
          ))}
        </StaggerList>
      </div>
    </Section>
  );
}

function List({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const rows = p.items.map((it, i) => (
    <li key={i} data-preview-src={it.image || undefined} data-preview-alt={it.image ? it.title : undefined} className="rw-row group border-t border-border last:border-b">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-1 py-7 md:grid-cols-[4rem_minmax(0,1fr)_auto] md:px-3 md:py-9">
        <span className="rw-row-idx pt-2 font-mono text-sm text-muted-foreground">{pad2(i + 1)}</span>
        <div className="min-w-0">
          <h3 className="rw-row-title flex items-center gap-3 font-heading text-step-3 leading-tight font-semibold">
            <Icon name={it.icon} className="size-6 shrink-0 text-primary md:hidden" />
            <span>{it.title}</span>
          </h3>
          {it.description && (
            <div className="rw-unfold">
              <div>
                <p className="max-w-2xl pt-3 leading-relaxed text-muted-foreground md:text-step-1">{it.description}</p>
              </div>
            </div>
          )}
        </div>
        <span className="rw-row-arrow hidden size-12 items-center justify-center self-center rounded-full border border-border text-primary md:flex">
          <Icon name={it.icon} className="size-5" />
        </span>
      </div>
    </li>
  ));
  return (
    <Section type="features" fx={fx}>
      <div className="container-x grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2.5rem)]">
            <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 md:mb-0" fx={fx} accent={accent} />
            <p aria-hidden className="mt-10 hidden font-accent text-step-7 leading-none font-semibold text-primary/15 lg:block">{pad2(p.items.length)}</p>
          </div>
        </div>
        <div className="lg:col-span-7">
          {fx === "off" ? <ol>{rows}</ol> : <HoverPreview as="ol">{rows}</HoverPreview>}
        </div>
      </div>
    </Section>
  );
}

function Bento({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const n = p.items.length;
  return (
    <Section type="features" fx={fx}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} />
        <StaggerList fx={fx} className="grid gap-4 md:auto-rows-[minmax(15rem,auto)] md:grid-cols-6 md:gap-5">
          {p.items.map((it, i) => {
            const span = bentoSpan(n, i);
            const big = i === 0 && n > 2;
            if (it.image && (big || n <= 2)) {
              return (
                <StaggerCell key={i} fx={fx} className={cn("h-full", span)}>
                  <article className="group relative flex h-full min-h-[24rem] flex-col justify-end overflow-hidden rounded-[var(--radius-2xl)] bg-neutral-900 p-7 text-white md:p-10">
                    <div className="absolute inset-0">
                      <ImageReveal src={it.image} alt="" from="bottom" parallax={0.08} className="h-full w-full" sizes="(min-width: 768px) 66vw, 100vw" />
                    </div>
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                    <div className="relative">
                      <span className="mb-5 flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md">
                        <Icon name={it.icon} className="size-5" />
                      </span>
                      <h3 className="max-w-xl font-heading text-step-3 font-semibold text-balance">{it.title}</h3>
                      {it.description && <p className="mt-3 max-w-lg leading-relaxed text-white/80">{it.description}</p>}
                    </div>
                    <span className="absolute top-6 right-7 font-mono text-xs tracking-[0.08em] text-white/70">{pad2(i + 1)}</span>
                  </article>
                </StaggerCell>
              );
            }
            return (
              <StaggerCell key={i} fx={fx} className={cn("h-full", span)}>
                <GlowCard as="article" className="card rw-lift group relative flex h-full flex-col overflow-hidden p-7 md:p-8">
                  {it.image && (
                    <div className="absolute inset-0 opacity-[.14] transition-opacity duration-700 group-hover:opacity-25">
                      <Img src={it.image} alt="" className="size-full object-cover" />
                    </div>
                  )}
                  <div className="relative flex h-full flex-col">
                    <CardBody it={it} i={i} big={big} />
                  </div>
                </GlowCard>
              </StaggerCell>
            );
          })}
        </StaggerList>
      </div>
    </Section>
  );
}

function Icons({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  return (
    <Section type="features" fx={fx} tone="muted">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} fx={fx} accent={accent} />
        <StaggerList fx={fx} className="flex flex-wrap justify-center gap-5">
          {p.items.map((it, i) => (
            <StaggerCell key={i} fx={fx} className={cn("w-full", ICON_BASIS[p.columns])}>
              <div className="rw-draw-icon group relative grid h-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 rounded-[var(--radius-2xl)] border border-border bg-background/70 px-5 py-6 text-left transition-colors duration-500 hover:border-primary/40 sm:flex sm:flex-col sm:items-center sm:px-8 sm:py-14 sm:text-center">
                <span className="rw-icon-tile row-span-2 flex size-14 items-center justify-center rounded-full border border-border bg-background text-primary sm:size-20 [&_svg]:stroke-[1.4]">
                  <Icon name={it.icon} className="size-7 sm:size-9" />
                </span>
                <h3 className="font-heading text-step-2 font-semibold text-balance sm:mt-7">{it.title}</h3>
                {it.description && <p className="mt-1.5 max-w-xs leading-relaxed text-muted-foreground sm:mt-3">{it.description}</p>}
                <span aria-hidden className="absolute top-3 right-4 font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground/80 sm:top-5 sm:right-auto sm:left-6">
                  {pad2(i + 1)}
                </span>
              </div>
            </StaggerCell>
          ))}
        </StaggerList>
      </div>
    </Section>
  );
}

function Sticky({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const media = (it: Item, i: number) =>
    it.image ? (
      <div className="rw-story-media rounded-[var(--radius-2xl)]">
        <Img src={it.image} alt={it.title} className="size-full object-cover" />
      </div>
    ) : (
      <div className="rw-story-media flex items-center justify-center rounded-[var(--radius-2xl)] bg-[radial-gradient(120%_90%_at_30%_20%,color-mix(in_oklab,var(--primary)_35%,var(--surface)),var(--surface)_60%,color-mix(in_oklab,var(--accent)_30%,var(--surface)))]">
        <span className="flex size-40 items-center justify-center rounded-full border border-foreground/10 bg-background/60 text-primary backdrop-blur-xl md:size-56 [&_svg]:stroke-[1.2]">
          <Icon name={it.icon} className="size-16 md:size-24" />
        </span>
        <span className="absolute bottom-6 left-7 font-accent text-step-6 leading-none font-semibold text-foreground/10">{pad2(i + 1)}</span>
      </div>
    );
  if (fx !== "auto") {
    return (
      <Section type="features" fx={fx}>
        <div className="container-x">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} />
          <div className="grid gap-12">
            {p.items.map((it, i) => (
              <Rise key={i} fx={fx} className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">{pad2(i + 1)}</p>
                  <h3 className="mt-3 font-heading text-step-4 font-semibold">{it.title}</h3>
                  {it.description && <p className="mt-4 text-step-1 leading-relaxed text-muted-foreground">{it.description}</p>}
                </div>
                <div className="aspect-[4/3]">{media(it, i)}</div>
              </Rise>
            ))}
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section type="features" fx={fx}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} />
        <StickyStory
          mediaMode="clip"
          side="left"
          items={p.items.map((it, i) => ({ key: `f${i}`, title: it.title, kicker: pad2(i + 1), body: it.description || undefined, media: media(it, i) }))}
        />
      </div>
    </Section>
  );
}

export function Features({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length && !p.heading) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  switch (p.variant) {
    case "list":
      return <List p={p} fx={fx} accent={accent} />;
    case "bento":
      return <Bento p={p} fx={fx} accent={accent} />;
    case "icons":
      return <Icons p={p} fx={fx} accent={accent} />;
    case "sticky":
      return <Sticky p={p} fx={fx} accent={accent} />;
    default:
      return <Cards p={p} fx={fx} accent={accent} />;
  }
}
