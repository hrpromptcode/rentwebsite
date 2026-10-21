import * as React from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Button } from "@rentweb/ui/components/button";
import { Magnetic, Reveal, RollText, SplitReveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { graphemeCount, scriptOf } from "@rentweb/ui/motion/split";
import type { StorefrontCtx } from "../ctx";
import { SectionStyles } from "./_styles";

/* ================================================================================================================
   Shared building blocks for every storefront section (docs/design/hi-end-direction.md §7.0). Module packages reuse
   them through `@rentweb/storefront` (Section, SectionHeading, PageIntro, DisplayText, RevealHeading, CtaButton …).
   All SERVER components: they render kit client islands with serialisable props only.
   ================================================================================================================ */

/** Per-section effects level (definitions `fx` prop): auto = theme, calm = reveals only (no WebGL / pin), off = static. */
export type Fx = "auto" | "calm" | "off";

export function fxOf(p: { fx?: unknown } | null | undefined): Fx {
  const v = p?.fx;
  return v === "calm" || v === "off" ? v : "auto";
}

/** WebGL scenes / pinned scroll scenes are allowed only at fx=auto and when the theme does not switch 3D off. */
export function allow3d(ctx: StorefrontCtx, fx: Fx): boolean {
  if (fx !== "auto") return false;
  const scene3d = (ctx.theme.effects as { scene3d?: string }).scene3d;
  return scene3d !== "off";
}

/** Theme motion level (subtle | standard | expressive). */
export function motionOf(ctx: StorefrontCtx): "subtle" | "standard" | "expressive" {
  const m = (ctx.theme.effects as { motionLevel?: string }).motionLevel;
  return m === "subtle" || m === "expressive" ? m : "standard";
}

/** true when the theme has a Latin accent font (fonts.accent), so digit runs / Latin words may switch to it. */
export function hasAccentFont(ctx: StorefrontCtx): boolean {
  const a = (ctx.theme.fonts as { accent?: string }).accent;
  return !!a && a !== "display";
}

export const isThaiText = (s: string) => /[฀-๿]/.test(s);

/** Visible length of a display string (graphemes without spaces). */
export function textLen(s: string | undefined): number {
  return s ? graphemeCount(s.replace(/\s+/g, "")) : 0;
}

/**
 * Picks a type step by text length so long Thai headings never balloon into 5-line blocks:
 * `stepFor(heading, ["text-step-5", "text-step-4", "text-step-3"], [16, 30])`.
 */
export function stepFor(text: string | undefined, steps: [string, string, string], limits: [number, number] = [18, 34]): string {
  const n = textLen(text);
  return n <= limits[0] ? steps[0] : n <= limits[1] ? steps[1] : steps[2];
}
export const pad2 = (n: number) => String(n).padStart(2, "0");

/* ---------------------------------------------------------------------------------------------------------------- */

export function Icon({ name, className }: { name?: string; className?: string }) {
  const Cmp = (name && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]) || Icons.Sparkles;
  return <Cmp className={className} />;
}

type Tone = "default" | "muted" | "surface" | "primary" | "foreground";

/**
 * Section wrapper. Keeps the old API (children, className, id, tone) for module sections and adds the hi-end rhythm
 * (`rw-sec`: generous fluid padding × theme density), `data-section` / `data-fx` / `data-heavy` hooks and the hoisted
 * section stylesheet. Utilities in `className` (e.g. `!py-0`) still win: the rhythm lives in @layer components.
 */
export function Section({
  children,
  className,
  id,
  tone = "default",
  fx,
  type,
  heavy,
  ariaLabel,
  style,
  as = "section",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  tone?: Tone;
  fx?: Fx;
  /** section type (data-section, for CSS hooks and QA) */
  type?: string;
  /** this section mounts a WebGL scene / pinned scroll scene */
  heavy?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
  as?: "section" | "div";
}) {
  const Tag = as;
  return (
    <Tag
      id={id}
      aria-label={ariaLabel}
      data-section={type}
      data-fx={fx && fx !== "auto" ? fx : undefined}
      data-heavy={heavy ? "" : undefined}
      data-tone={tone !== "default" ? tone : undefined}
      style={style}
      className={cn(
        "section rw-sec relative",
        tone === "muted" && "bg-muted",
        tone === "surface" && "bg-surface",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "foreground" && "bg-foreground text-background",
        className,
      )}
    >
      <SectionStyles />
      {children}
    </Tag>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Type                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

const DIGIT_RUN = /\d[\d.,:+%×x/-]*/g;

/** Splits a line into text / digit runs (digit-run rule §7.0). */
function digitRuns(line: string): Array<{ t: string; d: boolean }> {
  const out: Array<{ t: string; d: boolean }> = [];
  let last = 0;
  for (const m of line.matchAll(DIGIT_RUN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: line.slice(last, i), d: false });
    out.push({ t: m[0], d: true });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last), d: false });
  return out;
}

