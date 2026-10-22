import * as React from "react";

/**
 * Commerce module CSS (cards, quick-add, chips, category index, 3D gallery stack, operational polish). Hoisted and
 * de-duplicated by React 19 (`<style href precedence>`), so every component can render <CommerceStyles/>.
 * Theme tokens only (tenants recolour everything); hidden start states and keyframes live under
 * `prefers-reduced-motion: no-preference`, so reduced motion / no-JS always shows the final, static page.
 * Card personality keys on the theme's card shape: html[data-card="brutal"] (candy …) = sticker cards.
 */
const CSS = /* css */ `
@layer components {
  :root { --rwc-ease: var(--ease-out-expo, cubic-bezier(.16,1,.3,1)); --rwc-spring: var(--ease-spring, cubic-bezier(.34,1.56,.64,1)); --rwc-quart: var(--ease-out-quart, cubic-bezier(.25,1,.5,1)); }

  /* ---------------- product cards ---------------- */
  .rwc-card { position: relative; container-type: inline-size; --rwc-r: 1.25; }
  .rwc-card[data-ratio="3/4"] { --rwc-r: 1.3333; }
  .rwc-card[data-ratio="1/1"] { --rwc-r: 1; }
  .rwc-media { position: relative; overflow: hidden; background: var(--muted); isolation: isolate; aspect-ratio: 1 / var(--rwc-r); }
  .rwc-img, .rwc-img2 { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .rwc-img { transition: transform 1.1s var(--rwc-ease), filter .6s var(--rwc-quart); }
  .rwc-noimg { display: grid; place-items: center; color: color-mix(in oklab, var(--foreground) 22%, transparent);
    background: radial-gradient(120% 90% at 30% 20%, color-mix(in oklab, var(--primary) 14%, var(--muted)), var(--muted) 62%); }
  .rwc-noimg > span { font-size: clamp(3rem, 30cqw, 9rem); line-height: 1; }
  .rwc-img2 { clip-path: inset(100% 0 0 0); transform: scale(1.08); transition: clip-path .9s var(--rwc-ease), transform 1.2s var(--rwc-ease); }
  .rwc-card:is(:hover, :focus-within) .rwc-img { transform: scale(1.06); }
  .rwc-card:is(:hover, :focus-within) .rwc-img2 { clip-path: inset(0 0 0 0); transform: scale(1.02); }
  .rwc-card[data-soldout] .rwc-img { filter: grayscale(1) contrast(.9); }
  .rwc-title { transition: color var(--dur-ui, 320ms) var(--rwc-quart); }
  .rwc-card:hover .rwc-title { color: var(--primary-ink, var(--primary)); }
  .rwc-no { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; letter-spacing: .08em; font-variant-numeric: tabular-nums; }
  .rwc-bignum { font-family: var(--font-accent, var(--font-display)); font-style: italic; line-height: .8; letter-spacing: -.02em; }
  html[data-accent="fraunces"] .rwc-bignum { font-style: normal; font-weight: 700; }
  .rwc-line { height: 1px; background: currentColor; opacity: .25; transform-origin: left; transition: transform .9s var(--rwc-ease), opacity .4s; }
  .rwc-card:hover .rwc-line { opacity: .9; }

  /* badges */
  .rwc-badge { display: inline-flex; align-items: center; gap: .35em; height: 1.625rem; padding-inline: .6rem; font-size: .75rem; font-weight: 600; line-height: 1; border-radius: var(--radius-sm, 4px); background: var(--background); color: var(--foreground); box-shadow: 0 1px 0 color-mix(in oklab, var(--foreground) 12%, transparent); }
  .rwc-badge[data-kind="sale"] { background: var(--primary); color: var(--primary-foreground); }
  .rwc-badge[data-kind="best"] { background: var(--accent); color: var(--accent-foreground); }
  .rwc-badge[data-kind="soldout"] { background: var(--foreground); color: var(--background); }
  html[data-card="brutal"] .rwc-badge { border: 2px solid var(--foreground); border-radius: 999px; box-shadow: 2px 2px 0 var(--foreground); }
  html[data-card="brutal"] .rwc-badges > :nth-child(odd) { rotate: -5deg; }
  html[data-card="brutal"] .rwc-badges > :nth-child(even) { rotate: 4deg; }

  /* quick add: pill that slides up over the photo (fine pointers) / always-on round button (touch) */
  .rwc-quick { position: absolute; z-index: 3; inset-inline-end: .75rem; top: calc(var(--rwc-r) * 100cqw - 3.5rem); }
  .rwc-quick-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; height: 2.75rem; min-width: 2.75rem; padding-inline: 1rem; border-radius: 999px;
    background: var(--background); color: var(--foreground); font-size: .875rem; font-weight: 600; white-space: nowrap;
    box-shadow: 0 10px 30px -12px color-mix(in oklab, var(--foreground) 45%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent);
    transition: transform var(--dur-ui, 320ms) var(--rwc-spring), background-color var(--dur-micro, 160ms), color var(--dur-micro, 160ms), opacity var(--dur-ui, 320ms) var(--rwc-quart); }
  .rwc-quick-btn:hover { background: var(--foreground); color: var(--background); }
  .rwc-quick-btn:active { transform: scale(.94); }
  .rwc-quick-btn[data-state="done"] { background: var(--primary); color: var(--primary-foreground); }
  html[data-card="brutal"] .rwc-quick-btn { border: 2px solid var(--foreground); box-shadow: 3px 3px 0 var(--foreground); }
  .rwc-quick-label { display: inline; }
  @media (hover: none), (pointer: coarse) {
    .rwc-quick-btn { padding-inline: 0; width: 2.75rem; }
    .rwc-quick-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  }
  @media (hover: hover) and (pointer: fine) {
    .rwc-quick { inset-inline: .75rem; display: flex; justify-content: center; }
    .rwc-quick-btn { width: 100%; }
    @media (prefers-reduced-motion: no-preference) {
      .rwc-quick-btn { opacity: 0; transform: translateY(14px); }
      .rwc-card:is(:hover, :focus-within) .rwc-quick-btn, .rwc-quick-btn[data-state] { opacity: 1; transform: none; }
    }
  }

  /* chrome card (standard / hover-swap) */
  .rwc-chrome { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .rwc-chrome .rwc-media { border-radius: 0; }

  /* sticker cards: theme card shape "brutal" */
  html[data-card="brutal"] .rwc-card[data-style="standard"] { --rwc-tilt: 1.8deg; }
  html[data-card="brutal"] .rwc-card[data-style="standard"][data-odd] { --rwc-tilt: -2deg; }
  html[data-card="brutal"] .rwc-card[data-style="standard"] .card { transition: transform .55s var(--rwc-spring), box-shadow .55s var(--rwc-spring); }
  @media (prefers-reduced-motion: no-preference) and (hover: hover) {
    html[data-card="brutal"] .rwc-card[data-style="standard"]:hover .card { transform: translate(-3px, -4px) rotate(var(--rwc-tilt)); box-shadow: 9px 10px 0 0 var(--foreground); }
    html[data-card="brutal"] .rwc-card[data-style="standard"]:hover .rwc-img { transform: scale(1.08) rotate(calc(var(--rwc-tilt) * -1)); }
    .rwc-quick-btn[data-press="0"] { animation: rwc-jelly .55s var(--rwc-quart); }
    .rwc-quick-btn[data-press="1"] { animation: rwc-jelly2 .55s var(--rwc-quart); }
  }
  html:is([data-accent="fraunces"], [data-accent="unbounded"], [data-accent="space-grotesk"]) .rwc-price-accent .font-semibold { font-family: var(--font-accent, inherit); font-weight: 700; letter-spacing: -.01em; }

  /* ---------------- category index (hover-reveal rows) ---------------- */
  .rwc-index { border-top: 1px solid color-mix(in oklab, var(--foreground) 85%, transparent); }
  .rwc-index-row { position: relative; display: grid; grid-template-columns: 2.25rem minmax(0, 1fr) auto; align-items: center; gap: clamp(.75rem, 2vw, 2rem); padding-block: clamp(1rem, 2.4vw, 2rem);
    border-bottom: 1px solid color-mix(in oklab, var(--foreground) 85%, transparent); transition: opacity .5s var(--rwc-quart), color .3s; }
  .rwc-index-name { display: inline-block; transition: transform .8s var(--rwc-ease), color .3s; }
  @media (min-width: 640px) { .rwc-index-row { grid-template-columns: 3rem minmax(0, 1fr) auto; } }
  .rwc-index-thumb { width: 3.5rem; aspect-ratio: 4 / 5; object-fit: cover; border-radius: var(--radius-md, 6px); }
  @media (hover: hover) and (pointer: fine) {
    .rwc-index:hover .rwc-index-row:not(:hover) { opacity: .28; }
    .rwc-index-row:is(:hover, :focus-visible) .rwc-index-name { transform: translateX(clamp(.5rem, 2vw, 2.5rem)); color: var(--primary-ink, var(--primary)); }
    .rwc-index-row .rwc-index-arrow { transition: transform .6s var(--rwc-ease); }
    .rwc-index-row:is(:hover, :focus-visible) .rwc-index-arrow { transform: rotate(-45deg); }
    .rwc-index-thumb { display: none; }
  }

  /* ---------------- chips / filter bar ---------------- */
  .rwc-chips { display: flex; gap: .5rem; overflow-x: auto; scrollbar-width: none; padding-block: .25rem; }
  .rwc-chips::-webkit-scrollbar { display: none; }
  .rwc-chip { position: relative; isolation: isolate; display: inline-flex; flex-shrink: 0; align-items: center; gap: .5rem; height: 2.75rem; padding-inline: 1.1rem; border-radius: 999px; font-size: .9rem; font-weight: 500;
    border: 1px solid color-mix(in oklab, var(--foreground) 22%, transparent); transition: color var(--dur-ui, 320ms) var(--rwc-quart), border-color var(--dur-ui, 320ms); }
  .rwc-chip:hover { border-color: var(--foreground); }
  .rwc-chip[data-active] { color: var(--background); border-color: transparent; }
  .rwc-chip-pill { position: absolute; inset: -1px; z-index: -1; border-radius: inherit; background: var(--foreground); }
  .rwc-chip-count { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; opacity: .65; font-variant-numeric: tabular-nums; }
  html[data-card="brutal"] .rwc-chip { border: 2px solid var(--foreground); }
  html[data-card="brutal"] .rwc-chip-pill { background: var(--primary); }
  html[data-card="brutal"] .rwc-chip[data-active] { color: var(--primary-foreground); }
  .rwc-field-line { position: relative; }
  .rwc-field-line::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--primary); transform: scaleX(0); transform-origin: left; transition: transform .45s var(--rwc-ease); pointer-events: none; }
  .rwc-field-line:focus-within::after { transform: scaleX(1); }
  .rwc-select { appearance: none; height: 2.75rem; border-radius: 999px; padding-inline: 2.4rem 2.2rem; font-size: .875rem; background: transparent; border: 1px solid color-mix(in oklab, var(--foreground) 22%, transparent); }
  .rwc-select:hover { border-color: var(--foreground); }
  html[data-card="brutal"] .rwc-select { border: 2px solid var(--foreground); }

  /* ---------------- product gallery: draggable CSS-3D card stack ---------------- */
  .rwc-stack { position: relative; perspective: 1600px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .rwc-stack-card { position: absolute; inset: 0; overflow: hidden; background: var(--muted); border-radius: var(--radius-xl, 12px); transform-origin: 50% 110%; will-change: transform;
    transition: transform .9s var(--rwc-ease), opacity .6s var(--rwc-quart), filter .6s; box-shadow: 0 40px 80px -40px color-mix(in oklab, var(--foreground) 45%, transparent); }
  .rwc-stack[data-dragging] .rwc-stack-card[data-pos="0"] { transition: none; }
  .rwc-stack-card img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .rwc-stack-btn { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--foreground) 22%, transparent); background: var(--background); transition: background-color .2s, color .2s; }
  .rwc-stack-btn:hover:not(:disabled) { background: var(--foreground); color: var(--background); }
  .rwc-stack-btn:disabled { opacity: .35; }
  .rwc-zoom { position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in oklab, var(--background) 92%, transparent); backdrop-filter: blur(10px); cursor: zoom-out; overflow: hidden; }
  .rwc-zoom img { max-width: 100%; max-height: 100%; object-fit: contain; transition: transform .5s var(--rwc-ease); }
  .rwc-zoom[data-zoomed] img { transform: scale(var(--z, 2)) translate(var(--zx, 0), var(--zy, 0)); transition: none; }

  /* variant chips */
  .rwc-opt { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; height: 2.75rem; min-width: 2.75rem; padding-inline: 1rem; font-size: .875rem; font-weight: 500;
    border: 1px solid color-mix(in oklab, var(--foreground) 25%, transparent); border-radius: var(--btn-radius, var(--radius-md)); transition: color .25s var(--rwc-quart), border-color .25s; }
  .rwc-opt:hover:not(:disabled) { border-color: var(--foreground); }
  .rwc-opt[aria-pressed="true"] { color: var(--background); border-color: var(--foreground); }
  .rwc-opt-pill { position: absolute; inset: -1px; z-index: -1; border-radius: inherit; background: var(--foreground); }
  .rwc-opt[data-soldout] { color: var(--muted-foreground); text-decoration: line-through; }
  html[data-card="brutal"] .rwc-opt { border: 2px solid var(--foreground); }

  /* add-to-cart morph */
  .rwc-add { position: relative; overflow: hidden; }
  .rwc-add-inner { display: inline-flex; align-items: center; gap: .5rem; transition: transform .45s var(--rwc-ease), opacity .3s; }
  .rwc-add-done { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: .5rem; transform: translateY(110%); transition: transform .45s var(--rwc-ease); }
  .rwc-add[data-state="done"] .rwc-add-inner { transform: translateY(-110%); opacity: 0; }
  .rwc-add[data-state="done"] .rwc-add-done { transform: none; }
  .rwc-fly { position: fixed; z-index: 90; pointer-events: none; border-radius: 999px; object-fit: cover; box-shadow: 0 12px 30px -10px color-mix(in oklab, var(--foreground) 50%, transparent); }

  /* ---------------- operational polish (§6.4) ---------------- */
  .rwc-steps { --rwc-fill: 0; }
  .rwc-steps-track { position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: color-mix(in oklab, var(--foreground) 12%, transparent); }
  .rwc-steps-fill { position: absolute; inset: 0; background: var(--primary); transform-origin: left; transform: scaleX(var(--rwc-fill)); }
  .rwc-step-dot { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 999px; font-family: var(--font-mono, ui-monospace, monospace); font-size: .75rem; background: var(--background);
    border: 1.5px solid color-mix(in oklab, var(--foreground) 22%, transparent); color: var(--muted-foreground); }
  .rwc-step[data-state="done"] .rwc-step-dot { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
  .rwc-step[data-state="current"] .rwc-step-dot { border-color: var(--primary); color: var(--primary-ink, var(--primary)); box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 18%, transparent); }
  .rwc-num { font-family: var(--font-mono, ui-monospace, monospace); font-size: .75rem; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
  .rwc-sec-index { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 999px; font-family: var(--font-mono, ui-monospace, monospace); font-size: .75rem;
    background: var(--foreground); color: var(--background); }
  .rwc-input-line { position: relative; }
  .rwc-input-line::after { content: ""; position: absolute; left: var(--btn-radius, 0px); right: var(--btn-radius, 0px); bottom: 0; height: 2px; border-radius: 2px; background: var(--primary); transform: scaleX(0); transition: transform .35s var(--rwc-ease); pointer-events: none; }
  .rwc-input-line:focus-within::after { transform: scaleX(1); }
  .rwc-radio-dot { position: relative; flex-shrink: 0; width: 1.25rem; height: 1.25rem; border-radius: 999px; border: 1.5px solid color-mix(in oklab, var(--foreground) 35%, transparent); transition: border-color .2s; }
  .rwc-radio-dot::after { content: ""; position: absolute; inset: 3px; border-radius: inherit; background: var(--primary); transform: scale(0); transition: transform .35s var(--rwc-spring); }
  [data-checked] > .rwc-radio-dot, [data-checked] .rwc-radio-dot { border-color: var(--primary); }
  [data-checked] > .rwc-radio-dot::after, [data-checked] .rwc-radio-dot::after { transform: scale(1); }
  .rwc-receipt { position: relative; }
  .rwc-receipt::after { content: ""; position: absolute; left: 0; right: 0; bottom: -9px; height: 10px; background: radial-gradient(circle at 10px -2px, transparent 8px, var(--card) 8.5px) 0 0 / 20px 10px repeat-x; }
  .rwc-route-dot { display: none; place-items: center; }
  .rwc-mono-label { font-family: var(--font-mono, ui-monospace, monospace); font-size: .6875rem; letter-spacing: .1em; text-transform: uppercase; }
  .rwc-mono-label[data-script="thai"] { text-transform: none; letter-spacing: .02em; font-family: inherit; font-weight: 600; font-size: .75rem; }
}

@media (prefers-reduced-motion: no-preference) {
  .rwc-flash { animation: rwc-flash .45s var(--rwc-quart, ease); }
  .rwc-rise { animation: rwc-rise .5s var(--rwc-quart, ease) both; }
  .rwc-rule-draw { transform-origin: left; animation: rwc-fill 1.3s var(--rwc-ease, ease) .25s both; }
  .rwc-steps-fill { animation: rwc-fill 1.1s var(--rwc-ease, ease) .2s both; }
  .rwc-bob { animation: rwc-bob 3.2s ease-in-out infinite; }
  .rwc-shadow-bob { animation: rwc-shadow 3.2s ease-in-out infinite; }
  .rwc-check path { stroke-dasharray: 30; stroke-dashoffset: 30; animation: rwc-draw .7s var(--rwc-ease, ease) .25s forwards; }
  .rwc-check circle { stroke-dasharray: 160; stroke-dashoffset: 160; animation: rwc-draw 1s var(--rwc-ease, ease) forwards; }
  .rwc-route-dot { display: grid; offset-path: var(--rwc-route); offset-rotate: 0deg; animation: rwc-route 4.5s var(--rwc-quart, ease) infinite; }
  .rwc-dash { stroke-dasharray: 6 8; animation: rwc-dash 1.2s linear infinite; }
  .rwc-pop { animation: rwc-pop .6s var(--rwc-spring, ease) both; }
}
@keyframes rwc-fill { from { transform: scaleX(0); } }
@keyframes rwc-flash { 0% { color: var(--primary); } 100% { color: inherit; } }
@keyframes rwc-rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes rwc-jelly { 0% { transform: scale(1); } 30% { transform: scale(1.18, .82); } 45% { transform: scale(.86, 1.14); } 60% { transform: scale(1.06, .94); } 75% { transform: scale(.98, 1.02); } 100% { transform: scale(1); } }
@keyframes rwc-jelly2 { 0% { transform: scale(1); } 30% { transform: scale(1.18, .82); } 45% { transform: scale(.86, 1.14); } 60% { transform: scale(1.06, .94); } 75% { transform: scale(.98, 1.02); } 100% { transform: scale(1); } }
@keyframes rwc-bob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-12px) rotate(3deg); } }
@keyframes rwc-shadow { 0%, 100% { transform: scaleX(1); opacity: .22; } 50% { transform: scaleX(.75); opacity: .12; } }
@keyframes rwc-draw { to { stroke-dashoffset: 0; } }
@keyframes rwc-route { 0% { offset-distance: 0%; } 70%, 100% { offset-distance: 100%; } }
@keyframes rwc-dash { to { stroke-dashoffset: -28; } }
@keyframes rwc-pop { from { opacity: 0; transform: scale(.6); } }
`;

export function CommerceStyles() {
  return (
    <style href="rw-commerce" precedence="default">
      {CSS}
    </style>
  );
}
