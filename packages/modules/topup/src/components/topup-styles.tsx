import * as React from "react";

/**
 * Top-up module styles (GameHub direction §5.2: night arcade + esports HUD). Hoisted once per page by React 19
 * (`<style href precedence>`), theme tokens only (a recoloured shop recolours every glow), every animation is
 * gated on `prefers-reduced-motion: no-preference`, pointer effects on fine pointers only (set by HoloCard).
 */
const CSS = String.raw`
@layer components {
  .tp-hud { font-family: var(--font-mono, ui-monospace, monospace); font-size: clamp(.6875rem, .66rem + .1vw, .75rem); letter-spacing: .08em; text-transform: uppercase; font-variant-numeric: tabular-nums; line-height: 1.5; }
  .tp-hud[data-script="thai"], .tp-hud[data-script="mixed"] { letter-spacing: .02em; text-transform: none; }
  .tp-num { font-family: var(--font-accent, var(--font-display)); font-variant-numeric: tabular-nums; }

  /* HUD corner brackets: 4 <i> in a .tp-brk box */
  .tp-brk { position: absolute; inset: 0; pointer-events: none; z-index: 3; --b: 12px; --c: color-mix(in oklab, var(--primary) 85%, var(--foreground)); }
  .tp-brk > i { position: absolute; width: var(--b); height: var(--b); border: 0 solid var(--c); transition: transform .55s var(--ease-out-expo), opacity .35s var(--ease-out-quart); }
  .tp-brk > i:nth-child(1) { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; }
  .tp-brk > i:nth-child(2) { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; }
  .tp-brk > i:nth-child(3) { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; }
  .tp-brk > i:nth-child(4) { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; }
  .tp-brk[data-hover] > i { opacity: 0; }
  .group:hover .tp-brk[data-hover] > i, .group:focus-visible .tp-brk[data-hover] > i { opacity: 1; }
  .group:hover .tp-brk[data-hover] > i:nth-child(1), .group:focus-visible .tp-brk[data-hover] > i:nth-child(1) { transform: translate(-5px, -5px); }
  .group:hover .tp-brk[data-hover] > i:nth-child(2), .group:focus-visible .tp-brk[data-hover] > i:nth-child(2) { transform: translate(5px, -5px); }
  .group:hover .tp-brk[data-hover] > i:nth-child(3), .group:focus-visible .tp-brk[data-hover] > i:nth-child(3) { transform: translate(-5px, 5px); }
  .group:hover .tp-brk[data-hover] > i:nth-child(4), .group:focus-visible .tp-brk[data-hover] > i:nth-child(4) { transform: translate(5px, 5px); }

  /* holographic tilt card (vars written by HoloCard on fine pointers) */
  .tp-holo { --rx: 0deg; --ry: 0deg; --px: 50%; --py: 50%; --dx: 0; --dy: 0; position: relative; transform: perspective(1000px) rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .7s var(--ease-out-expo); will-change: transform; }
  .tp-holo[data-active] { transition: transform .14s linear; }
  .tp-foil { position: absolute; inset: 0; z-index: 2; pointer-events: none; border-radius: inherit; opacity: 0; transition: opacity .45s var(--ease-out-quart);
    background:
      radial-gradient(farthest-corner circle at var(--px) var(--py), color-mix(in oklab, white 55%, transparent) 0%, transparent 38%),
      linear-gradient(115deg, transparent 18%, color-mix(in oklab, var(--primary) 70%, transparent) 34%, color-mix(in oklab, var(--accent) 70%, transparent) 48%, color-mix(in oklab, var(--glow) 70%, transparent) 62%, transparent 80%);
    background-size: 100% 100%, 260% 260%;
    background-position: center, var(--px) var(--py);
    mix-blend-mode: color-dodge; }
  .tp-holo[data-active] .tp-foil { opacity: .55; }
  .tp-cover { position: relative; overflow: hidden; isolation: isolate; }
  .tp-cover > img { transform: translate3d(calc(var(--dx, 0) * -14px), calc(var(--dy, 0) * -14px), 0) scale(1.06); transition: transform .9s var(--ease-out-expo), filter .6s var(--ease-out-quart); }
  .group:hover .tp-cover > img { transform: translate3d(calc(var(--dx, 0) * -14px), calc(var(--dy, 0) * -14px), 0) scale(1.14); }
  .tp-tile { transition: border-color .4s var(--ease-out-quart), box-shadow .5s var(--ease-out-quart), translate .5s var(--ease-out-expo); }
  .tp-tile:hover, .tp-tile:focus-visible { border-color: color-mix(in oklab, var(--primary) 70%, transparent); box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent), 0 30px 70px -28px var(--glow); translate: 0 -6px; }
  .tp-go { transition: transform .55s var(--ease-out-expo), background-color .3s, color .3s; }
  .group:hover .tp-go, .group:focus-visible .tp-go { transform: rotate(-45deg); background: var(--primary); color: var(--primary-foreground); }
  .tp-reveal-up { transform: translateY(.5rem); opacity: 0; transition: transform .5s var(--ease-out-expo), opacity .35s var(--ease-out-quart); }
  .group:hover .tp-reveal-up, .group:focus-visible .tp-reveal-up { transform: none; opacity: 1; }

  /* search: glow on focus + "/" hint */
  .tp-search { transition: box-shadow .35s var(--ease-out-quart), border-color .35s; }
  .tp-search:focus-within { box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 70%, transparent), 0 0 38px -8px var(--glow); border-color: color-mix(in oklab, var(--primary) 70%, transparent); }
  .tp-search:focus-within .tp-kbd { opacity: 0; }

  /* package radio: neon border that draws itself + check morph */
  .tp-pkg { position: relative; isolation: isolate; transition: background-color .35s var(--ease-out-quart), border-color .35s, box-shadow .45s var(--ease-out-quart), transform .2s var(--ease-out-quart); }
  .tp-pkg:not(:disabled):active { transform: scale(.98); }
  .tp-pkg .tp-draw { position: absolute; inset: -1px; width: calc(100% + 2px); height: calc(100% + 2px); overflow: visible; pointer-events: none; z-index: 1; }
  .tp-pkg .tp-draw rect { fill: none; stroke: var(--primary); stroke-width: 2px; stroke-dasharray: 1 1; stroke-dashoffset: 1; width: calc(100% - 2px); height: calc(100% - 2px); transition: stroke-dashoffset .8s var(--ease-out-expo); filter: drop-shadow(0 0 5px var(--glow)); }
  .tp-pkg[aria-checked="true"] .tp-draw rect { stroke-dashoffset: 0; }
  .tp-pkg .tp-check { transform: scale(0) rotate(-90deg); opacity: 0; transition: transform .45s var(--ease-spring, cubic-bezier(.34,1.56,.64,1)), opacity .2s; }
  .tp-pkg[aria-checked="true"] .tp-check { transform: none; opacity: 1; }

  /* step rail: number badge lights up when the step is done */
  .tp-step-n { transition: background-color .4s var(--ease-out-quart), color .4s, box-shadow .5s, border-color .4s; }
  .tp-step[data-done] .tp-step-n { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); box-shadow: 0 0 22px -4px var(--glow); }
  .tp-step .tp-step-ok { display: none; }
  .tp-step[data-done] .tp-step-ok { display: inline; }
  .tp-step[data-done] .tp-step-i { display: none; }
  .tp-rail-fill { transform-origin: top; transition: transform .8s var(--ease-out-expo); }

  /* glow pulse (OTP CTA) */
  @keyframes tp-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--glow) 55%, transparent), 0 0 26px -8px var(--glow); } 60% { box-shadow: 0 0 0 10px color-mix(in oklab, var(--glow) 0%, transparent), 0 0 40px -6px var(--glow); } }

  /* code reveal: flips like a card */
  @keyframes tp-flip-in { from { transform: perspective(700px) rotateX(-100deg); opacity: .15; } to { transform: none; opacity: 1; } }
  @keyframes tp-flip-out { from { transform: perspective(700px) rotateX(100deg); opacity: .15; } to { transform: none; opacity: 1; } }

  /* synthwave floor + horizon (CSS only, decorative) */
  .tp-floor { position: absolute; left: -40%; right: -40%; bottom: 0; height: 58%; transform: perspective(380px) rotateX(64deg); transform-origin: 50% 100%; pointer-events: none;
    background-image: linear-gradient(color-mix(in oklab, var(--primary) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--primary) 55%, transparent) 1px, transparent 1px);
    background-size: 56px 56px; -webkit-mask-image: linear-gradient(to top, black 5%, transparent 80%); mask-image: linear-gradient(to top, black 5%, transparent 80%); opacity: .55; }
  @keyframes tp-floor { to { background-position: 0 56px, 0 0; } }
  .tp-gridbg { background-image: linear-gradient(color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px); background-size: 40px 40px; }

  /* cover fan (games intro, decorative) */
  .tp-fan { position: relative; perspective: 1100px; }
  .tp-fan-card { position: absolute; left: 50%; top: 50%; width: 36%; aspect-ratio: 3 / 4; border-radius: 1.1rem; overflow: hidden; border: 1px solid color-mix(in oklab, var(--foreground) 16%, transparent); box-shadow: 0 30px 70px -24px rgba(0,0,0,.7), 0 0 50px -18px var(--glow);
    transform: translate(-50%, -50%) translateX(calc(var(--i) * 44%)) translateY(calc(var(--z) * 6%)) translateZ(calc(var(--z) * -90px)) rotateY(calc(var(--i) * -18deg)) rotateZ(calc(var(--i) * 5deg));
    transition: transform 1s var(--ease-out-expo); }
  .tp-fan-card img { width: 100%; height: 100%; object-fit: cover; }
  .tp-fan:hover .tp-fan-card { transform: translate(-50%, -50%) translateX(calc(var(--i) * 54%)) translateY(calc(var(--z) * 3%)) translateZ(calc(var(--z) * -60px)) rotateY(calc(var(--i) * -10deg)) rotateZ(calc(var(--i) * 3deg)); }
  .tp-fan-ring { position: absolute; left: 50%; top: 52%; width: 86%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; border: 1px solid color-mix(in oklab, var(--accent) 45%, transparent); box-shadow: 0 0 60px -10px var(--glow), inset 0 0 60px -20px var(--glow); }
  .tp-fan-ring::after { content: ""; position: absolute; inset: 12%; border-radius: 50%; border: 1px dashed color-mix(in oklab, var(--primary) 50%, transparent); }
  @keyframes tp-spin { to { rotate: 360deg; } }
  @keyframes tp-deal { from { opacity: 0; transform: translate(-50%, -30%) rotateX(40deg) scale(.8); } }

  /* live feed */
  .tp-feed-row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "t m s" "t x s"; column-gap: .875rem; row-gap: .125rem; align-items: center; }
  .tp-feed-row > [data-a="t"] { grid-area: t; } .tp-feed-row > [data-a="m"] { grid-area: m; } .tp-feed-row > [data-a="x"] { grid-area: x; } .tp-feed-row > [data-a="s"] { grid-area: s; }
  @media (min-width: 768px) {
    .tp-feed-row { grid-template-columns: auto minmax(0, 1fr) minmax(8.5rem, auto) 7.5rem; grid-template-areas: "t m x s"; column-gap: 1.25rem; }
    .tp-feed-row > [data-a="x"] { text-align: right; }
    .tp-feed-row > [data-a="s"] { justify-self: end; }
  }
  .tp-feed-row::before { content: ""; position: absolute; left: 0; top: 18%; bottom: 18%; width: 2px; border-radius: 2px; background: var(--tone, var(--primary)); box-shadow: 0 0 12px var(--tone, var(--glow)); }
  @keyframes tp-blink { 50% { opacity: .25; } }
  @keyframes tp-sweep { from { transform: translateY(-100%); } to { transform: translateY(400%); } }
  .tp-sweep { position: absolute; inset-inline: 0; top: 0; height: 30%; pointer-events: none; background: linear-gradient(to bottom, transparent, color-mix(in oklab, var(--primary) 9%, transparent), transparent); }

  /* balance card */
  .tp-balance-card { background:
      radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--primary) 55%, transparent), transparent 55%),
      radial-gradient(90% 120% at 0% 100%, color-mix(in oklab, var(--accent) 35%, transparent), transparent 60%),
      linear-gradient(140deg, color-mix(in oklab, var(--card) 92%, var(--primary)), color-mix(in oklab, var(--background) 90%, var(--primary)));
    border: 1px solid color-mix(in oklab, var(--primary) 40%, transparent);
    box-shadow: 0 40px 90px -40px var(--glow), inset 0 1px 0 color-mix(in oklab, white 14%, transparent); }
  .tp-chip { background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 60%, #d4b26a), #8a7340 70%); border-radius: .45rem; }

  @media (prefers-reduced-motion: no-preference) {
    .tp-pulse { animation: tp-pulse 2.4s var(--ease-out-quart) infinite; }
    .tp-code[data-flip="in"] { animation: tp-flip-in .65s var(--ease-out-expo); }
    .tp-code[data-flip="out"] { animation: tp-flip-out .65s var(--ease-out-expo); }
    .tp-floor { animation: tp-floor 2.6s linear infinite; }
    .tp-fan-ring { animation: tp-spin 40s linear infinite; }
    .tp-fan-card { animation: tp-deal 1.1s var(--ease-out-expo) backwards; animation-delay: calc(var(--n) * 90ms + 150ms); }
    .tp-live { animation: tp-blink 1.2s steps(2, jump-none) infinite; }
    .tp-sweep { animation: tp-sweep 5.5s linear infinite; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tp-holo, .tp-holo[data-active] { transform: none !important; }
    .tp-foil { display: none; }
    .tp-cover > img, .group:hover .tp-cover > img { transform: none; }
    .tp-tile:hover, .tp-tile:focus-visible { translate: none; }
    .tp-pkg .tp-draw rect, .tp-pkg .tp-check, .tp-rail-fill { transition: none; }
  }
}
`;

export function TopupStyles() {
  return (
    <style href="rw-topup" precedence="default">
      {CSS}
    </style>
  );
}

/** Four HUD corner brackets; `hover` = hidden until the parent `.group` is hovered / focused. */
export function Brackets({ hover = false, size, className }: { hover?: boolean; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`tp-brk${className ? ` ${className}` : ""}`} data-hover={hover ? "" : undefined} style={size ? ({ "--b": `${size}px` } as React.CSSProperties) : undefined}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
