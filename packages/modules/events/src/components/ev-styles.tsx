import * as React from "react";

/**
 * Events-module CSS (hi-end redesign, "Maker Yard" stage direction §5.10). Hoisted + de-duplicated by React 19
 * (`<style href precedence>`), so every component may render <EvStyles/> and it lands once in <head>. Theme tokens only
 * (a tenant recolouring the site recolours every poster, ticket and beam). Hidden start states / loops only under
 * `prefers-reduced-motion: no-preference`; reduced motion = final state, no tilt, no rolling digits.
 */
const CSS = /* css */ `
@layer components {
  /* ---------- type ---------- */
  .ev-num { font-family: var(--font-accent, var(--font-display)); font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1; }
  .ev-mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; line-height: 1.4; letter-spacing: .1em; text-transform: uppercase; }
  .ev-mono[data-script="thai"], .ev-mono [data-script="thai"] { letter-spacing: .02em; font-family: var(--font-body); font-size: .75rem; font-weight: 600; }
  .ev-giant { font-family: var(--font-display); font-weight: 800; line-height: .9; letter-spacing: -.035em; }
  .ev-giant[data-script="thai"], .ev-giant [data-script="thai"] { letter-spacing: 0; line-height: var(--leading-thai-display, 1.25); }
  .ev-ink { color: var(--color-primary-ink, var(--primary)); }
  .ev-hair { border-color: color-mix(in oklab, var(--foreground) 12%, transparent); }

  /* ---------- glass + chips ---------- */
  .ev-glass { background: color-mix(in oklab, #000 34%, transparent); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
    border: 1px solid rgb(255 255 255 / .16); color: #fff; }
  .ev-chip { display: inline-flex; align-items: center; gap: .5rem; min-height: 2.5rem; padding: .35rem .9rem; border-radius: 999px; font-size: .875rem; }

  /* ---------- tilt (client writes --rx --ry --px --py) ---------- */
  .ev-tilt { transform: perspective(1100px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transform-style: preserve-3d;
    transition: transform .8s var(--ease-out-quart, cubic-bezier(.25,1,.5,1)), filter .5s var(--ease-out-quart, ease); will-change: transform; }
  .ev-tilt[data-active] { transition: transform .14s linear, filter .5s var(--ease-out-quart, ease); }

  /* ---------- poster card ---------- */
  .ev-poster-wrap { position: relative; height: 100%; }
  .ev-poster-wrap:is(:hover, :focus-within) { filter: drop-shadow(0 28px 50px color-mix(in oklab, var(--primary) 26%, transparent)) drop-shadow(0 10px 20px rgb(0 0 0 / .25)); }
  .ev-poster { --notch: 11px; --stub: 4.75rem; position: relative; isolation: isolate; display: flex; flex-direction: column; height: 100%;
    border-radius: calc(var(--radius, .75rem) * 1.25); background: var(--card); color: var(--card-foreground);
    -webkit-mask: radial-gradient(circle var(--notch) at 0 calc(100% - var(--stub)), #0000 98%, #000) left / 51% 100% no-repeat,
                  radial-gradient(circle var(--notch) at 100% calc(100% - var(--stub)), #0000 98%, #000) right / 51% 100% no-repeat;
            mask: radial-gradient(circle var(--notch) at 0 calc(100% - var(--stub)), #0000 98%, #000) left / 51% 100% no-repeat,
                  radial-gradient(circle var(--notch) at 100% calc(100% - var(--stub)), #0000 98%, #000) right / 51% 100% no-repeat; }
  .ev-poster::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 3;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent); transition: box-shadow .4s var(--ease-out-quart, ease); }
  .ev-poster-wrap:is(:hover, :focus-within) .ev-poster::after { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 55%, transparent); }
  .ev-poster-media { position: relative; flex: 1 1 auto; min-height: 0; overflow: clip; background: #0b0b0f; color: #fff; border-radius: inherit; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .ev-poster-media > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.82) contrast(1.06) brightness(.92);
    transform: scale(1.02) translate3d(calc(var(--dx, 0) * -14px), calc(var(--dy, 0) * -14px), 0);
    transition: transform 1.2s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)), filter .7s var(--ease-out-quart, ease); }
  .ev-poster-wrap:is(:hover, :focus-within) .ev-poster-media > img { transform: scale(1.07) translate3d(calc(var(--dx, 0) * -14px), calc(var(--dy, 0) * -14px), 0); filter: saturate(1.08) contrast(1.06) brightness(1); }
  .ev-poster-media[data-past] > img { filter: grayscale(.85) contrast(1.05) brightness(.8); }
  .ev-poster-scrim { position: absolute; inset: 0; background: linear-gradient(to top, rgb(8 8 12 / .94) 0%, rgb(8 8 12 / .55) 34%, rgb(8 8 12 / .05) 62%, rgb(8 8 12 / .35) 100%); }
  /* stage-beam glow that follows the pointer */
  .ev-beam { position: absolute; inset: 0; pointer-events: none; opacity: 0; mix-blend-mode: screen; transition: opacity .6s var(--ease-out-quart, ease);
    background:
      conic-gradient(from 180deg at var(--px, 50%) -18%, transparent 168deg, color-mix(in oklab, var(--primary) 62%, transparent) 178deg, color-mix(in oklab, var(--primary) 30%, transparent) 182deg, transparent 194deg),
      radial-gradient(70% 55% at var(--px, 50%) 0%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%),
      radial-gradient(60% 50% at calc(100% - var(--px, 50%)) 105%, color-mix(in oklab, var(--accent) 34%, transparent), transparent 70%); }
  .ev-poster-wrap:is(:hover, :focus-within) .ev-beam { opacity: 1; }
  .ev-stamp { line-height: .86; }
  .ev-stamp b { display: block; font-family: var(--font-accent, var(--font-display)); font-weight: 700; font-size: clamp(2.25rem, 1.6rem + 1.6vw, 3.25rem); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
  .ev-poster-title { font-family: var(--font-heading); font-weight: 700; font-size: clamp(1.25rem, 1.05rem + .55vw, 1.625rem); line-height: 1.25; text-wrap: balance; }
  .ev-poster-title[data-script="latin"] { line-height: 1.08; letter-spacing: -.01em; }
  .ev-stub { position: relative; flex: none; height: var(--stub); display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: 0 1.1rem 0 1.25rem; }
  .ev-stub::before { content: ""; position: absolute; top: 0; left: calc(var(--notch) + 6px); right: calc(var(--notch) + 6px); border-top: 2px dashed color-mix(in oklab, var(--foreground) 22%, transparent); }
  .ev-link-stretch::after { content: ""; position: absolute; inset: 0; z-index: 2; }

  /* ---------- holo sheen ---------- */
  .ev-holo { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; opacity: .2; mix-blend-mode: soft-light;
    background: linear-gradient(115deg, transparent 18%, color-mix(in oklab, var(--primary) 70%, #fff) 34%, color-mix(in oklab, var(--accent) 70%, #fff) 48%, #9be7ff 58%, transparent 74%);
    background-size: 260% 260%; background-position: var(--px, 30%) var(--py, 30%); transition: opacity .5s var(--ease-out-quart, ease); }
  .ev-holo-lines { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; opacity: .1;
    background: repeating-linear-gradient(115deg, transparent 0 6px, color-mix(in oklab, var(--foreground) 60%, transparent) 6px 7px); mix-blend-mode: overlay; }
  :is(.ev-tilt[data-active], .ev-tilt:focus-within) .ev-holo { opacity: .55; }

  /* ---------- rolling digits (live countdown odometer) ---------- */
  .ev-roll { display: inline-flex; align-items: flex-start; }
  .ev-roll-cell { display: block; height: 1.12em; overflow: hidden; }
  .ev-roll-col { display: block; transform: translateY(calc(var(--d, 0) * -1.12em)); }
  .ev-roll-col > span { display: block; height: 1.12em; line-height: 1.12em; text-align: center; }
  .ev-roll-dash { display: block; height: 1.12em; line-height: 1.12em; opacity: .5; }

  /* ---------- countdown ---------- */
  .ev-count { display: inline-grid; grid-auto-flow: column; align-items: end; gap: .25rem; }
  .ev-count-unit { display: flex; flex-direction: column; gap: .4rem; min-width: 2ch; }
  .ev-count-sep { align-self: start; display: flex; flex-direction: column; justify-content: center; gap: .16em; height: 1.12em; padding-inline: .14em; opacity: .45; }
  .ev-count-sep::before, .ev-count-sep::after { content: ""; width: .1em; height: .1em; border-radius: 1px; background: currentColor; }

  /* ---------- sliding pills ---------- */
  .ev-pills { scrollbar-width: none; }
  .ev-pills::-webkit-scrollbar { display: none; }

  /* ---------- velocity skew (event highlights filmstrip) ---------- */
  .ev-skew { transform: skewX(var(--ev-skew, 0deg)); transition: transform .35s var(--ease-out-quart, ease); }

  /* ---------- ticket-shaped surfaces ---------- */
  .ev-ticket { --notch: 13px; --at: 50%; position: relative; isolation: isolate;
    -webkit-mask: radial-gradient(circle var(--notch) at var(--at) 0, #0000 98%, #000) top / 100% 51% no-repeat,
                  radial-gradient(circle var(--notch) at var(--at) 100%, #0000 98%, #000) bottom / 100% 51% no-repeat;
            mask: radial-gradient(circle var(--notch) at var(--at) 0, #0000 98%, #000) top / 100% 51% no-repeat,
                  radial-gradient(circle var(--notch) at var(--at) 100%, #0000 98%, #000) bottom / 100% 51% no-repeat; }
  .ev-ticket-x { --notch: 12px; --at: 50%; position: relative; isolation: isolate;
    -webkit-mask: radial-gradient(circle var(--notch) at 0 var(--at), #0000 98%, #000) left / 51% 100% no-repeat,
                  radial-gradient(circle var(--notch) at 100% var(--at), #0000 98%, #000) right / 51% 100% no-repeat;
            mask: radial-gradient(circle var(--notch) at 0 var(--at), #0000 98%, #000) left / 51% 100% no-repeat,
                  radial-gradient(circle var(--notch) at 100% var(--at), #0000 98%, #000) right / 51% 100% no-repeat; }
  .ev-strip > div + div { border-top: 2px dashed color-mix(in oklab, var(--foreground) 18%, transparent); }
  @media (min-width: 640px) { .ev-strip > div + div { border-top: 0; border-left: 2px dashed color-mix(in oklab, var(--foreground) 18%, transparent); } }
  .ev-perf-v { border-left: 2px dashed color-mix(in oklab, var(--foreground) 20%, transparent); }
  .ev-perf-h { border-top: 2px dashed color-mix(in oklab, var(--foreground) 20%, transparent); }
  .ev-ticket-bg { background:
      radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 55%),
      radial-gradient(90% 120% at 100% 100%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%),
      var(--card); color: var(--card-foreground); }
  .ev-ticket-edge { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 11%, transparent); }
  .ev-barcode { background: repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 4px, currentColor 4px 5px, transparent 5px 8px, currentColor 8px 11px, transparent 11px 13px); opacity: .55; }

  /* ---------- e-ticket card ---------- */
  .ev-eticket-qr { background: #fff; color: #0b0b0f; }
  .ev-eticket-art { position: relative; overflow: clip; }
  .ev-eticket[data-dead] .ev-eticket-art { filter: grayscale(1); opacity: .75; }

  /* ---------- ticket tiers (event page) ---------- */
  .ev-tier { transition: transform .5s var(--ease-out-quart, ease), box-shadow .5s var(--ease-out-quart, ease); }
  .ev-tier[data-on] { box-shadow: inset 4px 0 0 var(--primary); }

  /* ---------- hero ---------- */
  .ev-hero-title { font-size: min(3.25rem, 11.4vw); }
  @media (min-width: 768px) { .ev-hero-title { font-size: clamp(3.75rem, .9rem + 6.1vw, 8.5rem); } }
  .ev-hero-sub { font-size: clamp(1.375rem, 1.1rem + 1.1vw, 2.375rem); line-height: 1.28; }
  .ev-scrim { background:
      linear-gradient(to top, rgb(6 6 10 / .96) 0%, rgb(6 6 10 / .7) 30%, rgb(6 6 10 / .2) 62%, rgb(6 6 10 / .5) 100%),
      linear-gradient(to right, rgb(6 6 10 / .82) 0%, rgb(6 6 10 / .35) 48%, transparent 72%); }
  @media (max-width: 767px) { .ev-scrim { background: linear-gradient(to top, rgb(6 6 10 / .97) 0%, rgb(6 6 10 / .85) 42%, rgb(6 6 10 / .25) 70%, rgb(6 6 10 / .55) 100%); } }

  /* CSS ticket (static poster of the 3D ticket: no WebGL / low tier) */
  .ev-css-ticket { position: absolute; width: min(30rem, 34vw); aspect-ratio: 3.6 / 1.6; right: 7%; top: 30%; transform: rotate(-6deg) perspective(900px) rotateY(-14deg);
    border-radius: 14px; color: var(--primary-foreground); display: grid; grid-template-columns: 1fr 27%; overflow: clip;
    background: linear-gradient(120deg, var(--primary), var(--accent)); box-shadow: 0 40px 80px -30px rgb(0 0 0 / .8), 0 0 70px -20px var(--primary); }
  .ev-css-ticket .ev-holo { opacity: .45; }
  @media (max-width: 899px) { .ev-css-ticket { width: 74%; right: 13%; top: 19%; transform: rotate(-5deg); } }
  .ev-css-ticket[data-placement="center"] { width: 80%; right: 10%; top: 34%; transform: rotate(-6deg); }

  @media (prefers-reduced-motion: no-preference) and (scripting: enabled) {
    .ev-in { animation: ev-in 1s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) both; animation-delay: var(--d, 0s); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .ev-roll-col { transition: transform .5s cubic-bezier(.3,1.25,.4,1); }
    .ev-float { animation: ev-float 6s ease-in-out infinite; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ev-tilt, .ev-tilt[data-active] { transform: none !important; transition: none; }
    .ev-skew { transform: none !important; }
    .ev-poster-media > img { transition: none; }
  }
  @media print {
    .ev-tilt { transform: none !important; }
    .ev-holo, .ev-holo-lines { display: none; }
    .ev-ticket, .ev-ticket-x, .ev-poster { -webkit-mask: none; mask: none; }
  }
}
@keyframes ev-in { from { opacity: 0; transform: translate3d(0, 22px, 0); } }
@keyframes ev-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
`;

export function EvStyles() {
  return (
    <style href="rw-events" precedence="default">
      {CSS}
    </style>
  );
}
