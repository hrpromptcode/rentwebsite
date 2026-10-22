# kitmotion progress (motion / front-end kit) — DONE 2026-10-22
Owner: packages/ui/src/{motion,fx,styles}/**, packages/ui/package.json (exports + sideEffects), packages/ui/src/lib/utils.ts (tailwind-merge groups), apps/web/src/app/(platform)/lab/motion/**, tooling/qa/redesign/kitmotion-shots.ts

## status
- all §3.2 / §3.3 items built; lab page http://localhost:3000/lab/motion (dev only, notFound in production, noindex)
- verified with tooling/qa/redesign/kitmotion-shots.ts (run from tooling/: `pnpm exec tsx qa/redesign/kitmotion-shots.ts [--only=checks|desktop|mobile|reduce|preloader|theme|tenants]`):
  0 console / hydration errors at 1440 + 390, no horizontal overflow, reduced motion = complete static page (no Lenis, all units final),
  forced preloader OK, theme recolour (noir → candy → porcelain) restyles everything, demo-shop / salon / events homes (TextReveal alias) clean.
  Screenshots: tooling/screenshots/redesign-kitmotion-*.png (reviewed).
- `pnpm --filter @rentweb/ui --filter @rentweb/storefront --filter @rentweb/web typecheck` green.

## decisions / gotchas (read before using the kit)
- Accessible names & Playwright: Playwright's accname adds spaces around inline-block children ("ร้าน ค้า") and getByText strict mode fails on duplicated text. Therefore
  SplitReveal / LetterDrop keep the real text in the split spans (textContent once) + `aria-label` on h1–h6;
  RollText keeps the real text ONCE as a transparent overlay (it is the hit target, the accessible name and the getByText match); visible glyphs are aria-hidden CSS generated content;
  Odometer / WordCycler / Cursor label / Preloader brand: sr-only text once, visuals are generated content (`[data-pt]::before{content:attr(data-pt)}`).
- Masks clip with `clip-path: inset(negative…)`, never `overflow: hidden` on inline-blocks (that moves the baseline to the bottom edge and inflates line boxes).
- Counter is NOT an Odometer alias: wallet (operational) renders the balance with Counter and topup-journey reads "฿306" as text. Marquee (CSS, server-safe) stays as is; VelocityMarquee is the scroll-reactive one.
- Reveals = CSS transitions keyed on data attributes; start states only under `(prefers-reduced-motion: no-preference) and (scripting: enabled)`.
- Scroll-linked effects share one batched read→write loop (motion/scroll-loop.ts) that runs inside Lenis' scroll emit (no frame lag) or rAF after native scroll; gated by IntersectionObserver. GSAP is loaded only by SmoothScroll (lazy) and by code importing `@rentweb/ui/motion/gsap`.
- Preloader: inline script (render as FIRST child of <body>) injects `<style id="rw-preloader-css">` into <head> + `window.__rwPreloader="on"` — no html attribute before hydration (React would flag a mismatch). Skipped for webdriver (Playwright), bots, reduced motion, Save-Data, repeat visits, non-matching paths. `?preloader=force` with `allowForce`.
- RouteTransition takes `routeKey` instead of next/navigation (packages/ui has no next dependency). In template.tsx it animates every remount except the first page load (StrictMode-safe).
- html[data-cursor] is the shell's theme flag; Cursor ignores html/body when resolving `[data-cursor]` zones and sets html[data-cursor-active] itself.
- cn() (lib/utils) now knows `text-step-*`, `font-accent|mono|display|heading|body`, `shadow-float|glow` (plain tailwind-merge dropped `text-step-5` next to `text-primary`).
- Turbopack: never add an `@import` for a CSS file before the file exists — the failed resolve is cached (site-wide 500). Fix = real content change in apps/web/src/app/globals.css (touch is not enough).

## PUBLIC API
Imports: `@rentweb/ui/motion` (barrel), `@rentweb/ui/fx` (barrel), subpaths `@rentweb/ui/motion/<file>`, `@rentweb/ui/fx/<file>`,
`@rentweb/ui/motion/gsap` · `/split` · `/prefs` · `/random` (.ts). S = server-safe (no "use client"), C = client.

### page level
- `SmoothScroll` C `{ enabled?=true, disabledRoutes?: RegExp|string, lerp?=0.1 }` — Lenis on the GSAP ticker (prioritised, lagSmoothing 0) + `ScrollTrigger.update`; lazy-loads lenis+gsap; off under reduced motion, on touch-only devices, html[data-route="operational"], html[data-smooth="false"]; re-evaluates on attribute / media changes; `lenis.stop()` while body[data-scroll-locked]; dialogs/menus/selects/iframes/textarea/`[data-lenis-prevent]` + nested scrollers scroll natively; same-page hash links → smooth scroll minus `--header-h`, pushState hash, focus target; one instance per document.
- `useLenis()` C → Lenis | null · `getLenis()` · `scrollToTarget(target: number|string|HTMLElement, {offset?, duration?, immediate?})` (Lenis or native; instant under reduced motion; default offset −header).
- `Preloader` S `{ brand, logoUrl?, variant?: "counter"|"wordmark"|"curtain"="counter", minMs?=600, maxMs?=1200, onceKey?="rw-preloaded", paths?=["/"], allowForce?=false }` — overlay `--foreground` bg / `--background` text, mono counter 000→100, grapheme rise, `--ease-in-out-circ` curtain; sets html[data-preloaded], fires `rw:preloaded`.
- `RouteTransition` C `{ style?: "none"|"fade"|"rise"|"curtain"="fade", routeKey?, children, className? }` · `RouteProgress` C `{ className? }` (2px --primary bar; starts on same-origin link click, completes on URL change; also `rw:route-start` / `rw:route-done` events).
- `ScrollProgress` C `{ variant?: "bar"|"ring"="bar", size?=44, className? }` (bar is fixed top, z 45).
- `BackToTop` C `{ label?="กลับขึ้นด้านบน", ring?=true, className? }` (RollText label, progress ring, Lenis scroll, focuses the first header link).
- `LiveClock` C `{ tz?="Asia/Bangkok", label?="กรุงเทพฯ", seconds?=false, hour12?=false, pulse?=true, className? }` (SSR "--:--", fills after mount; `.mono-label`).
- fx `CursorProvider` C `{ mode?: "off"|"dot"|"label"="dot", blend?=false, children? }` · `Cursor` C `{ mode, blend }` · `useCursor().set({kind,label}|null)` or `window.dispatchEvent(new CustomEvent("rw:cursor",{detail}))`. Zones: `data-cursor="view|drag|play|link|text|hide"` + `data-cursor-label="…"` (defaults ดู / ลาก / เล่น). Fine pointer + motion + marketing route only; hides itself over form fields; native cursor hidden only inside zones.
- fx `Grain` S `{ opacity?=0.05 (≤0.12), animated?=true, className? }` (fixed, z 45, replaces the static data-grain texture).

### text (all Thai-safe; segmentation on the server)
- `SplitReveal` S `{ text, as?="h2" (h1–h6|p|span|div|blockquote), mode?: "words"|"lines"|"chars"="words", from?: "mask"|"below"|"blur"|"rotate"="mask", trigger?: "inView"|"mount"|"scrub"="inView", delay?(s), stagger?(s; cascade capped 0.9s), duration?(s), className?, id?, style?, segment?: "words"|"spaces"="words" }` — renders `data-script`; mount waits for the preloader. `segment="spaces"` splits only on whitespace (proper names). `TextReveal` = alias (old props kept).
- `ScrubText` S `{ text, as?="p", className?, start?=0.85, end?=0.3 }` — words 20%→100% opacity with scroll.
- `RollText` S `{ children: string, mode?: "auto"|"chars"|"word"="auto", underline?, className? }` — rolls on hover/focus of the nearest a / button / [role=button] / label / summary / `.group` / `[data-roll-group]`.
- `WordCycler` C `{ words, interval?=2200, mode?: "roll"|"blur"|"flip"="roll", srJoin?=", ", className?, onChange?(index) }` — onChange: 0 on mount, then every change (sync a 3D shape etc.).
- `ThaiWrap` S `{ text }` — plain (non-animated) Thai display text: kit word segments as nowrap spans + `<wbr>` between Thai words, so lines only break between real words (server only; used by storefront RevealHeading fx=off + DisplayText).
- `LetterDrop` S `{ text, as?="h2", bounce?=0.5, trigger?: "inView"|"mount", className? }` (Thai ≤ 12 graphemes per grapheme, else per word).
- `Odometer` S `{ value: number|string, locale?="th-TH", decimals?, prefix?, suffix?, duration?=1.6, trigger?, className? }` — MARKETING ONLY.
- `GiantWordmark` S `{ text, effect?: "rise"|"parallax"|"spotlight"|"marquee"|"none"="rise", outline?, image?, as?="p", decorative?=false, cap?, className? }` — container-query fit-to-width, one client refinement; Thai cap 14vw, Latin `--step-8`.
- split helpers (`@rentweb/ui/motion/split`, pure): `isThai`, `scriptOf` → "thai"|"latin"|"mixed", `graphemes`, `graphemeCount`, `splitWords`, `splitGraphemes(text, maxThai=12)`, `tokenize(text,{chars?,maxThai?,segment?})`, `segmentText`, `glueMaiYamok`, `estimateEm`, `THAI_GLUE_WORDS`.
  Thai word segmentation repairs ICU loanword misses (phase 3): THAI_GLUE_WORDS are never split ("บีชฟรอนต์", "โฟล์ก", "เวิร์กช็อป",
  "ไอเดีย", "สตูดิโอ" …), a fragment that starts with a combining mark or whose first cluster carries ์ joins the previous word, and
  U+2060 WORD JOINER is honoured. Add new loanwords to THAI_GLUE_WORDS (avoid short entries that occur across real word boundaries).

### media / layout
- `ImageReveal` C `{ src?, alt?, children? (own <img>/<Image>), from?: "bottom"|"top"|"left"|"right"|"center"|"circle", scaleFrom?=1.18, parallax?=0.08 (≤0.12), priority?, sizes?, srcSet?, width?, height?, aspect? ("4/5"), delay?(s), cursor?, cursorLabel?, className?, imgClassName? }` (priority = visible from first paint, only the scale settles).
- `ParallaxMedia` C `{ speed?=-0.15, scale?=1.12, children, className?, innerClassName? }` (clamped so edges never show; off for subtle level / reduced motion). `Parallax` (old) kept.
- `VelocityMarquee` C `{ items: ReactNode[], speed?=40 px/s, direction?: 1|-1, reactToScroll?=true, skew?=true (expressive only, ≤6°), separator?, outline?: boolean|"alternate", size?: "sm"|"md"|"lg"|"giant", pauseOnHover?=true, gap?, label?, className? }`.
- `StickyStory` C `{ items: {key,title,kicker?,body?,chips?,media: ReactNode}[], side?: "left"|"right", mediaMode?: "crossfade"|"clip"|"stack", counter?=true, titleAs?="h3", idPrefix?, className? }` (stacked < 768px and under reduced motion).
- `HorizontalScroll` C `{ children, label, snap?=true, progress?=true, header?: ReactNode, prevLabel?="ก่อนหน้า", nextLabel?="ถัดไป", className?, trackClassName? }` (pinned via CSS sticky ≥ 768 + motion; native swipe + 44px buttons otherwise).
- `ScatterCards` S `{ cards: {image,alt?,title?,tag?,avatar?}[], seed, density?: "airy"(8)|"dense"(12), float?=true, assemble?: "none"|"in"|"out"="in", minHeight?, className?, children (centred headline) }`.
- `HoverPreview` C `{ children, as?="div", width?=320, ratio?=1.6, className? }` — rows with `data-preview-src` (+`data-preview-alt`).
- `Magnetic` C `{ strength?=0.35, max?=10, inner?=1.4, as?="span", className?, children }` (`[data-magnetic-inner]` child moves extra).
- `Reveal`, `Stagger`/`StaggerItem`, `TiltCard` (max 6), `Counter`, `Marquee`, `MotionRoot` — unchanged APIs, retuned to `--ease-out-expo` / 900ms.
- fx `GlowCard` C `{ as?, radius?=320, border?=true, …HTML attrs }` · `DisplaceImage` C `{ children? | src, alt, strength?=18, … }` · `GradientBorder` S `{ as?, width?=1.5, speed?=6, colors?, …HTML attrs }`.
- fx `HeroBackground` kinds += `"shader-aurora"|"shader-silk"|"shader-mesh"|"shader-caustics"` (kit3d ShaderBackdrop, poster SSR).
- fx `HeroScene` S `{ kind?: SceneKind="auto", preset, image?, imageAlt?, cards?: {image,title,badge?,href?}[], words?, className? }` + `resolveSceneKind(kind, preset)`, `SCENE_BY_PRESET`, `SCENE_KINDS` (SceneKind = auto|none|particle-morph|floating-objects|card-stack|breathing-orb|image-silk|ocean|stage-lights|steam|water-ripple|shader). Falls back to a shader backdrop when image/cards are missing.

### hooks / helpers
- `@rentweb/ui/motion/gsap`: `gsap, ScrollTrigger, Flip, Observer, CustomEase, useGSAP, registerGsap(), mm(fn, scope?)` (conditions reduce / motion / fine / desktop), `DUR`, `EASE` ("rw.expo|quart|circ|spring"), `refreshScroll()`.
- `@rentweb/ui/motion/prefs`: `useMotionPrefs()` {ready,reduce,fine,desktop,level}, `prefersReducedMotion()`, `isFinePointer()`, `motionLevel()`, `isOperationalRoute()`, `isBot()`, `useEnterOnce(ref, cb)`, `useVisibility(ref, cb)`, `whenPreloaded(maxMs)`, `useIsoLayoutEffect`, `onFrame(cb)`.
- `subscribeScroll({read,write})`, `useScrollEffect(ref, {read,write}, {enabled?, margin?, always?})`, `requestScrollTick()`.
- random (re-export of three/core/random): `mulberry32`, `seedFromString`, `seeded`, `rand`.

### CSS (styles/globals.css tokens + styles/motion-kit.css)
- tokens: `--ease-out-expo|quart`, `--ease-in-out-circ`, `--ease-spring`, `--dur-micro|ui|reveal|hero|curtain`, `--stagger-*`, `--step--1 … --step-8`, `--leading-thai-display` (1.25; theme may set 1.2/1.28), `--leading-thai-body`, `--leading-latin-display`, `--gutter`, `--section-y`, `--shadow-float|glow`, `--font-accent` (defaults to display), `--font-mono` (JetBrains via `--font-jetbrains-mono`, falls back).
- utilities: `text-step-0…8`, `section-y`, `px-gutter`, `shadow-float`, `shadow-glow`, `font-accent`, `font-mono`, `ease-out-quart`, `ease-in-out-circ`; classes `.display-thai`, `.display-latin`, `.mono-label`, `.glass`, `.eyebrow`/`[data-eyebrow]` (Thai: 0.02em, no uppercase).
- focus ring offset 3px; Lenis CSS (`html.lenis{height:auto; scroll-behavior:auto}`); `[data-pt]::before{content:attr(data-pt)}`.
