import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal, LetterDrop, LiveClock, ScatterCards, TiltCard, WordCycler } from "@rentweb/ui/motion";
import { graphemeCount } from "@rentweb/ui/motion/split";
import { HeroBackground, type HeroBackgroundKind } from "@rentweb/ui/fx";
import type { StorefrontCtx } from "../ctx";
import type { hero } from "../definitions";
import { CtaButton, Eyebrow, DisplayText, Img, RevealHeading, Rise, fxOf, hasAccentFont, isThaiText, motionOf, textLen, type Fx } from "./_shared";
import { SectionStyles } from "./_styles";
import { Poster, SceneLayer, presetKey, resolveScene, sceneRole, type PosterVariant, type ResolvedScene } from "./_scene";

type Props = z.output<typeof hero.schema>;

/* ================================================================================================================
   HERO (§7.1). Seven variants, every old value mapped onto a hi-end composition. The theme's signature 3D scene
   (scene="auto") lives where it adds meaning and never behind body copy without a scrim; a WebGL scene and a shader
   background never mount together (the background then renders its CSS poster).
   ================================================================================================================ */

const SHADER_POSTER: Record<string, PosterVariant> = { "shader-aurora": "aurora", "shader-silk": "silk", "shader-mesh": "mesh", "shader-caustics": "ocean" };
const FRAME_BY_PRESET: Record<string, string> = {
  porcelain: "rounded-t-[999px] rounded-b-[var(--radius-2xl)]",
  zen: "rounded-t-[999px] rounded-b-[var(--radius-xl)]",
  loft: "rounded-[999px]",
  candy: "rounded-[2.5rem]",
};

interface View {
  p: Props;
  ctx: StorefrontCtx;
  fx: Fx;
  preset: string;
  scene: ResolvedScene;
  accent: boolean;
  index: number;
  padTop: string;
  cards: Array<{ image: string; alt: string; title: string; tag: string; href?: string }>;
}

/** Hero background: CSS kinds as before; shader kinds and the legacy WebGL orb fall back to their poster while a scene runs. */
function HeroBg({ v, className }: { v: View; className?: string }) {
  const kind = (v.p.background === "theme" ? v.ctx.theme.effects.heroBackground : v.p.background) as string;
  if (!kind || kind === "none") return null;
  const webgl = kind.startsWith("shader-") || kind === "orb-3d";
  if (webgl && (v.scene !== "none" || v.fx !== "auto")) {
    return <Poster preset={v.preset} variant={SHADER_POSTER[kind] ?? "orb"} className={cn("absolute inset-0 -z-10", className)} />;
  }
  if (kind === "particles" && v.scene !== "none") return null;
  return <HeroBackground kind={kind as HeroBackgroundKind} className={className} />;
}

function headingClass(v: View, auto: string) {
  const thai = isThaiText(v.p.heading);
  // auto: long headings step down (Thai: > 22 graphemes → step-5 max, > 40 → step-4)
  const n = textLen(v.p.heading.replace("{*}", ""));
  const capped =
    auto === "text-step-6" && n > (thai ? 22 : 30)
      ? n > (thai ? 40 : 52)
        ? "text-step-4"
        : "text-step-5"
      : auto === "text-step-5" && n > (thai ? 40 : 56)
        ? "text-step-4"
        : auto;
  const size = v.p.headingSize === "giant" ? (thai ? "text-step-6" : "text-step-7") : v.p.headingSize === "xl" ? "text-step-5" : capped;
  return cn("heading-display font-semibold", size, !thai && "tracking-[-0.035em]");
}

/**
 * Forced lines (`\n`) stay one line each: the longest one caps the font size relative to the heading's column
 * (container query units; Thai ≈ 0.6em per grapheme, Latin ≈ 0.56em per letter, 0.3em per space, +4% safety). The cap
 * never goes below the next smaller step (phones simply wrap then) nor above the chosen one. null = nothing to fit.
 */
