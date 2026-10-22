import * as React from "react";

/**
 * Rental-module CSS (hotel hero sea band, glass search bar, calendar selection, room cards, panoramic rows, stay
 * status). Hoisted + de-duplicated by React 19 (`<style href precedence>`), so any component may render
 * <RentalStyles/> and it lands once in <head>. Theme tokens only; start states / loops only under
 * `prefers-reduced-motion: no-preference` (reduced motion, no-JS and crawlers always see the final layout).
 */
const CSS = /* css */ `
@layer components {
  /* ---------------- hero: photo on top, WebGL sea band below ---------------- */
  .rw-stay-hero { position: relative; isolation: isolate; }
  .rw-sea { position: absolute; inset-inline: 0; bottom: 0; height: 46%; pointer-events: none; z-index: 1;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.55) 18%, #000 38%); mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.55) 18%, #000 38%);
    opacity: 0; transition: opacity 1.8s var(--ease-out-quart, ease); }
  .rw-sea[data-sea="live"] { opacity: 1; }
  .rw-hero-photo { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
  .rw-hero-photo img { width: 100%; height: 100%; object-fit: cover; }
  .rw-hero-scrim { position: absolute; inset: 0; z-index: 2; pointer-events: none; --s: var(--scrim, .6);
    background:
      /* qa-c: copy pool (heading + sub + badges) — the bright golden-hour sky left the sub at ~2.7:1; now ≥ 4.5:1 at the median */
      radial-gradient(ellipse 64% 50% at 50% 44%, rgb(16 11 6 / calc(var(--s) * .82)) 0%, rgb(16 11 6 / calc(var(--s) * .62)) 50%, rgb(16 11 6 / calc(var(--s) * .22)) 74%, transparent 92%),
      linear-gradient(to bottom, rgb(16 11 6 / calc(var(--s) * .7)) 0%, transparent 26%, transparent 70%, rgb(16 11 6 / calc(var(--s) * .45)) 100%); }
  .rw-hero-copy { text-shadow: 0 1px 2px rgb(0 0 0 / .22), 0 6px 28px rgb(0 0 0 / .18); }
  .rw-hero-sub { text-shadow: 0 1px 2px rgb(0 0 0 / .35), 0 0 22px rgb(16 11 6 / .55); }
  .rw-hero-title { font-size: min(var(--step-6), 12.5svh); }
  @media (max-width: 767px) { .rw-hero-title { font-size: min(var(--step-6), 9.5svh); } }
  .rw-hero-meta { color: rgba(255,255,255,.82); }
  .rw-hero-sun { position: absolute; left: 50%; top: 46%; width: min(60vw, 44rem); aspect-ratio: 1; translate: -50% -50%; border-radius: 9999px; z-index: 1; pointer-events: none;
    background: radial-gradient(circle, color-mix(in oklab, var(--glow) 60%, transparent) 0%, color-mix(in oklab, var(--glow) 18%, transparent) 38%, transparent 68%); mix-blend-mode: screen; opacity: .55; }

  /* ---------------- room names (RoomName reveal: mask per space-separated chunk) ---------------- */
  .rw-name-mask { display: inline-block; vertical-align: top; clip-path: inset(-0.45em -0.25em -0.32em -0.25em); }
  .rw-name-word { display: inline-block; }

  /* ---------------- glass search bar ---------------- */
  .rw-stay-bar { background: color-mix(in oklab, var(--background) 86%, transparent); -webkit-backdrop-filter: blur(22px) saturate(1.4); backdrop-filter: blur(22px) saturate(1.4);
    border: 1px solid color-mix(in oklab, var(--foreground) 12%, transparent); box-shadow: 0 30px 80px -28px color-mix(in oklab, var(--foreground) 45%, transparent), inset 0 1px 0 color-mix(in oklab, white 55%, transparent); color: var(--foreground); }
  .rw-seg { position: relative; display: flex; align-items: center; gap: .75rem; min-height: 3.75rem; width: 100%; text-align: left; border-radius: calc(var(--radius-xl, 1rem) + .25rem); padding: .55rem 1rem;
    transition: background-color var(--dur-micro, 160ms) var(--ease-out-quart, ease), box-shadow var(--dur-ui, 320ms) var(--ease-out-quart, ease); }
  .rw-seg:hover { background: color-mix(in oklab, var(--foreground) 5%, transparent); }
  .rw-seg[data-active] { background: var(--card); box-shadow: 0 10px 30px -14px color-mix(in oklab, var(--foreground) 40%, transparent); }
  .rw-seg-label { display: block; font-size: .75rem; line-height: 1.3; font-weight: 600; letter-spacing: .02em; color: var(--muted-foreground); }
  .rw-seg-value { display: block; font-family: var(--font-heading); font-size: 1.0625rem; line-height: 1.4; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rw-seg-value[data-empty] { font-family: inherit; font-weight: 400; font-size: .95rem; color: var(--muted-foreground); }
  @media (min-width: 1024px) {
    .rw-stay-bar[data-layout="bar"] .rw-seg-sep { position: relative; }
    .rw-stay-bar[data-layout="bar"] .rw-seg-sep::before { content: ""; position: absolute; left: 0; top: 22%; bottom: 22%; width: 1px; background: color-mix(in oklab, var(--foreground) 12%, transparent); }
  }
  .rw-nights-pill { display: inline-flex; align-items: center; gap: .3rem; border-radius: 9999px; padding: .1rem .55rem; font-size: .72rem; font-weight: 600; background: var(--primary); color: var(--primary-foreground); }
  .rw-cal-pop { box-shadow: 0 40px 90px -30px color-mix(in oklab, var(--foreground) 50%, transparent); }

  /* ---------------- range calendar ---------------- */
  .rw-cal-nav { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; flex-shrink: 0; border-radius: 9999px; border: 1px solid var(--border);
    transition: background-color var(--dur-micro, 160ms), border-color var(--dur-micro, 160ms), transform var(--dur-micro, 160ms); }
  .rw-cal-nav:hover:not(:disabled) { background: var(--foreground); color: var(--background); border-color: var(--foreground); }
  .rw-cal-nav:active:not(:disabled) { transform: scale(.94); }
  .rw-cal-nav:disabled { opacity: .3; }
  .rw-day::before { content: ""; position: absolute; inset: 7% 0; z-index: -2; background: transparent; transition: background-color .3s var(--ease-out-quart, ease); }
  .rw-day[data-mid]::before { background: var(--primary-soft); }
  .rw-day[data-edge="from"][data-span]::before { left: 50%; background: var(--primary-soft); }
  .rw-day[data-edge="to"][data-span]::before { right: 50%; background: var(--primary-soft); }
  .rw-day-fill { position: absolute; inset: 7% 9%; z-index: -1; border-radius: var(--radius-md, .6rem); background: var(--primary); transform: scale(0); opacity: 0;
    transition: transform .42s var(--ease-spring, cubic-bezier(.34,1.56,.64,1)), opacity .2s; }
  .rw-day[data-edge] .rw-day-fill { transform: scale(1); opacity: 1; box-shadow: 0 8px 20px -8px color-mix(in oklab, var(--primary) 70%, transparent); }
  .rw-day:not([aria-disabled]):not([data-edge]):hover .rw-day-fill { transform: scale(1); opacity: 1; background: color-mix(in oklab, var(--primary) 14%, transparent); box-shadow: none; }
  .rw-day:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; border-radius: var(--radius-md, .6rem); }
  .rw-day[aria-current="date"]:not([data-edge])::after { content: ""; position: absolute; bottom: 12%; left: 50%; width: 1rem; height: 2px; translate: -50% 0; border-radius: 2px; background: currentColor; opacity: .7; }

  /* ---------------- room cards ---------------- */
  .rw-room-media { position: relative; overflow: hidden; isolation: isolate; }
  .rw-room-media img { width: 100%; height: 100%; object-fit: cover; }
  .rw-room-empty { color: var(--primary-foreground); background:
    repeating-linear-gradient(0deg, color-mix(in oklab, var(--primary-foreground) 7%, transparent) 0 1px, transparent 1px 18px),
    radial-gradient(120% 80% at 28% 18%, color-mix(in oklab, var(--primary) 85%, var(--background)), transparent 62%),
    linear-gradient(170deg, color-mix(in oklab, var(--primary) 80%, var(--foreground)), color-mix(in oklab, var(--foreground) 85%, var(--primary))); }
  .rw-room-media .rw-swap-b { position: absolute; inset: 0; opacity: 0; transition: opacity .8s var(--ease-out-quart, ease), transform 1.4s var(--ease-out-expo, ease); transform: scale(1.06); }
  :is(.group:hover, .group:focus-within) .rw-room-media .rw-swap-b { opacity: 1; transform: scale(1); }
  .rw-room-media .rw-swap-a { transition: transform 1.4s var(--ease-out-expo, ease); }
  :is(.group:hover, .group:focus-within) .rw-room-media .rw-swap-a { transform: scale(1.05); }
  .rw-room-card { transition: transform .6s var(--ease-out-expo, ease), box-shadow .6s var(--ease-out-expo, ease); }
  .rw-room-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-float); }
  .rw-price-num { font-family: var(--font-accent); font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.01em; }
  .rw-index { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; letter-spacing: .08em; }
  .rw-link-line { background: linear-gradient(currentColor, currentColor) left bottom / 0 1px no-repeat; transition: background-size .5s var(--ease-out-expo, ease); }
  :is(.group:hover, .group:focus-visible, a:hover, a:focus-visible) > .rw-link-line, .rw-link-line:hover { background-size: 100% 1px; }

  /* ---------------- panoramic rows ---------------- */
  .rw-pano { position: relative; flex-shrink: 0; width: min(86vw, 66rem); }
  @media (min-width: 768px) { .rw-pano { width: min(72vw, 64rem, calc((100svh - 19rem) * 2.1)); } }
  .rw-pano-frame { position: relative; overflow: hidden; border-radius: var(--radius-2xl, 1.5rem); aspect-ratio: 4 / 5; isolation: isolate; background: var(--muted); }
  @media (min-width: 768px) { .rw-pano-frame { aspect-ratio: 21 / 10; } }
  .rw-pano-img { position: absolute; inset: 0 -9%; width: 118%; height: 100%; will-change: transform; }
  .rw-pano-img img { width: 100%; height: 100%; object-fit: cover; }
  .rw-pano-shade { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(to top, rgba(12,9,5,.72) 0%, rgba(12,9,5,.28) 38%, rgba(12,9,5,0) 62%), linear-gradient(to right, rgba(12,9,5,.25), transparent 40%); }
  .rw-film { display: flex; gap: clamp(.75rem, 1.6vw, 1.5rem); overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain;
    padding-inline: max(var(--gutter, 1rem), calc((100vw - var(--container, 96rem)) / 2 + var(--gutter, 1rem))); cursor: grab; }
  .rw-film::-webkit-scrollbar { display: none; }
  .rw-film[data-dragging] { cursor: grabbing; scroll-snap-type: none; }
  .rw-film > * { scroll-snap-align: center; flex-shrink: 0; }
  .rw-film-item { position: relative; overflow: hidden; border-radius: var(--radius-xl, 1rem); height: clamp(15rem, 52vw, 34rem); aspect-ratio: 21 / 10; isolation: isolate; background: var(--muted); }
  .rw-film-item[data-portrait] { aspect-ratio: 4 / 5; }
  @media (max-width: 767px) { .rw-film-item { aspect-ratio: 4 / 5; height: auto; width: 78vw; } }
  .rw-film-item .rw-pano-img { inset: 0 -7%; width: 114%; }

  /* ---------------- rooms list ---------------- */
  .rw-amen { display: inline-flex; align-items: center; gap: .5rem; font-size: .875rem; color: var(--muted-foreground); }
  .rw-amen svg { width: 1.05rem; height: 1.05rem; color: var(--primary-ink, var(--primary)); flex-shrink: 0; }
  .rw-room-row .rw-row-num { transition: color var(--dur-ui, 320ms), transform .6s var(--ease-out-expo, ease); }
  .rw-room-row:hover .rw-row-num { color: var(--primary); }

  /* ---------------- stay status ---------------- */
  .rw-pass { position: relative; isolation: isolate; overflow: hidden; }
  .rw-pass-perf { position: relative; height: 0; border-top: 2px dashed color-mix(in oklab, var(--foreground) 16%, transparent); margin-inline: 1.25rem; }
  .rw-pass-perf::before, .rw-pass-perf::after { content: ""; position: absolute; top: -13px; width: 24px; height: 24px; border-radius: 9999px; background: var(--background); }
  .rw-pass-perf::before { left: calc(-1.25rem - 12px); }
  .rw-pass-perf::after { right: calc(-1.25rem - 12px); }
  .rw-track { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
  .rw-track-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 9999px; border: 2px solid var(--border); background: var(--card); color: var(--muted-foreground); }
  .rw-track-step[data-state="done"] .rw-track-dot { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
  .rw-track-step[data-state="now"] .rw-track-dot { border-color: var(--primary); color: var(--primary-ink, var(--primary)); box-shadow: 0 0 0 5px var(--primary-soft); }
  .rw-track-step[data-state="stop"] .rw-track-dot { border-color: var(--destructive); background: var(--destructive); color: white; }
  .rw-track-line { position: absolute; top: .875rem; left: 50%; width: 100%; height: 2px; background: var(--border); }
  .rw-track-line > i { position: absolute; inset: 0; background: var(--primary); transform-origin: left; transform: scaleX(var(--fill, 0)); }

  /* ---------------- book form ---------------- */
  .rw-stepper { counter-reset: rwstep; }
  .rw-step-n { display: inline-grid; place-items: center; width: 2rem; height: 2rem; border-radius: 9999px; font-family: var(--font-accent); font-size: .95rem; background: var(--primary-soft); color: var(--primary-ink, var(--primary)); flex-shrink: 0; }
  .rw-press { transition: transform var(--dur-micro, 160ms) var(--ease-out-quart, ease), background-color var(--dur-micro, 160ms), box-shadow var(--dur-ui, 320ms); }
  .rw-press:active:not(:disabled) { transform: scale(.97); }
  .rw-flash { animation: none; }

  /* ================= motion (no-preference only) ================= */
  @media (prefers-reduced-motion: no-preference) {
    .rw-hero-photo img { animation: rw-hero-push 2.8s var(--ease-out-expo, ease) both; }
    .rw-hero-in { animation: rw-hero-in 1.2s var(--ease-out-expo, ease) both; animation-delay: var(--d, 0s); }
    .rw-name-rise .rw-name-word { animation: rw-name-up 1.15s var(--ease-out-expo, ease) both; animation-delay: var(--d, 0s); }
    .rw-rdrift { animation: rw-rdrift 24s ease-in-out infinite alternate; }
    .rw-cal-pop:not([hidden]) { animation: rw-pop-in .42s var(--ease-out-expo, ease) both; }
    .rw-cal-pop[data-dir="up"]:not([hidden]) { transform-origin: 50% 100%; }
    .rw-flash { animation: rw-flash .6s var(--ease-out-quart, ease); }
    .rw-sun-breathe { animation: rw-sun 9s ease-in-out infinite alternate; }
    .rw-track-line > i { transition: transform 1.2s var(--ease-out-expo, ease) .3s; }
    @starting-style { .rw-track-line > i { transform: scaleX(0); } }
    .rw-scroll-cue::after { content: ""; position: absolute; inset: 0; background: currentColor; animation: rw-cue-r 2.4s var(--ease-in-out-circ, ease-in-out) infinite; }
  }
}
@keyframes rw-hero-push { from { transform: scale(1.12); } to { transform: scale(1.02); } }
@keyframes rw-hero-in { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes rw-name-up { from { transform: translateY(118%) rotate(2deg); } to { transform: none; } }
@keyframes rw-rdrift { from { transform: scale(1.1) translate3d(-2%, 1%, 0); } to { transform: scale(1.1) translate3d(2%, -1.5%, 0); } }
@keyframes rw-pop-in { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes rw-flash { from { color: var(--primary); } }
@keyframes rw-sun { from { opacity: .4; scale: .94; } to { opacity: .62; scale: 1.06; } }
@keyframes rw-cue-r { 0% { transform: translateY(-101%); } 55% { transform: translateY(0); } 100% { transform: translateY(101%); } }
`;

export function RentalStyles() {
  return (
    <style href="rw-rental" precedence="default">
      {CSS}
    </style>
  );
}
