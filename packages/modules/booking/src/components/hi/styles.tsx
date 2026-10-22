import * as React from "react";

/**
 * Booking-module CSS (hi-end redesign). Hoisted + de-duplicated by React 19 (`<style href precedence>`), so every
 * component may render <BookingStyles/> and it lands once in <head>. Theme tokens only (tenants recolour everything).
 * Hidden start states / loops only under `prefers-reduced-motion: no-preference`; reduced motion = final state.
 */
const CSS = /* css */ `
@layer components {
  /* ---------- frames (motif per business) ---------- */
  /* min-height:0: with overflow:clip (not a scroll container) an aspect-ratio box grows to its content, so a portrait photo
     stretched a 4:3 frame to ~1:2 (course /classes "Prenatal", "Mat Pilates" on phones) */
  .bk-frame { position: relative; isolation: isolate; overflow: clip; background: var(--muted); min-height: 0; }
  .bk-arch { border-radius: 999px 999px calc(var(--radius, .75rem) * 1.25) calc(var(--radius, .75rem) * 1.25); }
  .bk-soft { border-radius: calc(var(--radius, .75rem) * 2 + .5rem); }
  .bk-round { border-radius: calc(var(--radius, .75rem) * 1.5); }
  .bk-capsule { border-radius: 999px; }
  .bk-pebble { border-radius: 46% 54% 44% 56% / 38% 42% 58% 62%; transition: border-radius 1.6s var(--ease-out-quart, ease); }
  .group:hover .bk-pebble, .group:focus-within .bk-pebble { border-radius: 54% 46% 58% 42% / 44% 52% 48% 56%; }
  .bk-frame > img, .bk-frame .bk-cover { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bk-zoom img { transition: transform 1.2s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)), filter .7s var(--ease-out-quart, ease); }
  :is(.group:hover, .group:focus-within) .bk-zoom img { transform: scale(1.05); }
  .bk-mono { filter: saturate(.18) contrast(1.03); }
  :is(.group:hover, .group:focus-within) .bk-mono, .bk-mono:hover { filter: none; }

  /* ---------- glass / surfaces ---------- */
  .bk-glass { background: color-mix(in oklab, var(--background) 64%, transparent); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid color-mix(in oklab, var(--foreground) 11%, transparent); }
  .bk-panel { background: var(--card); color: var(--card-foreground); border: 1px solid color-mix(in oklab, var(--foreground) 9%, transparent); border-radius: calc(var(--radius, .75rem) * 1.6); }
  .bk-float { box-shadow: 0 30px 80px -28px color-mix(in oklab, var(--foreground) 32%, transparent); }
  .bk-glow-hover { transition: box-shadow .5s var(--ease-out-quart, ease), transform .5s var(--ease-out-quart, ease), border-color .3s; }
  .bk-glow-hover:hover, .bk-glow-hover:focus-within { box-shadow: 0 24px 70px -24px color-mix(in oklab, var(--glow) 70%, transparent); transform: translateY(-6px); border-color: color-mix(in oklab, var(--primary) 30%, transparent); }
  .bk-hairline { border-color: color-mix(in oklab, var(--foreground) 12%, transparent); }
  .bk-soft-bg { background: radial-gradient(120% 90% at 85% 0%, color-mix(in oklab, var(--primary-soft) 100%, transparent), transparent 60%), radial-gradient(90% 80% at 0% 100%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%); }

  /* ---------- intro ---------- */
  .bk-intro-title { font-size: var(--step-6, clamp(3.25rem, 1.8rem + 6.6vw, 8.5rem)); line-height: var(--leading-thai-display, 1.25); }
  .bk-intro-title[data-script="latin"] { line-height: .95; }
  .bk-count { font-family: var(--font-accent, var(--font-display)); font-variant-numeric: tabular-nums; line-height: 1; letter-spacing: -.02em; }
  .bk-draw { transform-origin: left; }

  /* ---------- phone rail (home service cards): horizontal snap scroller that bleeds to the screen edges ---------- */
  @media (max-width: 639.98px) {
    .bk-rail { overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none;
      margin-inline: calc(-1 * clamp(1rem, 4vw, 2.5rem)); padding-inline: clamp(1rem, 4vw, 2.5rem); scroll-padding-inline: clamp(1rem, 4vw, 2.5rem); padding-bottom: .5rem; }
    .bk-rail::-webkit-scrollbar { display: none; }
  }

  /* ---------- filter pills ---------- */
  .bk-pills { scrollbar-width: none; }
  .bk-pills::-webkit-scrollbar { display: none; }

  /* ---------- editorial rows (spa menu / service index) ---------- */
  .bk-row { position: relative; isolation: isolate; }
  .bk-row::before { content: ""; position: absolute; inset: 0 -1rem; z-index: -1; border-radius: calc(var(--radius, .75rem) * 1.2); background: var(--primary-soft); transform: scaleY(0); transform-origin: bottom; transition: transform .6s var(--ease-out-expo, ease); }
  .bk-row:hover::before, .bk-row:focus-within::before { transform: scaleY(1); }
  .bk-row .bk-row-name { transition: transform .6s var(--ease-out-expo, ease); }
  .bk-row:hover .bk-row-name { transform: translateX(.5rem); }
  .bk-leader { flex: 1; min-width: 1.5rem; border-bottom: 1px dotted color-mix(in oklab, var(--foreground) 35%, transparent); transform: translateY(-.35em); }
  .bk-stretch::after { content: ""; position: absolute; inset: 0; z-index: 0; }
  .bk-above { position: relative; z-index: 1; }

  /* ---------- portraits ---------- */
  .bk-reveal-body { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .6s var(--ease-out-expo, ease), opacity .45s var(--ease-out-quart, ease); }
  .bk-reveal-body > * { overflow: hidden; min-height: 0; }
  :is(.group:hover, .group:focus-within) .bk-reveal-body { grid-template-rows: 1fr; opacity: 1; }

  /* ---------- passes / tickets ---------- */
  .bk-perf { position: relative; border-top: 2px dashed color-mix(in oklab, var(--foreground) 16%, transparent); }
  /* ticket notches: half circles cut at both ends of the perforation (the card clips the outer halves) */
  .bk-notched::before, .bk-notched::after { content: ""; position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bk-notch, var(--background)); }
  .bk-notched::before { left: -11px; } .bk-notched::after { right: -11px; }
  .bk-foil { background: linear-gradient(115deg, transparent 20%, color-mix(in oklab, var(--glow) 40%, transparent) 38%, color-mix(in oklab, var(--accent) 30%, transparent) 50%, transparent 66%); background-size: 260% 100%; background-position: 100% 0; transition: background-position 1.2s var(--ease-out-quart, ease); mix-blend-mode: soft-light; }
  .group:hover .bk-foil { background-position: 0 0; }
  .bk-pass-num { font-family: var(--font-accent, var(--font-display)); font-size: clamp(4.5rem, 3rem + 5vw, 8rem); line-height: .8; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }

  /* ---------- wizard / operational ---------- */
  .bk-step-line { position: absolute; left: 0; top: 50%; height: 2px; translate: 0 -50%; background: var(--primary); transform-origin: left; transition: transform .6s var(--ease-out-expo, ease); }
  .bk-choice { transition: border-color .2s, background-color .2s, box-shadow .3s var(--ease-out-quart, ease), transform .3s var(--ease-out-quart, ease); }
  .bk-choice:hover { transform: translateY(-2px); }
  .bk-choice[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--primary), 0 18px 40px -22px color-mix(in oklab, var(--primary) 60%, transparent); }
  .bk-choice:active { transform: scale(.98); }
  .bk-check path { stroke-dasharray: 40; stroke-dashoffset: 0; }

  /* ---------- timetable ---------- */
  .bk-tt[data-hl] .bk-cell:not([data-hl-on]) { opacity: .38; }
  .bk-cell { transition: opacity .35s var(--ease-out-quart, ease), transform .35s var(--ease-out-quart, ease), box-shadow .35s, border-color .2s; }
  .bk-cell[data-hl-on] { border-color: var(--primary); box-shadow: 0 14px 34px -20px color-mix(in oklab, var(--primary) 70%, transparent); }
  .bk-meter { height: 3px; border-radius: 99px; background: color-mix(in oklab, var(--foreground) 10%, transparent); overflow: hidden; }
  .bk-meter > i { display: block; height: 100%; border-radius: inherit; background: var(--primary); transform-origin: left; }
  .bk-now { position: relative; height: 0; border-top: 1.5px solid var(--primary); margin-block: .65rem; }
  .bk-now::before { content: ""; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 99px; background: var(--primary); }
}

@media (prefers-reduced-motion: no-preference) {
  @keyframes bk-pop { from { opacity: 0; transform: translateY(8px) scale(.92); } to { opacity: 1; transform: none; } }
  @keyframes bk-flash { 0% { background-color: color-mix(in oklab, var(--primary) 22%, transparent); } 100% { background-color: transparent; } }
  @keyframes bk-draw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
  @keyframes bk-breathe { 0%, 100% { transform: scale(.82); opacity: .55; } 50% { transform: scale(1); opacity: 1; } }
  @keyframes bk-float { 0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); } 50% { transform: translateY(-10px) rotate(var(--r, 0deg)); } }
  @keyframes bk-ping { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(2.4); opacity: 0; } }
  @keyframes bk-shape { 0%, 100% { border-radius: 46% 54% 44% 56% / 38% 42% 58% 62%; } 50% { border-radius: 54% 46% 58% 42% / 44% 52% 48% 56%; } }
  .bk-pop { animation: bk-pop .5s var(--ease-out-expo, ease) both; animation-delay: calc(var(--i, 0) * 28ms); }
  .bk-flash { animation: bk-flash .6s var(--ease-out-quart, ease); border-radius: .375rem; }
  .bk-check path { animation: bk-draw .8s .25s var(--ease-out-expo, ease) both; }
  .bk-breathe { animation: bk-breathe 6s ease-in-out infinite; }
  .bk-floaty { animation: bk-float 7s ease-in-out infinite; animation-delay: var(--d, 0s); }
  .bk-ping { animation: bk-ping 2.4s var(--ease-out-quart, ease) infinite; }
  .bk-pebble-live { animation: bk-shape 14s ease-in-out infinite; }
  .bk-now::before { animation: bk-ping 2s ease-out infinite; }
}
`;

export function BookingStyles() {
  return (
    <style href="rw-booking-hi" precedence="default">
      {CSS}
    </style>
  );
}
