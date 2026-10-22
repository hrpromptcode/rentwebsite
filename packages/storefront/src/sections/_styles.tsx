import * as React from "react";

/**
 * Section-level CSS for the hi-end storefront sections (docs/design/hi-end-direction.md §7). Hoisted + de-duplicated by
 * React 19 (`<style href precedence>`), so every Section can render <SectionStyles/> and it lands once in <head>.
 *
 * Rules:
 * - colours are theme tokens only (tenants recolour everything);
 * - hidden start states exist only under `prefers-reduced-motion: no-preference` (+ `scripting: enabled` where JS
 *   flips the state), so reduced motion / no-JS / crawlers always see final content;
 * - scroll-linked effects use CSS scroll-driven animations (`animation-timeline: view()`) as progressive enhancement:
 *   no JS on scroll, nothing to break when unsupported;
 * - the base rules live in `@layer components` so Tailwind utilities passed in className still win; a few overrides
 *   that must beat utilities (Radix accordion keyframes) are unlayered at the end;
 * - `[data-fx="off"]` (per-section effects off) freezes every section animation.
 */
const CSS = /* css */ `
@layer components {
  :root { --rw-night: var(--foreground); --rw-night-fg: var(--background); --rw-ease: var(--ease-out-expo, cubic-bezier(.16,1,.3,1)); }
  :root.dark { --rw-night: color-mix(in oklab, var(--background) 82%, black); --rw-night-fg: var(--foreground); }

  /* ---------- rhythm + type ---------- */
  .rw-sec { padding-block: calc(clamp(4.5rem, 9vw, 9.5rem) * var(--density, 1)); }
  .rw-h[data-script="thai"], .rw-h[data-script="mixed"] { line-height: var(--leading-thai-display, 1.25); letter-spacing: 0; text-transform: none; }
  .rw-h[data-script="latin"] { line-height: 1.02; }
  .heading-display.rw-h[data-script="latin"] { line-height: .94; }
  .rw-h :is([data-split-mask]) { padding-block: 0.02em; }
  .rw-display-num { font-family: var(--font-accent); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .rw-outline-text { color: transparent; -webkit-text-stroke: 1.5px currentColor; }

  /* ---------- buttons ---------- */
  .rw-arrow-a, .rw-arrow-b { transition: transform var(--dur-ui, 320ms) var(--ease-out-quart, ease); }
  .rw-arrow-b { transform: translateX(-130%); }
  :where(a, button):is(:hover, :focus-visible) .rw-arrow-a { transform: translateX(130%); }
  :where(a, button):is(:hover, :focus-visible) .rw-arrow-b { transform: translateX(0); }
  .rw-round-cta { position: relative; display: inline-grid; place-items: center; aspect-ratio: 1; width: clamp(8.5rem, 13vw, 12rem); border-radius: 9999px; text-align: center; padding: 1.25rem; font-weight: 600; line-height: 1.25;
    transition: transform var(--dur-ui) var(--ease-out-quart), background-color var(--dur-ui) var(--ease-out-quart), color var(--dur-ui) var(--ease-out-quart); }
  .rw-round-cta:hover { transform: scale(1.06); }
  .rw-round-cta:active { transform: scale(.97); }
  .rw-round-cta::after { content: ""; position: absolute; inset: -10px; border-radius: inherit; border: 1px solid currentColor; opacity: .35; transition: inset var(--dur-ui) var(--ease-out-quart), opacity var(--dur-ui); }
  .rw-round-cta:hover::after { inset: -16px; opacity: .2; }

  /* ---------- eyebrow ---------- */
  .rw-eyebrow .rw-rule { transform-origin: left; }

  /* ---------- hero ---------- */
  .rw-hero { view-timeline: --rwhero block; }
  .rw-darken { opacity: 0; pointer-events: none; }
  .rw-scrim-radial { background: radial-gradient(ellipse 62% 58% at 50% 48%, color-mix(in oklab, var(--background) 88%, transparent) 0%, color-mix(in oklab, var(--background) 66%, transparent) 52%, color-mix(in oklab, var(--background) 22%, transparent) 100%); }
  .rw-scrim-bottom { background:
      linear-gradient(to top, var(--background) 0%, color-mix(in oklab, var(--background) 78%, transparent) 22%, transparent 62%),
      linear-gradient(to right, color-mix(in oklab, var(--background) 72%, transparent) 0%, transparent 58%); }
  .rw-cue-line::after { content: ""; position: absolute; inset: 0; background: currentColor; transform: translateY(-101%); }
  .rw-hero-frame { isolation: isolate; }
  .rw-grow { transform-origin: 50% 0; }

  /* ---------- cards / rows ---------- */
  .rw-lift { transition: transform var(--dur-base, 350ms) var(--ease-out-quart), box-shadow var(--dur-base, 350ms) var(--ease-out-quart), border-color var(--dur-base) var(--ease-out-quart); }
  .rw-lift:hover { transform: translateY(-6px); box-shadow: var(--shadow-float); }
  .rw-zoom { overflow: hidden; }
  .rw-zoom img { transition: transform 1.1s var(--rw-ease), filter .6s var(--ease-out-quart); }
  :is(.rw-zoom:hover, .group:hover > .rw-zoom, .group:focus-visible .rw-zoom) img { transform: scale(1.05); }
  .rw-icon-tile { transition: transform var(--dur-ui) var(--ease-out-quart), background-color var(--dur-ui), color var(--dur-ui); }
  .group:hover .rw-icon-tile { transform: rotate(-8deg) scale(1.06); background: var(--primary); color: var(--primary-foreground); }
  .rw-row { position: relative; isolation: isolate; }
  .rw-row::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--primary-soft); transform: scaleY(0); transform-origin: bottom; transition: transform .55s var(--rw-ease); }
  .rw-row:hover::before, .rw-row:focus-within::before { transform: scaleY(1); }
  .rw-row .rw-row-title { transition: transform .55s var(--rw-ease); }
  .rw-row:hover .rw-row-title { transform: translateX(.6rem); }
  .rw-row .rw-row-idx { transition: color var(--dur-ui); }
  .rw-row:hover .rw-row-idx { color: var(--primary); }
  .rw-row .rw-row-arrow { opacity: 0; transform: translateX(-.75rem) rotate(-45deg); transition: opacity var(--dur-ui), transform .55s var(--rw-ease); }
  .rw-row:hover .rw-row-arrow, .rw-row:focus-within .rw-row-arrow { opacity: 1; transform: none; }
  .rw-row { view-timeline: --rwrow block; }
  .rw-unfold { display: grid; grid-template-rows: 1fr; }
  .rw-unfold > * { overflow: hidden; min-height: 0; }

  /* portraits */
  .rw-portrait img { filter: saturate(.15) contrast(1.04); transition: filter .7s var(--ease-out-quart), transform 1.1s var(--rw-ease); }
  .group:hover .rw-portrait img, .group:focus-visible .rw-portrait img { filter: none; transform: scale(1.04); }

  /* arch / pill frames (clinic, spa, studio motifs) */
  .rw-arch { border-radius: 999px 999px var(--radius-xl) var(--radius-xl); }
  .rw-plate { border-radius: 9999px; }

  /* ---------- chips (contact / story) ---------- */
  .rw-chip-btn { min-height: 44px; display: inline-flex; align-items: center; gap: .5rem; border-radius: 9999px; border: 1px solid var(--border); padding: .5rem 1.1rem; font-size: .9375rem; transition: background-color var(--dur-micro) var(--ease-out-quart), color var(--dur-micro), border-color var(--dur-micro), transform var(--dur-micro); }
  .rw-chip-btn:hover { border-color: var(--foreground); }
  .rw-chip-btn:active { transform: scale(.97); }
  .rw-chip-btn[aria-pressed="true"] { background: var(--foreground); color: var(--background); border-color: var(--foreground); }

  /* ---------- floating-label fields ---------- */
  .rw-ff { position: relative; }
  .rw-ff > label { position: absolute; left: .9rem; top: 1.05rem; z-index: 1; pointer-events: none; color: var(--muted-foreground); font-size: 1rem; line-height: 1.2; transform-origin: left top; transition: transform var(--dur-ui) var(--ease-out-quart), color var(--dur-ui); }
  .rw-ff:has(:is(input, textarea):focus, :is(input, textarea):not(:placeholder-shown)) > label { transform: translateY(-.62rem) scale(.78); color: var(--foreground); }
  .rw-ff:has(:is(input, textarea):focus) > label { color: var(--primary-ink, var(--primary)); }
  .rw-ff :is(input, textarea)::placeholder { color: transparent; transition: color var(--dur-ui); }
  .rw-ff :is(input, textarea):focus::placeholder { color: var(--muted-foreground); }
  .rw-ff::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--primary); transform: scaleX(0); transform-origin: left; transition: transform .45s var(--rw-ease); border-radius: 2px; }
  .rw-ff:focus-within::after { transform: scaleX(1); }

  /* ---------- testimonials ---------- */
  .rw-quote-mark path { fill: none; stroke: currentColor; stroke-width: 2; }
  .rw-chat-thread .rw-bubble { position: relative; }
  .rw-chat-thread .rw-typing { position: absolute; top: 0; display: inline-flex; gap: 4px; padding: .8rem .95rem; border-radius: 1.1rem; background: var(--muted); opacity: 0; pointer-events: none; }
  .rw-chat-thread .rw-typing i { width: 6px; height: 6px; border-radius: 9999px; background: var(--muted-foreground); }

  /* ---------- faq ---------- */
  .rw-plus { position: relative; display: inline-block; width: 1.05rem; height: 1.05rem; transition: transform .5s var(--rw-ease); }
  .rw-plus::before, .rw-plus::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1.5px; margin-top: -.75px; background: currentColor; border-radius: 2px; }
  .rw-plus::after { transform: rotate(90deg); }
  [data-state="open"] > .rw-faq-q .rw-plus, [data-state="open"] .rw-plus { transform: rotate(135deg); }
  .rw-faq-trigger[data-state="open"] .rw-faq-icon { background: var(--foreground); color: var(--background); }
  .rw-faq-icon { transition: background-color var(--dur-ui), color var(--dur-ui); }

  /* ---------- gallery ---------- */
  .rw-polaroid { background: color-mix(in oklab, var(--card) 96%, white); color: var(--card-foreground); padding: .7rem .7rem 2.6rem; box-shadow: 0 22px 50px -24px color-mix(in oklab, var(--foreground) 45%, transparent), 0 2px 6px color-mix(in oklab, var(--foreground) 10%, transparent); border-radius: 4px; touch-action: none; cursor: grab; }
  .rw-polaroid:active { cursor: grabbing; }
  .rw-masonry-col { will-change: transform; }

  /* ---------- steps ---------- */
  .rw-steps-line { transform-origin: left center; }
  .rw-vline { transform-origin: top center; }
  .rw-stack-card { position: sticky; top: calc(var(--header-h, 0px) + 1.5rem + var(--i, 0) * 1.4rem); }
  @media (max-width: 767px) { .rw-stack-card { top: calc(var(--header-h, 0px) + 1rem + var(--i, 0) * .9rem); } }

  /* ---------- sticky story stage frames ---------- */
  .rw-story-media { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .rw-story-media img { width: 100%; height: 100%; object-fit: cover; }
  .rw-story-media[data-style="arch"] { border-radius: 999px 999px var(--radius-xl) var(--radius-xl); }
  .rw-story-media[data-style="plate"] { border-radius: 9999px; aspect-ratio: 1; height: auto; margin: auto; box-shadow: 0 40px 90px -40px color-mix(in oklab, var(--foreground) 55%, transparent); }
  .rw-story-media[data-style="device"] { border-radius: 2.4rem; border: 10px solid var(--rw-night); box-shadow: var(--shadow-float); max-width: 22rem; margin-inline: auto; }

  /* ---------- project list ---------- */
  .rw-proj-title { transition: transform .6s var(--rw-ease), color var(--dur-ui); }
  .rw-proj:hover .rw-proj-title, .rw-proj:focus-visible .rw-proj-title { transform: translateX(1rem); }
  .rw-proj:hover .rw-proj-meta { color: var(--foreground); }

  /* ---------- giant wordmark ---------- */
  .rw-wm-gradient [data-gw-text] { background: linear-gradient(100deg, var(--primary), var(--accent) 55%, var(--glow)); -webkit-background-clip: text; background-clip: text; color: transparent; }

  /* ---------- logos ---------- */
  .rw-logo-img { filter: grayscale(1); opacity: .6; transition: filter var(--dur-ui), opacity var(--dur-ui); }
  .rw-logo-img:hover { filter: none; opacity: 1; }
  .rw-logo-name { opacity: .55; transition: opacity var(--dur-ui), color var(--dur-ui); }
  .rw-logo-name:hover { opacity: 1; color: var(--primary-ink, var(--primary)); }

  /* ---------- video ---------- */
  .rw-play::before { content: ""; position: absolute; inset: -14px; border-radius: inherit; border: 1px solid currentColor; opacity: .4; }

  /* ---------- swipe rows (calm / mobile) ---------- */
  .rw-swipe { display: flex; gap: var(--gutter); overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-inline: max(var(--gutter), calc((100vw - var(--container, 80rem)) / 2 + var(--gutter))); padding-bottom: .5rem; }
  .rw-swipe::-webkit-scrollbar { display: none; }
  .rw-swipe > * { scroll-snap-align: start; flex-shrink: 0; }

  /* ================================================================ motion (no-preference only) */
  @media (prefers-reduced-motion: no-preference) {
    .rw-fade { animation: rw-fade .5s var(--ease-out-quart) both; }
    .rw-float { animation: rw-float 7s ease-in-out infinite; }
    .rw-push > * { animation: rw-push 2.4s var(--rw-ease) both; }
    .rw-cue-line::after { animation: rw-cue 2.4s var(--ease-in-out-circ, ease-in-out) infinite; }
    .rw-chat-thread:not([data-state="in"]) .rw-bubble { opacity: 0; transform: translateY(14px) scale(.96); }
    .rw-chat-thread[data-state="in"] .rw-bubble { animation: rw-pop .6s var(--ease-spring, cubic-bezier(.34,1.56,.64,1)) both; animation-delay: calc(var(--i, 0) * .45s + .55s); }
    .rw-chat-thread[data-state="in"] .rw-typing { animation: rw-typing .75s linear forwards; animation-delay: calc(var(--i, 0) * .45s - .2s); }
    .rw-chat-thread[data-state="in"] .rw-typing i { animation: rw-dot 1s ease-in-out infinite; }
    .rw-chat-thread[data-state="in"] .rw-typing i:nth-child(2) { animation-delay: .15s; }
    .rw-chat-thread[data-state="in"] .rw-typing i:nth-child(3) { animation-delay: .3s; }
    .rw-pulse-ring::after { content: ""; position: absolute; inset: 0; border-radius: inherit; border: 1.5px solid currentColor; animation: rw-ring 2.4s var(--ease-out-quart) infinite; }
    .rw-wobble:hover { animation: rw-wobble .7s var(--ease-spring) both; }

    @supports (animation-timeline: view()) {
      .rw-drift { animation: rw-drift linear both; animation-timeline: --rwhero; animation-range: exit 0% exit 100%; }
      .rw-darken { animation: rw-darken linear both; animation-timeline: --rwhero; animation-range: exit 0% exit 100%; }
      .rw-grow:not(.rw-grow-off) { animation: rw-grow linear both; animation-timeline: view(); animation-range: entry 0% cover 48%; }
      .rw-draw-line, .rw-steps-line { animation: rw-scale-x linear both; animation-timeline: view(); animation-range: entry 15% cover 45%; }
      .rw-vline { animation: rw-scale-y linear both; animation-timeline: view(); animation-range: entry 20% cover 70%; }
      .rw-eyebrow .rw-rule { animation: rw-scale-x linear both; animation-timeline: view(); animation-range: entry 10% cover 30%; }
      .rw-draw-icon svg :is(path, circle, line, polyline, rect, polygon, ellipse) { stroke-dasharray: 96; stroke-dashoffset: 96; animation: rw-dash linear both; animation-timeline: view(); animation-range: entry 15% cover 40%; }
      .rw-quote-mark path { stroke-dasharray: 220; stroke-dashoffset: 220; animation: rw-dash linear both; animation-timeline: view(); animation-range: entry 10% cover 40%; }
      .rw-par { animation: rw-par linear both; animation-timeline: view(); animation-range: cover; }
      .rw-step-node { animation: rw-node linear both; animation-timeline: view(); animation-range: entry 35% cover 45%; }
      .rw-big-num { animation: rw-num-in linear both; animation-timeline: view(); animation-range: entry 0% cover 35%; }
      .rw-tilt-in { animation: rw-tilt-in linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; }
      .rw-unfold { animation: rw-unfold linear both; animation-timeline: --rwrow; animation-range: entry 100% cover 48%; }
    }
    /* page intros sit above the fold: their rule draws once on mount instead of half-scrubbing with the scroll */
    .rw-intro > .rw-draw-line { transform-origin: left; animation: rw-scale-x .9s var(--ease-out-quart, cubic-bezier(.25,1,.5,1)) .35s both; animation-timeline: auto; animation-range: normal; }
    .rw-intro.text-center > .rw-draw-line { transform-origin: center; }
  }

  @media (max-width: 767px) { .rw-par-md { animation: none !important; transform: none !important; } }

  /* per-section effects off: everything final, nothing moves */
  [data-fx="off"] :is(.rw-fade, .rw-float, .rw-push > *, .rw-drift, .rw-darken, .rw-grow, .rw-draw-line, .rw-steps-line, .rw-vline, .rw-rule, .rw-draw-icon svg *, .rw-quote-mark path, .rw-par, .rw-step-node, .rw-big-num, .rw-tilt-in, .rw-unfold, .rw-bubble, .rw-typing) { animation: none !important; }
  [data-fx="off"] .rw-cue-line::after, [data-fx="off"] .rw-pulse-ring::after { animation: none !important; }
  [data-fx="off"] .rw-draw-icon svg *, [data-fx="off"] .rw-quote-mark path { stroke-dasharray: none; stroke-dashoffset: 0; }
  [data-fx="off"] .rw-chat-thread .rw-bubble { opacity: 1; transform: none; }
}

@keyframes rw-fade { from { opacity: 0; transform: translateY(8px); } }
@keyframes rw-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes rw-push { from { transform: scale(1.08); } to { transform: scale(1); } }
@keyframes rw-cue { 0% { transform: translateY(-101%); } 55% { transform: translateY(0); } 100% { transform: translateY(101%); } }
@keyframes rw-drift { from { transform: translateY(0); } to { transform: translateY(14%); } }
@keyframes rw-darken { from { opacity: 0; } to { opacity: .6; } }
@keyframes rw-grow { from { transform: scale(.86); border-radius: calc(var(--radius-2xl, 1.5rem) * 1.6); } to { transform: scale(1); } }
@keyframes rw-scale-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes rw-scale-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes rw-dash { to { stroke-dashoffset: 0; } }
@keyframes rw-par { from { transform: translateY(var(--par, 8%)); } to { transform: translateY(calc(var(--par, 8%) * -1)); } }
@keyframes rw-node { from { transform: scale(.6); opacity: .35; } to { transform: scale(1); opacity: 1; } }
@keyframes rw-num-in { from { transform: translateY(35%); opacity: .2; } to { transform: none; opacity: 1; } }
@keyframes rw-tilt-in { from { transform: rotate(var(--tilt, 10deg)) translateY(14%); } to { transform: none; } }
@keyframes rw-pop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes rw-typing { 0%, 78% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rw-dot { 0%, 100% { transform: translateY(0); opacity: .45; } 50% { transform: translateY(-3px); opacity: 1; } }
@keyframes rw-ring { from { transform: scale(1); opacity: .6; } to { transform: scale(1.55); opacity: 0; } }
@keyframes rw-wobble { 0% { transform: rotate(0); } 30% { transform: rotate(-3deg) scale(1.02); } 60% { transform: rotate(2deg); } 100% { transform: rotate(0); } }
@keyframes rw-acc-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes rw-acc-up { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
@keyframes rw-unfold { from { grid-template-rows: 0fr; opacity: 0; } to { grid-template-rows: 1fr; opacity: 1; } }
@keyframes rw-rise { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: none; } }

/* ---------- unlayered: contact map tinted to the theme (§5.0) — light: grayscale + primary colour wash; dark presets:
   the map is inverted into a night map and the wash uses screen, so it never sits as a light block on a dark page ---------- */
.rw-map-frame { filter: grayscale(.85); transition: filter .7s var(--ease-out-quart, ease); }
.rw-map-tint { mix-blend-mode: color; opacity: .25; transition: opacity .7s var(--ease-out-quart, ease); }
.group:hover .rw-map-frame { filter: grayscale(0); }
.group:hover .rw-map-tint { opacity: 0; }
:root.dark .rw-map-frame { filter: invert(.9) hue-rotate(180deg) grayscale(.75) brightness(.92) contrast(.95); }
:root.dark .group:hover .rw-map-frame { filter: invert(.9) hue-rotate(180deg) grayscale(.15) brightness(.95) contrast(.95); }
:root.dark .rw-map-tint { mix-blend-mode: screen; opacity: .16; }
:root.dark .group:hover .rw-map-tint { opacity: 0; }

/* ---------- unlayered: sticky-story stage tones follow the active step (theme tokens only; night remaps the text
   tokens so every text stays AA; dark themes get --rw-night = a deepened background) ---------- */
.rw-story-toned { --rw-tod: var(--background); background-color: var(--rw-tod); color: var(--foreground); }
.rw-story-toned:has([data-story-item][data-tone="soft"][data-active="true"]) { --rw-tod: color-mix(in oklab, var(--glow) 20%, var(--background)); }
.rw-story-toned:has([data-story-item][data-tone="accent"][data-active="true"]) { --rw-tod: color-mix(in oklab, var(--accent) 13%, var(--background)); }
.rw-story-toned:has([data-story-item][data-tone="glow"][data-active="true"]) { --rw-tod: color-mix(in oklab, var(--glow) 58%, var(--background)); }
.rw-story-toned:has([data-story-item][data-tone="night"][data-active="true"]) {
  --rw-tod: var(--rw-night); --background: var(--rw-night); --foreground: var(--rw-night-fg); --card-foreground: var(--rw-night-fg);
  --muted-foreground: color-mix(in oklab, var(--rw-night-fg) 74%, var(--rw-night)); --border: color-mix(in oklab, var(--rw-night-fg) 16%, transparent);
  --muted: color-mix(in oklab, var(--rw-night-fg) 10%, var(--rw-night));
}
.rw-story-toned:has([data-story-item][data-tone="night"][data-active="true"]) :is([data-story-kicker], .text-primary-ink) { color: color-mix(in oklab, var(--glow) 85%, var(--rw-night-fg)); }
@media (prefers-reduced-motion: no-preference) {
  .rw-story-toned { transition: background-color 1.4s var(--ease-out-quart, ease), color .9s var(--ease-out-quart, ease); }
}

/* ---------- unlayered: must beat Tailwind utilities on the Radix accordion content ---------- */
@media (prefers-reduced-motion: no-preference) {
  .rw-faq [role="region"][data-state="open"] { animation: rw-acc-down .6s var(--ease-out-expo, ease) both; }
  .rw-faq [role="region"][data-state="closed"] { animation: rw-acc-up .38s var(--ease-out-quart, ease) both; }
  .rw-faq [role="region"][data-state="open"] .rw-faq-a { animation: rw-rise .7s .06s var(--ease-out-expo, ease) both; }
}
`;

export function SectionStyles() {
  return (
    <style href="rw-sections" precedence="default">
      {CSS}
    </style>
  );
}
