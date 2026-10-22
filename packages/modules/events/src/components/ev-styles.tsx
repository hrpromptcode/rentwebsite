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

  /* ---------- e-ticket card (order + public ticket pages; operational: CSS tilt + holo only, QR always flat) ---------- */
  .ev-et { position: relative; border-radius: calc(var(--radius, .75rem) * 1.4); }
  .ev-et-body { position: relative; isolation: isolate; display: grid; overflow: hidden; border-radius: inherit; color: var(--card-foreground);
    background:
      radial-gradient(120% 90% at 0% 100%, color-mix(in oklab, var(--primary) 9%, transparent), transparent 60%),
      radial-gradient(90% 90% at 100% 0%, color-mix(in oklab, var(--accent) 9%, transparent), transparent 60%),
      var(--card);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 11%, transparent), 0 34px 70px -44px rgb(0 0 0 / .75); }
  @media (min-width: 768px) { .ev-et-body { grid-template-columns: minmax(0, 1fr) 15.5rem; } }
  .ev-et-art { position: relative; isolation: isolate; min-height: 9.5rem; overflow: clip; background: #0b0b0f; color: #fff; display: flex; flex-direction: column; justify-content: space-between; gap: 1.25rem; padding: 1.1rem 1.25rem 1.2rem; }
  @media (min-width: 768px) { .ev-et-art { min-height: 10.5rem; padding: 1.25rem 1.5rem 1.4rem; } }
  .ev-et-art > img { position: absolute; inset: -6%; z-index: -2; width: 112%; height: 112%; max-width: none; object-fit: cover; opacity: .72; filter: saturate(.9) contrast(1.06);
    transform: translate3d(calc(var(--dx, 0) * -12px), calc(var(--dy, 0) * -12px), 0); transition: transform 1s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)); }
  .ev-et-art::after { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(100deg, rgb(8 8 12 / .92) 0%, rgb(8 8 12 / .62) 46%, rgb(8 8 12 / .22) 100%), linear-gradient(to top, rgb(8 8 12 / .7), transparent 60%); }
  .ev-et[data-dead] .ev-et-art > img { filter: grayscale(1) contrast(1.05); opacity: .45; }
  .ev-et-title { font-family: var(--font-heading); font-weight: 700; font-size: clamp(1.3rem, 1.1rem + .7vw, 1.75rem); line-height: 1.22; text-wrap: balance; text-shadow: 0 2px 24px rgb(0 0 0 / .45); }
  .ev-et-title[data-script="latin"] { line-height: 1.08; letter-spacing: -.01em; }
  .ev-et-stub { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .7rem; padding: 1.6rem 1.25rem 1.25rem;
    border-top: 2px dashed color-mix(in oklab, var(--foreground) 20%, transparent); }
  @media (min-width: 768px) { .ev-et-stub { border-top: 0; border-left: 2px dashed color-mix(in oklab, var(--foreground) 20%, transparent); padding: 1.5rem 1.25rem; } }
  /* perforation bites (the card clips the outer half) */
  .ev-et-stub::before, .ev-et-stub::after { content: ""; position: absolute; width: 26px; height: 26px; border-radius: 50%; background: var(--background);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 11%, transparent); top: -14px; }
  .ev-et-stub::before { left: -13px; }
  .ev-et-stub::after { right: -13px; }
  @media (min-width: 768px) {
    .ev-et-stub::before { left: -14px; top: -13px; }
    .ev-et-stub::after { right: auto; left: -14px; top: auto; bottom: -13px; }
  }
  .ev-et-qr { background: #fff; color: #0b0b0f; padding: .6rem; border-radius: 1rem; box-shadow: 0 0 0 1px rgb(0 0 0 / .06), 0 20px 44px -26px rgb(0 0 0 / .8); }
  .ev-et-qr > img { display: block; width: min(13.5rem, 62vw); height: auto; aspect-ratio: 1; image-rendering: auto; }
  @media (min-width: 768px) { .ev-et-qr > img { width: 11.5rem; } }
  .ev-et-code { font-family: var(--font-mono, ui-monospace, monospace); font-weight: 600; font-size: .9375rem; letter-spacing: .14em; }
  .ev-et-stamp { position: absolute; z-index: 3; right: 1.25rem; bottom: 1.1rem; rotate: -8deg; pointer-events: none; padding: .35rem 1rem; border: 3px solid currentColor; border-radius: .5rem;
    font-family: var(--font-accent, var(--font-display)); font-weight: 800; font-size: clamp(1rem, .8rem + 1vw, 1.5rem); letter-spacing: .16em; color: #ff6b6b; opacity: .95; background: rgb(8 8 12 / .55); }
  .ev-et-stamp[data-tone="ok"] { color: var(--primary); }
  /* glow behind the card (static stage light; no WebGL on operational routes) */
  .ev-spot { position: absolute; inset: -12% -6% auto; height: 70%; z-index: -1; pointer-events: none; filter: blur(10px);
    background: radial-gradient(45% 60% at 30% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%), radial-gradient(40% 55% at 75% 10%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%); }

  /* ---------- order page ---------- */
  .ev-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); position: relative; }
  .ev-steps::before, .ev-steps::after { content: ""; position: absolute; top: 1.05rem; left: calc(100% / 6); height: 2px; border-radius: 2px; }
  .ev-steps::before { right: calc(100% / 6); background: color-mix(in oklab, var(--foreground) 12%, transparent); }
  .ev-steps::after { width: calc((100% - 100% / 3) * var(--fill, 0)); background: var(--primary); box-shadow: 0 0 18px -2px var(--primary); }
  .ev-steps[data-tone="off"]::after { background: color-mix(in oklab, var(--foreground) 35%, transparent); box-shadow: none; }
  .ev-step { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: .5rem; text-align: center; font-size: .8125rem; color: var(--muted-foreground); }
  .ev-step > i { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 999px; font-style: normal; background: var(--card); border: 2px solid color-mix(in oklab, var(--foreground) 16%, transparent); }
  .ev-step[data-state="done"] { color: var(--foreground); }
  .ev-step[data-state="done"] > i { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
  .ev-step[data-state="now"] { color: var(--foreground); font-weight: 600; }
  .ev-step[data-state="now"] > i { border-color: var(--primary); color: var(--primary); box-shadow: 0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent); }
  .ev-step[data-state="off"] > i { border-color: color-mix(in oklab, var(--destructive) 60%, transparent); color: var(--destructive); }
  .ev-receipt { position: relative; isolation: isolate; border-radius: calc(var(--radius, .75rem) * 1.4); background: var(--card); color: var(--card-foreground);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent); }
  .ev-receipt-zig { height: 10px; background: radial-gradient(circle at 7px -1px, transparent 6px, var(--card) 6.5px) 0 0 / 14px 10px repeat-x; }
  .ev-orow { transition: transform .5s var(--ease-out-quart, cubic-bezier(.25,1,.5,1)), box-shadow .5s var(--ease-out-quart, ease); }
  .ev-orow:hover { transform: translateY(-3px); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 50%, transparent), 0 24px 50px -30px color-mix(in oklab, var(--primary) 40%, transparent); }
  .ev-orow:hover .ev-orow-go { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); rotate: -45deg; }
  .ev-orow-go { transition: background-color .4s var(--ease-out-quart, ease), color .4s, rotate .5s var(--ease-out-quart, ease); }

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
  @media (prefers-reduced-motion: no-preference) and (scripting: enabled) {
    .ev-fade { animation: ev-fade .45s var(--ease-out-quart, ease) both; animation-delay: var(--d, 0s); }
    .ev-steps::after { animation: ev-grow 1.1s var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) .35s both; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ev-tilt, .ev-tilt[data-active] { transform: none !important; transition: none; }
    .ev-skew { transform: none !important; }
    .ev-poster-media > img, .ev-et-art > img { transition: none; transform: none; }
    .ev-orow, .ev-orow-go { transition: none; }
    .ev-orow:hover { transform: none; }
  }
  @media print {
    .ev-tilt { transform: none !important; }
    .ev-holo, .ev-holo-lines { display: none; }
    .ev-ticket, .ev-ticket-x, .ev-poster { -webkit-mask: none; mask: none; }
    .ev-et-body { box-shadow: none; border: 1px solid #bbb; }
    .ev-et-stub::before, .ev-et-stub::after, .ev-spot { display: none; }
    .ev-et-art > img { transform: none; }
  }
}
@keyframes ev-in { from { opacity: 0; transform: translate3d(0, 22px, 0); } }
@keyframes ev-grow { from { width: 0; } }
@keyframes ev-fade { from { opacity: 0; transform: translate3d(0, 10px, 0); } }
@keyframes ev-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
`;

export function EvStyles() {
  return (
    <style href="rw-events" precedence="default">
      {CSS}
    </style>
  );
}
