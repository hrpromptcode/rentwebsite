import * as React from "react";

/**
 * Restaurant module CSS (บ้านริม / any tenant using the restaurant module). Hoisted + de-duplicated by React 19
 * (`<style href precedence>`), so server sections and client components can both render <RestaurantStyles/>.
 * Theme tokens only; hidden start states live under `prefers-reduced-motion: no-preference` so reduced motion,
 * no-JS and crawlers always get the final layout.
 */
const CSS = /* css */ `
@layer components {
  /* ---------- plates (menu highlight, menu preview) ---------- */
  .rr-plate { --spin: 0deg; --lift: 0deg; --ps: 1; border-radius: 9999px; overflow: hidden; transform: rotate(calc(var(--spin) + var(--lift))) scale(var(--ps));
    transition: transform .8s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)); will-change: transform; background: var(--muted);
    box-shadow: 0 28px 56px -26px color-mix(in oklab, var(--foreground) 60%, transparent), 0 0 0 clamp(6px, .8vw, 10px) var(--card), 0 0 0 calc(clamp(6px, .8vw, 10px) + 1px) var(--border); }
  .rr-plate img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.12); }
  :is(.group:hover, .group:focus-visible) .rr-plate { --lift: -14deg; --ps: 1.04; }
  .rr-plate-card { transition: transform var(--dur-ui, 320ms) var(--ease-out-quart, ease), box-shadow var(--dur-ui, 320ms) var(--ease-out-quart, ease), border-color var(--dur-ui, 320ms); }
  .rr-plate-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-float); border-color: color-mix(in oklab, var(--primary) 35%, var(--border)); }
  .rr-price { font-variant-numeric: tabular-nums; }
  .rr-leader { flex: 1 1 auto; min-width: 1.5rem; height: 1px; align-self: center; translate: 0 .25em;
    background-image: radial-gradient(circle, color-mix(in oklab, var(--foreground) 35%, transparent) 1px, transparent 1.3px); background-size: 7px 3px; background-repeat: repeat-x; background-position: 0 50%; }

  /* ---------- reservation band ---------- */
  .rr-candle { position: absolute; inset: 0; }
  .rr-res-meta { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; letter-spacing: .08em; }
  .rr-res-meta[data-script="thai"] { font-family: inherit; font-size: .8125rem; letter-spacing: .02em; }

  /* ---------- menu page ---------- */
  .rr-cat-head { scroll-margin-top: 9rem; }
  @media (min-width: 1024px) { .rr-cat-head { scroll-margin-top: calc(var(--header-h, 80px) + 2rem); } }
  .rr-row { position: relative; transition: background-color var(--dur-micro, 160ms) var(--ease-out-quart, ease), transform var(--dur-ui, 320ms) var(--ease-out-quart, ease), box-shadow var(--dur-ui, 320ms) var(--ease-out-quart, ease); }
  .rr-row .rr-thumb img { transition: transform 1.1s var(--ease-out-expo, ease); }
  .rr-row:is(:hover, :focus-visible) .rr-thumb img { transform: scale(1.1) rotate(-4deg); }
  .rr-row .rr-add { transition: transform var(--dur-ui, 320ms) var(--ease-spring, ease), background-color var(--dur-micro, 160ms); }
  .rr-row:is(:hover, :focus-visible) .rr-add { transform: rotate(90deg) scale(1.08); }
  .rr-row:active .rr-add { transform: scale(.9); }
  .rr-preview { aspect-ratio: 1; width: min(100%, 18rem, calc(100svh - 34rem)); }
  @media (max-height: 640px) { .rr-preview-wrap { display: none !important; } }
  .rr-preview .rr-plate { position: absolute; inset: 0; }
  .rr-preview .rr-plate .rr-preview-img { position: absolute; inset: 0; opacity: 0; transition: opacity .45s var(--ease-out-quart, ease), transform 1s var(--ease-out-expo, ease); transform: rotate(-24deg) scale(1.18); }
  .rr-preview .rr-plate .rr-preview-img[data-on] { opacity: 1; transform: rotate(0) scale(1.12); }
  .rr-pill { position: absolute; inset: 0; border-radius: 9999px; background: var(--primary); box-shadow: 0 6px 18px -8px color-mix(in oklab, var(--primary) 70%, transparent); }
  .rr-index-link[aria-current="true"] { color: var(--primary-foreground); }

  /* ---------- fly-to-cart ---------- */
  .rr-fly { position: fixed; z-index: 70; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; pointer-events: none; }
  .rr-fly > span { display: block; width: 100%; height: 100%; border-radius: 9999px; overflow: hidden; background: var(--primary); border: 3px solid var(--background);
    box-shadow: 0 10px 24px -8px color-mix(in oklab, var(--primary) 70%, transparent); }
  .rr-fly img { width: 100%; height: 100%; object-fit: cover; }

  /* ---------- operational polish ---------- */
  .rr-steps { counter-reset: rrstep; }
  .rr-step-line { transform-origin: left; }
  .rr-ticket { position: relative; }
  .rr-ticket-perf { position: relative; height: 0; border-top: 2px dashed var(--border); margin-inline: 1.25rem; }
  .rr-ticket-perf::before, .rr-ticket-perf::after { content: ""; position: absolute; top: -13px; width: 24px; height: 24px; border-radius: 9999px; background: var(--background); border: 1px solid var(--border); }
  .rr-ticket-perf::before { left: calc(-1.25rem - 13px); clip-path: inset(0 0 0 50%); }
  .rr-ticket-perf::after { right: calc(-1.25rem - 13px); clip-path: inset(0 50% 0 0); }
  .rr-flash { animation: none; }
  .rr-num { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
}

@media (prefers-reduced-motion: no-preference) {
  .rr-fade { animation: rr-fade .45s var(--ease-out-quart, ease) both; }
  .rr-fade-2 { animation: rr-fade .45s .08s var(--ease-out-quart, ease) both; }
  .rr-fade-3 { animation: rr-fade .45s .16s var(--ease-out-quart, ease) both; }
  .rr-flash { animation: rr-flash .6s var(--ease-out-quart, ease); }
  .rr-step-line { animation: rr-scale-x .9s .15s var(--ease-out-expo, ease) both; }
  .rr-pulse-dot { animation: rr-pulse 1.8s ease-in-out infinite; }
  .rr-steam-css span { animation: rr-steam 3.6s ease-in-out infinite; }
  .rr-spin-slow { animation: rr-spin 60s linear infinite; }
  @supports (animation-timeline: view()) {
    .rr-row-in { animation: rr-row-in linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
  }
}
@keyframes rr-fade { from { opacity: 0; transform: translateY(8px); } }
@keyframes rr-flash { 0% { color: var(--primary); } 100% { color: inherit; } }
@keyframes rr-scale-x { from { transform: scaleX(0); } }
@keyframes rr-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 45%, transparent); } 50% { box-shadow: 0 0 0 10px transparent; } }
@keyframes rr-steam { 0% { opacity: 0; transform: translateY(10px) scaleX(.8); } 35% { opacity: .55; } 100% { opacity: 0; transform: translateY(-46px) scaleX(1.3); } }
@keyframes rr-spin { to { transform: rotate(360deg); } }
@keyframes rr-row-in { from { opacity: .001; transform: translateY(24px); } to { opacity: 1; transform: none; } }
`;

export function RestaurantStyles() {
  return (
    <style href="rw-restaurant" precedence="default">
      {CSS}
    </style>
  );
}
