import * as React from "react";
import type { z } from "zod";
import { Star } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { VelocityMarquee } from "@rentweb/ui/motion";
import { GlowCard } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { testimonials } from "../definitions";
import { Eyebrow, RevealHeading, Rise, Section, SectionHeading, StaggerCell, StaggerList, fxOf, hasAccentFont, isThaiText, pad2, stepFor, type Fx } from "./_shared";
import { ChatThread } from "./client/chat-thread";
import { QuoteSwitcher } from "./client/quote-switcher";

type Props = z.output<typeof testimonials.schema>;
type Item = Props["items"][number];

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cn("flex gap-0.5 text-accent", className)} role="img" aria-label={`${n} ดาว`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} aria-hidden className={cn("size-4", i < n ? "fill-current" : "opacity-25")} />
      ))}
    </div>
  );
}

function Avatar({ it, size = "size-11" }: { it: Item; size?: string }) {
  return it.avatar ? (
    <img src={it.avatar} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} loading="lazy" decoding="async" />
  ) : (
    <span aria-hidden className={cn(size, "flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-heading text-primary")}>
      {it.name.slice(0, 1)}
    </span>
  );
}

/** Quote glyph whose stroke draws on enter (scroll-driven), filled softly underneath. */
function QuoteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 36" aria-hidden className={cn("rw-quote-mark", className)}>
      <path d="M4 34V22C4 11 9 4 19 2l1.5 4.5C14.6 8.4 12 12.4 12 18h8v16H4zm24 0V22c0-11 5-18 15-20l1.5 4.5C38.6 8.4 36 12.4 36 18h8v16H28z" />
    </svg>
  );
}

function Card({ it, i, className }: { it: Item; i?: number; className?: string }) {
  return (
    <figure className={cn("card flex h-full flex-col gap-6 p-7 md:p-8", className)}>
      <div className="flex items-center justify-between">
        <QuoteMark className="h-7 w-9 text-primary" />
        {i !== undefined && <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>}
      </div>
      <blockquote className="flex-1 text-step-1 leading-relaxed text-pretty">{it.quote}</blockquote>
      <figcaption className="flex items-center gap-3 border-t border-border pt-5">
        <Avatar it={it} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{it.name}</div>
          {it.role && <div className="truncate text-xs text-muted-foreground">{it.role}</div>}
        </div>
        <Stars n={it.rating} />
      </figcaption>
    </figure>
  );
}