/**
 * Server text renderer for display strings: honours `\n` (forced line break), tags `data-script` and wraps digit runs
 * in `font-accent` (the theme's Latin accent face; falls back to the display face). No motion.
 */
export function DisplayText({
  text,
  as = "span",
  className,
  accentDigits = true,
  id,
}: {
  text: string;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "h4" | "div";
  className?: string;
  accentDigits?: boolean;
  id?: string;
}) {
  if (!text) return null;
  const Tag = as;
  const lines = text.split("\n");
  return (
    <Tag id={id} data-script={scriptOf(text)} className={cn("rw-h", className)}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {accentDigits
            ? digitRuns(line).map((r, ri) =>
                r.d ? (
                  <span key={ri} className="font-accent">
                    {r.t}
                  </span>
                ) : (
                  <React.Fragment key={ri}>{r.t}</React.Fragment>
                ),
              )
            : line}
        </React.Fragment>
      ))}
    </Tag>
  );
}

type HTag = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div" | "blockquote";

/**
 * Heading with the kit's Thai-safe SplitReveal (server segmentation, mask reveal). Honours `\n` (pre-line) and, when
 * the theme has an accent font, renders digit runs in it (composite of per-run reveals under one aria-label).
 * fx="off" renders a plain heading.
 */
export function RevealHeading({
  text,
  as = "h2",
  className,
  fx = "auto",
  trigger = "inView",
  mode = "lines",
  from = "mask",
  delay = 0,
  accent = false,
  id,
  style,
}: {
  text?: string;
  as?: HTag;
  className?: string;
  fx?: Fx;
  trigger?: "inView" | "mount" | "scrub";
  mode?: "words" | "lines" | "chars";
  from?: "mask" | "below" | "blur" | "rotate";
  delay?: number;
  /** wrap digit runs in the accent font (pass hasAccentFont(ctx)) */
  accent?: boolean;
  id?: string;
  style?: React.CSSProperties;
}) {
  const t = (text ?? "").replace(/\r/g, "");
  if (!t.trim()) return null;
  const cls = cn("rw-h whitespace-pre-line", className);
  if (fx === "off") {
    const Tag = as;
    return (
      <Tag id={id} style={style} data-script={scriptOf(t)} className={cls}>
        {t}
      </Tag>
    );
  }
  DIGIT_RUN.lastIndex = 0;
  const digits = accent && /\d/.test(t);
  if (!digits) return <SplitReveal as={as} text={t} mode={mode} from={from} trigger={trigger} delay={delay} className={cls} id={id} style={style} />;

  // composite: one aria-label, per-run reveals (digit runs in the accent face), words cascade across the runs
  const script = scriptOf(t);
  const step = script === "latin" ? 0.06 : 0.08;
  let offset = delay;
  const Tag = as;
  const lines = t.split("\n");
  return (
    <Tag id={id} style={style} aria-label={/^h[1-6]$/.test(as) ? t.replace(/\s*\n\s*/g, " ") : undefined} data-script={script} className={cls}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && "\n"}
          {digitRuns(line).map((r, ri) => {
            const d = Math.min(offset, delay + 0.9);
            offset += Math.max(1, r.t.trim().split(/\s+/).length) * step;
            return r.t.trim() ? (
              <SplitReveal key={ri} as="span" text={r.t} mode="words" from={from} trigger={trigger} delay={d} className={r.d ? "font-accent" : undefined} />
            ) : (
              <React.Fragment key={ri}>{r.t}</React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </Tag>
  );
}

/** Eyebrow / kicker: Latin = tracked uppercase, Thai = 0.02em, never uppercase (A5). Optional mono index "01". */
export function Eyebrow({ text, index, className, tone = "primary", rule = true }: { text?: string; index?: string; className?: string; tone?: "primary" | "muted" | "inherit"; rule?: boolean }) {
  if (!text && !index) return null;
  const thai = !!text && isThaiText(text);
  return (
    <p
      data-eyebrow=""
      data-script={text ? scriptOf(text) : "latin"}
      className={cn(
        "rw-eyebrow inline-flex items-center gap-3 text-xs md:text-[0.8125rem]",
        thai ? "font-semibold tracking-[0.02em]" : "font-semibold tracking-[0.18em] uppercase",
        tone === "primary" && "text-primary-ink",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {index && <span className="font-mono text-[0.6875rem] tracking-[0.08em] opacity-70">{index}</span>}
      {rule && <span aria-hidden className="rw-rule inline-block h-px w-8 bg-current opacity-60" />}
      {text && <span>{text}</span>}
    </p>
  );
}

/**
 * Section heading (upgrade). Old API kept: eyebrow, heading, subheading, align, className, size. New: `layout="split"`
 * puts the subheading in a right column on desktop (editorial 7/5), `index` adds a mono counter, `fx` / `accent`.
 */
export function SectionHeading({
  eyebrow,
  heading,
  subheading,
  align = "center",
  className,
  size = "md",
  layout = "stack",
  index,
  fx = "auto",
  accent = false,
  as = "h2",
  tone,
}: {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  align?: "left" | "center";
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "stack" | "split";
  index?: string;
  fx?: Fx;
  accent?: boolean;
  as?: "h1" | "h2";
  /** inverse colours (on primary / foreground backgrounds) */
  tone?: "inverse";
}) {
  if (!eyebrow && !heading && !subheading) return null;
  const sizeCls =
    size === "xl" || size === "lg"
      ? stepFor(heading, ["text-step-5", "text-step-5", "text-step-4"], [18, 34])
      : size === "sm"
        ? "text-step-3"
        : stepFor(heading, ["text-step-4", "text-step-4", "text-step-3"], [18, 38]);
  const head = (
    <>
      {(eyebrow || index) && <Eyebrow text={eyebrow} index={index} tone={tone === "inverse" ? "inherit" : "primary"} className={cn("mb-5 md:mb-6", align === "center" && "justify-center")} />}
      {heading && <RevealHeading as={as} text={heading} fx={fx} accent={accent} className={cn("font-heading font-semibold text-balance", sizeCls)} />}
    </>
  );
  const sub = subheading ? (
    <Rise fx={fx} delay={0.15}>
      <p className={cn("text-step-1 leading-relaxed text-pretty", tone === "inverse" ? "opacity-80" : "text-muted-foreground", layout === "stack" && "mt-5 md:mt-6")}>{subheading}</p>
    </Rise>
  ) : null;

  if (layout === "split" && align === "left") {
    return (
      <div className={cn("rw-heading mb-12 grid gap-6 md:mb-20 lg:grid-cols-12 lg:items-end lg:gap-10", className)}>
        <div className="lg:col-span-7">{head}</div>
        {sub && <div className="lg:col-span-5 lg:pb-2">{sub}</div>}
      </div>
    );
  }
  return (
    <div className={cn("rw-heading mb-12 max-w-3xl md:mb-16", align === "center" ? "mx-auto text-center" : "text-left", size === "xl" && "max-w-5xl", className)}>
      {head}
      {sub}
    </div>
  );
}

/**
 * Intro block for module and inner pages (renders the page's <h1>). `compact` = operational pages: no split reveal,
 * a short fade only.
 */
export function PageIntro({
  eyebrow,
  title,
  lead,
  index,
  compact = false,
  align = "left",
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  index?: string;
  compact?: boolean;
  align?: "left" | "center";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header data-page-intro="" className={cn("rw-intro relative pt-10 pb-8 md:pt-16 md:pb-12", align === "center" && "text-center", className)}>
      <SectionStyles />
      {(eyebrow || index) && <Eyebrow text={eyebrow} index={index} className={cn("mb-4 md:mb-5", align === "center" && "justify-center")} />}
      {compact ? (
        <h1 data-script={scriptOf(title)} className="rw-h rw-fade font-heading text-step-4 font-semibold text-balance">
          {title}
        </h1>
      ) : (
        <RevealHeading as="h1" text={title} trigger="mount" className="font-heading text-step-5 font-semibold text-balance" />
      )}
      {lead && <p className={cn("rw-fade mt-4 max-w-2xl text-step-1 leading-relaxed text-muted-foreground md:mt-5", align === "center" && "mx-auto")}>{lead}</p>}
      {children}
      <div aria-hidden className="rw-draw-line mt-8 h-px w-full bg-border md:mt-12" />
    </header>
  );
}

/** Fade/rise wrapper: the kit Reveal, or plain markup at fx="off". */
export function Rise({
  children,
  fx = "auto",
  delay,
  className,
  direction,
  as,
}: {
  children: React.ReactNode;
  fx?: Fx;
  delay?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none" | "scale" | "blur";
  as?: "div" | "span" | "li" | "article";
}) {
  if (fx === "off") {
    const Tag = as ?? "div";
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <Reveal delay={delay} className={className} direction={direction} as={as}>
      {children}
    </Reveal>
  );
}

/** Staggered list container (kit Stagger) or a plain element at fx="off". Children should be StaggerCell. */
export function StaggerList({ fx = "auto", className, children, stagger, delay }: { fx?: Fx; className?: string; children: React.ReactNode; stagger?: number; delay?: number }) {
  if (fx === "off") return <div className={className}>{children}</div>;
  return (
    <Stagger className={className} stagger={stagger} delay={delay}>
      {children}
    </Stagger>
  );
}

export function StaggerCell({ fx = "auto", className, children, style }: { fx?: Fx; className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  if (fx === "off")
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <StaggerItem className={className} style={style}>
      {children}
    </StaggerItem>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Buttons                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Arrow that slides out and back in on hover (two stacked arrows in a mask). */
export function ArrowGlyph({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("rw-arrow relative inline-flex size-[1.1em] shrink-0 overflow-hidden", className)}>
      <ArrowRight className="rw-arrow-a absolute inset-0 size-full" />
      <ArrowRight className="rw-arrow-b absolute inset-0 size-full" />
    </span>
  );
}

/**
 * Primary / secondary CTA: theme button (shape from data-button) + Magnetic pull + RollText label + sliding arrow.
 * The visible label stays the accessible name (RollText keeps the real text once).
 */
export function CtaButton({
  href,
  label,
  variant = "default",
  size = "xl",
  fx = "auto",
  arrow = true,
  className,
  magnetic = true,
}: {
  href: string;
  label: string;
  variant?: "default" | "outline" | "ghost" | "inverse" | "accent" | "secondary";
  size?: "lg" | "xl" | "default";
  fx?: Fx;
  arrow?: boolean;
  className?: string;
  magnetic?: boolean;
}) {
  const btn = (
    <Button asChild size={size} variant={variant} className={cn("rw-cta group/cta", className)}>
      <SmartLink href={href}>
        {fx === "off" ? <span>{label}</span> : (
          <span data-magnetic-inner="" className="inline-flex">
            <RollText>{label}</RollText>
          </span>
        )}
        {arrow && <ArrowGlyph />}
      </SmartLink>
    </Button>
  );
  if (fx === "off" || !magnetic) return btn;
  return (
    <Magnetic strength={0.3} max={10} className="inline-flex">
      {btn}
    </Magnetic>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Links, prose, images                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

export function SmartLink({ href, className, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const external = /^https?:\/\//.test(href) || href.startsWith("tel:") || href.startsWith("mailto:");
  if (external) {
    // keep data-* / aria-* hooks (cursor labels, tests) on plain anchors too
    const attrs = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-") || k.startsWith("aria-")));
    return (
      <a href={href} className={className} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" {...attrs}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** Renders plain text with blank-line paragraphs and single newlines as <br/>. */
export function Prose({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const paras = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-4 leading-relaxed", className)}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j, arr) => (
            <React.Fragment key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export function Img({ src, alt, className, sizes, priority, draggable }: { src: string; alt?: string; className?: string; sizes?: string; priority?: boolean; draggable?: boolean }) {
  if (!src) return <div className={cn("bg-muted", className)} aria-hidden />;
  // Plain <img> keeps the package independent from next/image loader config; CDN handles resizing.
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      draggable={draggable}
    />
  );
}

/** Unsplash helper for section code: bump the `w=` of an images.unsplash.com URL (others pass through). */
export function sized(url: string, w: number): string {
  if (!url || !/images\.unsplash\.com/.test(url)) return url;
  return /[?&]w=\d+/.test(url) ? url.replace(/([?&]w=)\d+/, `$1${w}`) : `${url}${url.includes("?") ? "&" : "?"}w=${w}`;
}