function headingFit(heading: string, sizeClass: string): React.CSSProperties | null {
  const lines = heading.replace("{*}", "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const step = Number(/text-step-(\d)/.exec(sizeClass)?.[1] ?? 0);
  if (!step) return null;
  const em = Math.max(...lines.map((l) => textLen(l) * (isThaiText(l) ? 0.6 : 0.56) + (l.match(/\s+/g) ?? []).length * 0.3));
  return { fontSize: `clamp(var(--step-${Math.max(3, step - 1)}), calc(100cqi / ${(em * 1.04).toFixed(2)}), var(--step-${step}))` };
}

/** H1 with its forced lines fitted to the column (see headingFit); the wrapper is the size container (cqi). */
function HeroHeading(props: { v: View; className: string; align?: "left" | "center" }) {
  const fit = props.v.p.cycleWords.some(Boolean) ? null : headingFit(props.v.p.heading, props.className);
  if (!fit) return <HeroHeadingInner {...props} />;
  return (
    <div className="[container-type:inline-size]">
      <HeroHeadingInner {...props} style={fit} />
    </div>
  );
}

/** H1: Thai-safe line reveal on mount; `{*}` / extra line cycles words; an expressive short 2nd line may LetterDrop. */
function HeroHeadingInner({ v, className, align = "left", style }: { v: View; className: string; align?: "left" | "center"; style?: React.CSSProperties }) {
  const { p, fx } = v;
  const words = p.cycleWords.filter(Boolean);
  if (words.length && fx !== "off") {
    const hasSlot = p.heading.includes("{*}");
    const [before = "", after = ""] = hasSlot ? p.heading.split("{*}") : [p.heading, ""];
    const label = hasSlot ? p.heading.replace("{*}", words[0]!) : `${p.heading} ${words[0]}`;
    return (
      <h1 aria-label={label.replace(/\s*\n\s*/g, " ")} className={cn("rw-h whitespace-pre-line", className)} data-script={isThaiText(p.heading) ? "thai" : "latin"}>
        {before.trim() && <RevealHeading as="span" text={before} trigger="mount" mode="words" fx={fx} accent={v.accent} />}
        {!hasSlot && "\n"}
        <WordCycler words={words} mode="roll" className={cn("text-primary-ink", align === "center" && "justify-center")} />
        {after.trim() && <RevealHeading as="span" text={after} trigger="mount" mode="words" fx={fx} delay={0.2} accent={v.accent} />}
      </h1>
    );
  }
  const lines = p.heading.split("\n");
  const second = lines[1]?.trim() ?? "";
  if (lines.length === 2 && second && graphemeCount(second.replace(/\s+/g, "")) <= 12 && motionOf(v.ctx) === "expressive" && fx === "auto" && p.textReveal) {
    return (
      <h1 aria-label={p.heading.replace(/\s*\n\s*/g, " ")} className={cn("rw-h whitespace-pre-line", className)} style={style} data-script={isThaiText(p.heading) ? "thai" : "latin"}>
        <RevealHeading as="span" text={lines[0]!} trigger="mount" mode="words" fx={fx} accent={v.accent} />
        {"\n"}
        <LetterDrop as="span" text={second} trigger="mount" bounce={0.6} className="text-primary-ink" />
      </h1>
    );
  }
  return <RevealHeading as="h1" text={p.heading} trigger="mount" mode="lines" fx={p.textReveal ? fx : "off"} accent={v.accent} delay={0.05} className={className} style={style} />;
}

function Ctas({ v, tone = "default", className }: { v: View; tone?: "default" | "dark"; className?: string }) {
  const { p, fx } = v;
  if (!p.primaryCta?.label && !p.secondaryCta?.label) return null;
  return (
    <Rise fx={fx} delay={0.5} className={cn("mt-8 flex flex-wrap items-center gap-3 md:mt-10", className)}>
      {p.primaryCta?.label && <CtaButton href={p.primaryCta.href} label={p.primaryCta.label} fx={fx} className={cn(tone === "dark" && "shadow-[0_18px_40px_-16px_rgba(0,0,0,.6)]")} />}
      {p.secondaryCta?.label && (
        <CtaButton
          href={p.secondaryCta.href}
          label={p.secondaryCta.label}
          variant="outline"
          fx={fx}
          arrow={false}
          magnetic={false}
          className={cn(tone === "dark" ? "!border-white/35 bg-white/10 text-white backdrop-blur-md hover:bg-white/20" : "bg-background/50 backdrop-blur-sm")}
        />
      )}
    </Rise>
  );
}

function Badges({ items, fx, tone, className }: { items: string[]; fx: Fx; tone?: "dark"; className?: string }) {
  if (!items.length) return null;
  return (
    <Rise fx={fx} delay={0.65} className={cn("mt-7 flex flex-wrap gap-2", className)}>
      {items.map((b, i) => (
        <span
          key={b}
          className={cn(
            "rw-chip items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm",
            i >= 2 ? "hidden md:inline-flex" : "inline-flex",
            tone === "dark" ? "border-white/25 bg-white/10 text-white/90 backdrop-blur" : "border-border bg-background/60 text-foreground/80 backdrop-blur-sm",
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {b}
        </span>
      ))}
    </Rise>
  );
}

function Sub({ v, className }: { v: View; className?: string }) {
  if (!v.p.subheading) return null;
  return (
    <Rise fx={v.fx} delay={0.32}>
      <p className={cn("mt-6 max-w-xl text-step-1 leading-relaxed text-pretty md:mt-7", className ?? "text-muted-foreground")}>{v.p.subheading}</p>
    </Rise>
  );
}

/** Stats as a HUD-like strip (strings: digit runs in the accent face). Rendered below the fold-critical copy. */
function StatsStrip({ v, tone, className }: { v: View; tone?: "dark"; className?: string }) {
  const items = v.p.stats;
  if (!items.length) return null;
  return (
    <Rise fx={v.fx} delay={0.2} className={cn("relative", className)}>
      <dl className={cn("grid grid-cols-2 border-t sm:grid-cols-3", items.length >= 4 && "lg:grid-cols-4", tone === "dark" ? "border-white/20" : "border-border")}>
        {items.map((s, i) => (
          <div key={s.label + i} className={cn("py-6 pr-6 md:py-8", i > 0 && "sm:border-l sm:pl-6 md:pl-8", tone === "dark" ? "border-white/15" : "border-border")}>
            <dd className="order-2">
              <DisplayText text={s.value} className={cn("block font-heading text-step-3 leading-none font-semibold", tone === "dark" ? "text-white" : "text-foreground")} />
            </dd>
            <dt className={cn("mt-2 text-sm", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>{s.label}</dt>
          </div>
        ))}
      </dl>
    </Rise>
  );
}

/** Corner meta row: studio labels + live clock (mono). */
function MetaRow({ v, tone, className, index }: { v: View; tone?: "dark"; className?: string; index?: boolean }) {
  const labels = v.p.cornerLabels.filter(Boolean).slice(0, 3);
  if (!labels.length && !v.p.clock) return null;
  return (
    <div className={cn("mono-label flex items-center justify-between gap-6", tone === "dark" ? "text-white/75" : "text-muted-foreground", className)}>
      <div className="flex min-w-0 items-center gap-6">
        {labels[0] && <span data-script={isThaiText(labels[0]) ? "thai" : "latin"} className="truncate">{labels[0]}</span>}
        {labels[1] && <span data-script={isThaiText(labels[1]) ? "thai" : "latin"} className="hidden truncate md:inline">{labels[1]}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-6">
        {labels[2] && <span data-script={isThaiText(labels[2]) ? "thai" : "latin"} className="hidden md:inline">{labels[2]}</span>}
        {index && !labels[2] && <span className="hidden md:inline">01 / 0{Math.max(4, Math.min(9, v.ctx.tenant.modules.length + 4))}</span>}
        {v.p.clock && <LiveClock label="BKK" />}
      </div>
    </div>
  );
}

function ScrollCue({ tone }: { tone?: "dark" }) {
  return (
    <a href="#after-hero" aria-label="เลื่อนลง" className={cn("rw-cue group absolute right-[var(--gutter)] bottom-8 z-10 hidden min-h-11 items-center gap-3 md:flex", tone === "dark" ? "text-white/85" : "text-muted-foreground")}>
      <span className="mono-label">Scroll</span>
      <span aria-hidden className="rw-cue-line relative block h-12 w-px overflow-hidden bg-current/30" />
    </a>
  );
}

/** Quiet backdrop for particle / orb scenes (their own posters cover the no-WebGL case). */
function SoftGlow() {
  return <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_55%_at_62%_45%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%),radial-gradient(40%_40%_at_30%_70%,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_70%)]" />;
}

const cardItems = (v: View) => v.cards.map((c) => ({ image: c.image, title: c.title || c.alt, badge: c.tag || undefined, href: c.href }));

/** The visual of split / editorial / stacked heroes: a framed photo + the scene placed by its role. */
function MediaFrame({ v, aspect, frameClass, priority = true, from = "bottom" }: { v: View; aspect: string; frameClass?: string; priority?: boolean; from?: "bottom" | "top" | "left" | "right" | "center" | "circle" }) {
  const { p, scene, preset } = v;
  const role = sceneRole(scene);
  const img = p.image.url;
  const frame = FRAME_BY_PRESET[preset] ?? "rounded-[var(--radius-2xl)]";

  // no photo: objects / orb / particles float free in the column over a soft glow (no empty box)
  if (scene === "card-stack" || (!img && scene !== "none" && scene !== "shader" && scene !== "ocean" && role !== "replace")) {
    return (
      <div className={cn("relative w-full", aspect)}>
        <div aria-hidden className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_32%,transparent),transparent)] blur-2xl" />
        <SceneLayer kind={scene} preset={preset} placement="media" cards={cardItems(v)} words={p.cycleWords} className={scene === "card-stack" || scene === "breathing-orb" ? "absolute inset-0 h-full w-full" : undefined} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={cn("rw-hero-frame relative w-full", role === "replace" ? "" : cn("overflow-hidden bg-muted shadow-float", frame), aspect, frameClass)}>
        {role === "replace" ? (
          <SceneLayer kind={scene} preset={preset} placement="media" image={img} imageAlt={p.image.alt} className="absolute inset-0 h-full w-full" />
        ) : role === "standalone" ? (
          <>
            {scene === "particle-morph" || scene === "breathing-orb" ? <SoftGlow /> : <Poster preset={preset} className="absolute inset-0" />}
            <SceneLayer kind={scene} preset={preset} placement="media" words={p.cycleWords} />
          </>
        ) : img ? (
          <div className="absolute inset-0">
            <ImageReveal src={img} alt={p.image.alt} priority={priority} from={from} parallax={0.06} sizes="(min-width: 1024px) 42vw, 100vw" className="h-full w-full" />
          </div>
        ) : (
          <Poster preset={preset} className="absolute inset-0" />
        )}
      </div>
      {role === "overlay" && (
        <div className={cn("absolute z-10", scene === "floating-objects" && preset === "candy" ? "inset-0" : "pointer-events-none -inset-[7%]")}>
          <SceneLayer kind={scene} preset={preset} placement="media" />
        </div>
      )}
      {role === "standalone" && img && (
        <div className="rw-float absolute -bottom-6 -left-4 z-10 w-[38%] max-w-56 overflow-hidden rounded-[var(--radius-xl)] border-4 border-background shadow-float md:-left-10">
          <Img src={img} alt={p.image.alt} className="aspect-[4/5] w-full object-cover" priority={priority} />
        </div>
      )}
      {p.imageSecondary?.url && role !== "standalone" && (
        <div className="rw-float absolute -bottom-8 -left-6 z-20 hidden w-40 overflow-hidden rounded-[var(--radius-xl)] border-4 border-background shadow-float md:block lg:-left-12 lg:w-48">
          <Img src={p.imageSecondary.url} alt={p.imageSecondary.alt} className="aspect-square w-full object-cover" />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */

function Split({ v }: { v: View }) {
  const { p } = v;
  return (
    <section data-section="hero" data-variant="split" className={cn("rw-hero relative isolate overflow-clip", v.padTop, "pb-14 md:pb-20")}>
      <SectionStyles />
      <HeroBg v={v} />
      <div className="container-x relative">
        <MetaRow v={v} className="mb-8 md:mb-12" index />
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="order-2 lg:order-1 lg:col-span-7">
            {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6" />}
            <HeroHeading v={v} className={headingClass(v, "text-step-5")} />
            <Sub v={v} />
            <Ctas v={v} />
            <Badges items={p.badges} fx={v.fx} />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <MediaFrame v={v} aspect="aspect-square sm:aspect-[4/5] lg:aspect-[4/5]" />
          </div>
        </div>
        <StatsStrip v={v} className="mt-14 md:mt-20" />
      </div>
    </section>
  );
}

function Editorial({ v }: { v: View }) {
  const { p } = v;
  return (
    <section data-section="hero" data-variant="editorial" className={cn("rw-hero relative isolate overflow-clip", v.padTop, "pb-14 md:pb-24")}>
      <SectionStyles />
      <HeroBg v={v} />
      <div className="container-x relative">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4 md:mb-10">
          {p.eyebrow ? <Eyebrow text={p.eyebrow} /> : <span />}
          <MetaRow v={v} className="flex-1 justify-end" index />
        </div>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="order-2 lg:order-1 lg:col-span-7">
            <HeroHeading v={v} className={headingClass(v, "text-step-5")} />
            <div className="mt-8 grid gap-8 md:mt-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <Sub v={v} className="mt-0 text-muted-foreground md:mt-0" />
                <Ctas v={v} className="md:mt-8" />
                <Badges items={p.badges} fx={v.fx} />
              </div>
              {p.imageSecondary?.url && sceneRole(v.scene) !== "standalone" && (
                <div className="hidden w-44 md:block lg:w-52">
                  <ImageReveal src={p.imageSecondary.url} alt={p.imageSecondary.alt} aspect="4/5" from="left" delay={0.4} className="rounded-[var(--radius-xl)]" />
                </div>
              )}
            </div>
          </div>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <MediaFrameNoSecondary v={v} />
          </div>
        </div>
        <StatsStrip v={v} className="mt-14 md:mt-20" />
      </div>
    </section>
  );
}

/** Editorial: the secondary photo already sits next to the copy. */
function MediaFrameNoSecondary({ v }: { v: View }) {
  const vv: View = { ...v, p: { ...v.p, imageSecondary: undefined } };
  return <MediaFrame v={vv} aspect="h-[52svh] sm:h-auto sm:aspect-[4/5] lg:aspect-auto lg:h-[min(62svh,600px)]" from="top" />;
}

function Stacked({ v }: { v: View }) {
  const { p, scene, preset } = v;
  const role = sceneRole(scene);
  return (
    <section data-section="hero" data-variant="stacked" className={cn("rw-hero relative isolate overflow-clip", v.padTop, "pb-14 md:pb-20")}>
      <SectionStyles />
      <HeroBg v={v} />
      <div className="container-x relative">
        <MetaRow v={v} className="mb-8 md:mb-12" />
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6" />}
            <HeroHeading v={v} className={headingClass(v, "text-step-6")} />
          </div>
          <div className="lg:col-span-4 lg:pb-3">
            <Sub v={v} className="mt-0 text-muted-foreground" />
            <Ctas v={v} className="md:mt-8" />
          </div>
        </div>
        <Badges items={p.badges} fx={v.fx} />
      </div>
      <div className="relative mt-12 px-[var(--gutter)] md:mt-16">
        <div className={cn("rw-grow relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-2xl)] bg-muted sm:aspect-[16/9] lg:aspect-[21/9]", v.fx !== "auto" && "rw-grow-off")}>
          {role === "replace" ? (
            <SceneLayer kind={scene} preset={preset} placement="full" image={p.image.url} imageAlt={p.image.alt} className="absolute inset-0 h-full w-full" />
          ) : p.image.url ? (
            <div className="absolute inset-0">
              <ImageReveal src={p.image.url} alt={p.image.alt} priority from="center" parallax={0.08} sizes="100vw" className="h-full w-full" />
            </div>
          ) : (
            <Poster preset={preset} className="absolute inset-0" />
          )}
          {(role === "overlay" || role === "standalone") && scene !== "card-stack" && scene !== "breathing-orb" && (
            <div className="pointer-events-none absolute inset-0">
              <SceneLayer kind={scene} preset={preset} placement="full" words={p.cycleWords} />
            </div>
          )}
        </div>
      </div>
      <div className="container-x">
        <StatsStrip v={v} className="mt-12 md:mt-16" />
      </div>
    </section>
  );
}

function Centered({ v }: { v: View }) {
  const { p, scene, preset } = v;
  // ripple turns the photo into the backdrop; silk / orb / card stack are objects shown under the copy
  const backdropScene = scene === "water-ripple" || scene === "particle-morph" || scene === "floating-objects" || scene === "ocean" || scene === "stage-lights" || scene === "steam" || scene === "shader";
  const mediaScene = scene === "image-silk" || scene === "card-stack" || scene === "breathing-orb";
  const showPhoto = !!p.image.url && scene !== "water-ripple" && scene !== "image-silk";
  return (
    <section data-section="hero" data-variant="centered" className={cn("rw-hero relative isolate flex min-h-[min(100svh,1000px)] flex-col justify-center overflow-clip text-center", v.padTop, "pb-16 md:pb-24")}>
      <SectionStyles />
      {backdropScene ? (
        <div className="absolute inset-0 -z-10">
          <SceneLayer kind={scene} preset={preset} placement="backdrop" image={p.image.url} imageAlt={p.image.alt} words={p.cycleWords} />
          <div aria-hidden className="rw-scrim-radial absolute inset-0" />
        </div>
      ) : (
        <HeroBg v={v} />
      )}
      <div className="container-x relative">
        <MetaRow v={v} className="mb-10 md:mb-14" />
        <div className="mx-auto max-w-5xl">
          {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6 justify-center" />}
          <HeroHeading v={v} align="center" className={cn(headingClass(v, "text-step-6"), "mx-auto")} />
          <Sub v={v} className="mx-auto text-muted-foreground" />
          <Ctas v={v} className="justify-center" />
          <Badges items={p.badges} fx={v.fx} className="justify-center" />
        </div>
        {mediaScene && (
          <Rise fx={v.fx} delay={0.3} className="mx-auto mt-14 w-full max-w-3xl">
            <div className={cn("relative mx-auto w-full", scene === "image-silk" ? "aspect-[4/5] max-w-md" : "aspect-[16/10]")}>
              <SceneLayer kind={scene} preset={preset} placement="media" image={p.image.url} imageAlt={p.image.alt} cards={cardItems(v)} className="absolute inset-0 h-full w-full" />
            </div>
          </Rise>
        )}
        {showPhoto && !mediaScene && (
          <Rise fx={v.fx} delay={0.25} direction="scale" className="mt-14 md:mt-20">
            <TiltCard max={4} className="mx-auto max-w-5xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-2xl)] shadow-float sm:aspect-[16/9]">
                <div className="absolute inset-0">
                  <ImageReveal src={p.image.url} alt={p.image.alt} priority from="center" sizes="(min-width: 1024px) 64rem, 100vw" className="h-full w-full" />
                </div>
              </div>
            </TiltCard>
          </Rise>
        )}
        <StatsStrip v={v} className="mx-auto mt-14 max-w-5xl text-left md:mt-20" />
      </div>
    </section>
  );
}

function Fullscreen({ v }: { v: View }) {
  const { p, scene, preset, index } = v;
  const overlay = scene === "steam" || scene === "stage-lights" || scene === "floating-objects" || scene === "particle-morph" || scene === "shader";
  const ripple = scene === "water-ripple";
  return (
    <>
      <section
        data-section="hero"
        data-variant="fullscreen"
        // data-hero-dark: HeaderShell switches a transparent header to light text over this photo
        data-hero-dark={index === 0 ? "" : undefined}
        className="rw-hero rw-hero-full relative isolate flex min-h-[92svh] items-end overflow-clip text-white"
      >
        <SectionStyles />
        <div className="absolute inset-0 -z-10 overflow-clip bg-neutral-900">
          <div className={cn("absolute inset-0", v.fx === "auto" && "rw-push rw-drift")}>
            {ripple ? (
              <SceneLayer kind={scene} preset={preset} placement="full" image={p.image.url} imageAlt={p.image.alt} />
            ) : p.image.url ? (
              <Img src={p.image.url} alt={p.image.alt} className="size-full object-cover" priority sizes="100vw" />
            ) : (
              <Poster preset={preset} className="absolute inset-0" />
            )}
          </div>
          {overlay && (
            <div className="pointer-events-none absolute inset-0 mix-blend-screen">
              <SceneLayer kind={scene} preset={preset} placement="full" words={p.cycleWords} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" style={{ opacity: Math.max(0.6, Math.min(1, p.overlay + 0.35)) }} />
          <div aria-hidden className="rw-darken absolute inset-0 bg-black" />
        </div>
        <div className="container-x relative pb-14 md:pb-20">
          <MetaRow v={v} tone="dark" className="mb-10 md:mb-16" />
          <div className="max-w-4xl">
            {p.eyebrow && <Eyebrow text={p.eyebrow} tone="inherit" className="mb-6 text-white/85" />}
            <HeroHeading v={v} className={cn(headingClass(v, "text-step-6"), "text-white [text-shadow:0_2px_30px_rgba(0,0,0,.35)]")} />
            <Sub v={v} className="text-white/85" />
            <Ctas v={v} tone="dark" />
            <Badges items={p.badges} fx={v.fx} tone="dark" />
          </div>
        </div>
        <ScrollCue tone="dark" />
      </section>
      <div id="after-hero" />
      {p.stats.length > 0 && (
        <div className="border-b border-border bg-background">
          <div className="container-x">
            <StatsStrip v={v} className="[&>dl]:border-t-0" />
          </div>
        </div>
      )}
    </>
  );
}

function Scatter({ v, id }: { v: View; id: string }) {
  const { p, scene, preset } = v;
  const cards = v.cards.map((c) => ({ image: c.image, alt: c.alt || c.title, title: c.title || undefined, tag: c.tag || undefined }));
  const backdrop = scene !== "none" && scene !== "card-stack" && scene !== "image-silk" && scene !== "breathing-orb";
  return (
    <section data-section="hero" data-variant="scatter" className={cn("rw-hero relative isolate overflow-clip", v.padTop)}>
      <SectionStyles />
      {backdrop ? (
        <div className="absolute inset-0 -z-10">
          <SceneLayer kind={scene} preset={preset} placement="backdrop" image={p.image.url} imageAlt={p.image.alt} words={p.cycleWords} />
          <div aria-hidden className="rw-scrim-radial absolute inset-0" />
        </div>
      ) : (
        <HeroBg v={v} />
      )}
      {v.fx === "off" ? (
        <div className="container-x py-16 text-center">
          <ScatterCopy v={v} />
        </div>
      ) : (
        <ScatterCards cards={cards} seed={`hero-${id}`} density={cards.length > 8 ? "dense" : "airy"} assemble="out" minHeight="min(100svh, 960px)" className="pb-10">
          <ScatterCopy v={v} />
        </ScatterCards>
      )}
      <div className="container-x">
        <StatsStrip v={v} className="mb-10" />
      </div>
    </section>
  );
}

function ScatterCopy({ v }: { v: View }) {
  const { p } = v;
  return (
    <div className="mx-auto max-w-3xl px-2 text-center">
      {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-6 justify-center" />}
      <HeroHeading v={v} align="center" className={cn(headingClass(v, "text-step-5"), "mx-auto")} />
      <Sub v={v} className="mx-auto text-muted-foreground" />
      <Ctas v={v} className="justify-center" />
      <Badges items={p.badges} fx={v.fx} className="justify-center" />
    </div>
  );
}

function Cinematic({ v }: { v: View }) {
  const { p, scene, preset } = v;
  const role = sceneRole(scene);
  const orb = scene === "breathing-orb";
  const photoUnder = !!p.image.url && role !== "replace" && (scene === "none" || scene === "steam" || scene === "stage-lights" || scene === "floating-objects" || scene === "shader");
  const sceneBox = scene === "particle-morph" ? "absolute inset-y-0 right-0 w-full lg:w-[64%]" : scene === "card-stack" ? "absolute inset-y-[12%] right-0 w-full lg:w-[56%]" : "absolute inset-0";

  if (orb) {
    const [l1, ...rest] = p.heading.split("\n");
    const l2 = rest.join(" ").trim();
    return (
      <section data-section="hero" data-variant="cinematic" className={cn("rw-hero relative isolate overflow-clip text-center", v.padTop, "pb-16 md:pb-20")}>
        <SectionStyles />
        <HeroBg v={v} />
        <div className="container-x relative flex min-h-[calc(100svh-7rem)] flex-col items-center justify-center">
          <MetaRow v={v} className="mb-6 w-full" />
          {p.eyebrow && <Eyebrow text={p.eyebrow} className="mb-5 justify-center" />}
          <h1 aria-label={p.heading.replace(/\s*\n\s*/g, " ")} data-script={isThaiText(p.heading) ? "thai" : "latin"} className="rw-h">
            <RevealHeading as="span" text={l1 ?? ""} trigger="mount" mode="words" fx={v.fx} accent={v.accent} className={cn(headingClass(v, "text-step-5"), "block")} />
            <span aria-hidden className="relative mx-auto my-2 block aspect-square w-[min(78vw,46svh,520px)] md:my-4">
              <SceneLayer kind={scene} preset={preset} placement="media" className="absolute inset-0 h-full w-full" />
            </span>
            {l2 && <RevealHeading as="span" text={l2} trigger="mount" mode="words" delay={0.35} fx={v.fx} accent={v.accent} className={cn(headingClass(v, "text-step-5"), "block")} />}
          </h1>
          <Sub v={v} className="mx-auto text-muted-foreground" />
          <Ctas v={v} className="justify-center" />
        </div>
        <StatsStripWrap v={v} />
      </section>
    );
  }

  return (
    <>
      <section
        data-section="hero"
        data-variant="cinematic"
        data-hero-dark={photoUnder && v.index === 0 ? "" : undefined}
        className={cn("rw-hero rw-hero-cine relative isolate flex min-h-[100svh] flex-col overflow-clip", photoUnder && "text-white")}
      >
        <SectionStyles />
        <div className="absolute inset-0 -z-10">
          {photoUnder ? (
            <div className={cn("absolute inset-0 bg-neutral-950", v.fx === "auto" && "rw-push")}>
              <Img src={p.image.url} alt={p.image.alt} className="size-full object-cover opacity-80" priority sizes="100vw" />
            </div>
          ) : role === "replace" ? null : scene === "particle-morph" || scene === "card-stack" ? (
            <SoftGlow />
          ) : (
            <Poster preset={preset} className="absolute inset-0 opacity-70" />
          )}
          {scene !== "none" && (
            <div className={cn(role === "overlay" ? "pointer-events-none absolute inset-0" : sceneBox)}>
              <SceneLayer kind={scene} preset={preset} placement="full" image={p.image.url} imageAlt={p.image.alt} cards={cardItems(v)} words={p.cycleWords} />
            </div>
          )}
          <div aria-hidden className={cn("absolute inset-0", photoUnder ? "bg-gradient-to-t from-black/85 via-black/35 to-black/20" : "rw-scrim-bottom")} />
        </div>
        <div className={cn("container-x relative flex flex-1 flex-col justify-between", v.padTop, "pb-12 md:pb-16")}>
          <MetaRow v={v} tone={photoUnder ? "dark" : undefined} />
          <div className="mt-auto grid gap-8 pt-24 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              {p.eyebrow && <Eyebrow text={p.eyebrow} tone={photoUnder ? "inherit" : "primary"} className={cn("mb-6", photoUnder && "text-white/85")} />}
              <HeroHeading v={v} className={cn(headingClass(v, "text-step-6"), photoUnder && "text-white")} />
            </div>
            <div className="lg:col-span-4 lg:pb-3">
              <Sub v={v} className={cn("mt-0 md:mt-0", photoUnder ? "text-white/85" : "text-muted-foreground")} />
              <Ctas v={v} tone={photoUnder ? "dark" : "default"} className="md:mt-8" />
              <Badges items={p.badges} fx={v.fx} tone={photoUnder ? "dark" : undefined} />
            </div>
          </div>
        </div>
        <ScrollCue tone={photoUnder ? "dark" : undefined} />
      </section>
      <div id="after-hero" />
      <StatsStripWrap v={v} />
    </>
  );
}

function StatsStripWrap({ v }: { v: View }) {
  if (!v.p.stats.length) return null;
  return (
    <div className="container-x">
      <StatsStrip v={v} className="[&>dl]:border-t-0" />
    </div>
  );
}

export function Hero({ ctx, props: p, index, id }: { ctx: StorefrontCtx; props: Props; index: number; id?: string }) {
  const fx = fxOf(p);
  const cards = p.cards.filter((c) => c.image);
  const v: View = {
    p,
    ctx,
    fx,
    preset: presetKey(ctx),
    scene: resolveScene(ctx, p.scene, fx, { image: p.image.url, cards: cards.length }),
    accent: hasAccentFont(ctx),
    index,
    padTop: ctx.theme.layout.headerTransparent && index === 0 ? "pt-28 md:pt-36" : "pt-10 md:pt-16",
    cards,
  };
  switch (p.variant) {
    case "fullscreen":
      return <Fullscreen v={v} />;
    case "editorial":
      return <Editorial v={v} />;
    case "centered":
      return <Centered v={v} />;
    case "stacked":
      return <Stacked v={v} />;
    case "scatter":
      return cards.length >= 3 ? <Scatter v={v} id={id ?? "hero"} /> : <Centered v={v} />;
    case "cinematic":
      return <Cinematic v={v} />;
    default:
      return <Split v={v} />;
  }
}