function Cards({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  return (
    <Section type="testimonials" fx={fx}>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align="left" layout="split" fx={fx} accent={accent} index={`(${pad2(p.items.length)})`} />
        <StaggerList fx={fx} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {p.items.map((it, i) => (
            <StaggerCell key={i} fx={fx} className={cn("h-full", i % 3 === 1 && "lg:translate-y-12")}>
              <GlowCard className="h-full rounded-[var(--radius-xl)]">
                <Card it={it} i={i} className="rw-lift" />
              </GlowCard>
            </StaggerCell>
          ))}
        </StaggerList>
      </div>
    </Section>
  );
}

function Marquee({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const half = Math.ceil(p.items.length / 2);
  const rowA = p.items.slice(0, half);
  const rowB = p.items.length > 1 ? p.items.slice(half).concat(p.items.slice(0, Math.max(0, 3 - (p.items.length - half)))) : [];
  const card = (it: Item, k: number) => <Card key={k} it={it} className="w-[min(82vw,24rem)] whitespace-normal" />;
  return (
    <Section type="testimonials" fx={fx} tone="muted" className="overflow-x-clip">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} fx={fx} accent={accent} />
      </div>
      {fx === "off" ? (
        <div className="rw-swipe">{p.items.map(card)}</div>
      ) : (
        <div className="grid gap-5">
          <VelocityMarquee items={rowA.map(card)} speed={28} reactToScroll={fx === "auto"} skew={false} separator={null} gap="1.25rem" label={p.heading || "รีวิว"} />
          {rowB.length > 0 && <VelocityMarquee items={rowB.map(card)} speed={24} direction={-1} reactToScroll={fx === "auto"} skew={false} separator={null} gap="1.25rem" />}
        </div>
      )}
    </Section>
  );
}

function Spotlight({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const quote = (it: Item, i: number) => (
    <figure>
      <QuoteMark className="mb-8 h-10 w-14 text-primary md:h-14 md:w-20" />
      {i === 0 ? (
        <RevealHeading as="blockquote" text={`“${it.quote}”`} mode="lines" fx={fx} className={cn("max-w-5xl font-heading leading-[1.3] font-medium text-balance", stepFor(it.quote, ["text-step-4", "text-step-4", "text-step-3"], [40, 80]))} />
      ) : (
        <blockquote data-script={isThaiText(it.quote) ? "thai" : "latin"} className={cn("rw-h max-w-5xl font-heading leading-[1.3] font-medium text-balance", stepFor(it.quote, ["text-step-4", "text-step-4", "text-step-3"], [40, 80]))}>
          “{it.quote}”
        </blockquote>
      )}
      <figcaption className="mt-10 flex items-center gap-4">
        <Avatar it={it} size="size-14" />
        <div>
          <div className="font-semibold">{it.name}</div>
          {it.role && <div className="text-sm text-muted-foreground">{it.role}</div>}
        </div>
        <Stars n={it.rating} className="ml-auto hidden sm:flex" />
      </figcaption>
    </figure>
  );
  return (
    <Section type="testimonials" fx={fx}>
      <div className="container-x">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6 md:mb-16">
          <div>
            {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-4" />}
            {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={accent} className="font-heading text-step-3 font-semibold text-balance" />}
          </div>
          <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">({pad2(p.items.length)})</span>
        </div>
        <Rise fx={fx}>
          <QuoteSwitcher items={p.items.map((it) => ({ quote: it.quote, name: it.name, role: it.role, avatar: it.avatar, rating: it.rating }))}>{p.items.map(quote)}</QuoteSwitcher>
        </Rise>
      </div>
    </Section>
  );
}

function Chat({ p, fx, accent }: { p: Props; fx: Fx; accent: boolean }) {
  const items = p.items.slice(0, 8);
  return (
    <Section type="testimonials" fx={fx} tone="surface">
      <div className="container-x grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(var(--header-h,0px)+2.5rem)]">
            <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align="left" className="mb-0 md:mb-0" fx={fx} accent={accent} />
            <p className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
              <span aria-hidden className="relative flex size-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative size-2.5 rounded-full bg-emerald-500" />
              </span>
              {items.length} ข้อความจากลูกค้าจริง
            </p>
          </div>
        </div>
        <ChatThread className="mx-auto w-full max-w-2xl space-y-6 lg:col-span-8 lg:col-start-5">
          {items.map((it, i) => {
            const right = i % 2 === 1;
            return (
              <div key={i} className={cn("relative flex items-end gap-3", right && "flex-row-reverse")} style={{ "--i": i } as React.CSSProperties}>
                <span className={cn("rw-typing", right ? "right-14" : "left-14")} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <Avatar it={it} size="size-10" />
                <figure
                  className={cn(
                    "rw-bubble max-w-[min(34rem,82%)] rounded-[1.4rem] px-5 py-4 shadow-sm",
                    right ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-background",
                  )}
                >
                  <blockquote className="leading-relaxed text-pretty">{it.quote}</blockquote>
                  <figcaption className={cn("mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs", right ? "border-primary-foreground/20 text-primary-foreground/80" : "border-border text-muted-foreground")}>
                    <span className="font-semibold">{it.name}</span>
                    {it.role && <span className="truncate">{it.role}</span>}
                    <span className="ml-auto inline-flex items-center gap-0.5" role="img" aria-label={`${it.rating} ดาว`}>
                      {Array.from({ length: it.rating }).map((_, k) => (
                        <Star key={k} aria-hidden className="size-3 fill-current" />
                      ))}
                    </span>
                  </figcaption>
                </figure>
              </div>
            );
          })}
        </ChatThread>
      </div>
    </Section>
  );
}

export function Testimonials({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  switch (p.variant) {
    case "marquee":
      return <Marquee p={p} fx={fx} accent={accent} />;
    case "spotlight":
      return <Spotlight p={p} fx={fx} accent={accent} />;
    case "chat":
      return <Chat p={p} fx={fx} accent={accent} />;
    default:
      return <Cards p={p} fx={fx} accent={accent} />;
  }
}
