# RentWeb Hi-End Redesign: Art Direction & Build Spec

Owner request (2026-10-21): every site type, every page and the platform showcase must become a **hi-end 3D / motion / creative** experience (refs: vyre-studio.com, fastwork.com/selling, used for inspiration only). This document is the single source of truth for all builder agents. Where it names a component, prop or file, build exactly that. Where it is silent, follow the principles in §1–§2.

Status: v1, written by the `direction` agent. Before screenshots: `tooling/screenshots/redesign-before-<site>-<1440|390>.png` (script `tooling/qa/redesign/before-shots.ts`).

Contents: §0 Audit · §1 Principles · §2 Global design language · §3 Kit spec (3D + motion) · §4 Platform showcase · §5 The 10 templates · §6 Storefront shell · §7 Sections · §8 Ownership & phases · §9 Definition of done

---

## 0. Audit of the current state (what is weak, concretely)

Every one of the 42 before-shots loads with 0 console errors. Function is solid; the design is not.

| # | Finding | Where |
|---|---|---|
| A1 | **Clone layouts.** Clinic, cafe, course and corporate heroes are the same split composition: copy, 2 buttons, chips, a 3-stat row on the left, a rounded photo with a small inset thumbnail on the right. Only the colours change. | clinic, cafe, course, corporate |
| A2 | **No visual in the first mobile viewport.** At 390×844, 8 of 11 home pages show only text, buttons, chips and stats. The hero image starts below the fold. | all but restaurant, hotel, events |
| A3 | **3D is decorative noise.** The only 3D object (neon orb) sits *behind* the topup hero copy. Its ring cuts through the subheading, which then fails AA. | topup |
| A4 | **No signature moment.** Sections are a stack of `heading + grid` blocks with fade-up reveals. There is no pinning, no scroll-linked scene, no interaction you would remember or share. | all |
| A5 | **Typography is timid.** Headings stop at roughly 64 px. Thai eyebrows are letter-spaced 0.2em ("ค อ ล เ ล ก ชั น"), which breaks Thai reading. The shop hero breaks a line before "ที่" ("เรียบง่าย ที่ / ไม่ธรรมดา"). | shop, hotel, events eyebrows |
| A6 | **Thai clipping.** The restaurant giant marquee cuts off the tone marks and upper vowels of its first line ("ปลากะพงทอดน้ำปลา"). | restaurant |
| A7 | **Placeholder and wrong content.** Corporate logos are `dummyimage.com` "Partner N" boxes. Clinic service "ปรึกษาแพทย์ + วิเคราะห์ผิว" uses photo `1559757148-5c350d0d3c56`, which is an anatomical brain. Topup's live feed shows "ยังไม่มีรายการ" at the top of the home page. | corporate, clinic, topup |
| A8 | **Busy photo heroes.** The hotel hero puts headline, paragraph, chips, stats and a search bar over a busy photo, and the subheading drops below AA in places. Events pushes its main CTA below the fold at 1440×900. | hotel, events |
| A9 | **Module pages are generic.** Products, menu, schedule, rooms and events all use the same "eyebrow + H1 + chips + grid" header. The salon gallery page is 5 photos followed by the footer. | inner pages |
| A10 | **Platform site reads as a SaaS template.** It has a light grid hero, a 3×4 card wall and a plain pricing table. Its stats are wrong ("7 ประเภทธุรกิจ, 9 ธีม"). The code has 10 templates and 12 presets. | platform |
| A11 | **Mobile clutter.** The floating "แชทผ่าน LINE" pill covers content and stats on every mobile page. | all mobile |

---

## 1. Principles (read these first; they settle most judgement calls)

1. **One idea per site.** Each template has one *signature scene* (a 3D or interactive concept tied to its business: silk for fashion, steam for a kitchen, breath for yoga). Everything else supports it. Do not stack three effects into one section.
2. **Type is the hero.** Use big, confident type with real hierarchy: one giant line per viewport at most, and a lot of air around it. Images get cinematic crops, never "rounded card with shadow" by default.
3. **Depth with purpose.** 3D must *explain or delight*: it shows the product (games, tickets, rooms) or embodies the brand (breath, water, light). It never sits behind body copy. A scene behind text needs a scrim that keeps AA.
4. **Choreography, not decoration.** Every page has a rhythm: **at most 3 heavy moments** (pin, 3D or horizontal scroll), with calm sections between them that only reveal. No two adjacent sections share a layout pattern.
5. **Operational pages are calm.** Cart, checkout, account, order status, booking wizards, QR dine-in, wallet and tickets get refined layout, crisp micro-interactions and fast feedback. They get no 3D, no smooth-scroll hijack, no preloader and no pinning.
6. **The tenant owns the brand.** Every colour comes from theme tokens, every font from the theme and every logo from the tenant. 3D scenes read theme colours at runtime. A customer recolouring the shop must get an equally beautiful site.
7. **Static is a first-class design.** Reduced motion, no WebGL and low-power devices all get a deliberate poster: a gradient and a photo with grain. It must not look like a broken page.

---

## 2. Global design language

### 2.1 Motion tokens

CSS custom properties (kitmotion adds them to `packages/ui/src/styles/globals.css` inside `@theme inline` / `:root`). The GSAP names are the same curves.

| Token | Value | GSAP | Use |
|---|---|---|---|
| `--ease-out-expo` (exists) | `cubic-bezier(0.16,1,0.3,1)` | `expo.out` | entrances, reveals, image clip-ins |
| `--ease-out-quart` | `cubic-bezier(0.25,1,0.5,1)` | `quart.out` | UI state changes (menus, accordions, hovers) |
| `--ease-in-out-circ` | `cubic-bezier(0.85,0,0.15,1)` | `circ.inOut` | curtains, page transitions, preloader exit |
| `--ease-spring` (exists) | `cubic-bezier(0.34,1.56,0.64,1)` | `back.out(1.6)` | playful presets only (candy, ember): buttons, stickers |
| `--ease-theme` (exists) | per preset | — | default for section reveals |
| linear | — | `none` | anything driven by scroll (`scrub`) |

| Duration token | Value | Use |
|---|---|---|
| `--dur-micro` | 160ms | hover colour, press |
| `--dur-ui` | 320ms | menus, accordion, tabs, toggles |
| `--dur-reveal` | 900ms | text and image reveals |
| `--dur-hero` | 1400ms | hero intro (whole choreography ≤ 1.8s) |
| `--dur-curtain` | 900ms | preloader exit, page curtain |

Stagger: words 60ms (Thai words 80ms; total word cascade capped at 900ms, so long headlines split by line instead), list items 80ms, cards 100ms, letters (Latin only) 25ms.

**Scroll choreography rules**

- Reveal triggers at `start: "top 85%"` and plays once (`once: true`). Nothing re-hides on scroll-up.
- Scrubbed effects use `scrub: 0.8` (lerped). Parallax translation is at most ±12% of the element height.
- Pinned sections: at most one per two viewport heights of content. Pin length is ≤ 250vh on desktop and ≤ 150vh on mobile, or unpinned on mobile (see each component).
- Prefer CSS `position: sticky` over GSAP `pin` wherever possible: it is more robust with Next navigation and Playwright.
- Every ScrollTrigger is created inside `useGSAP` (scoped and auto-reverted) and refreshes after `document.fonts.ready` and after images load in its section.

**Motion levels** (existing `effects.motionLevel`, `data-motion` on `<html>`):

| Feature | subtle | standard | expressive |
|---|---|---|---|
| reveal style | fade + 12px rise, 600ms | mask lines / words | mask lines + blur-in on images |
| parallax | off | ±6% | ±12% |
| pinned / horizontal sections | sticky only (no scrub) | yes | yes |
| velocity skew (marquee, filmstrip) | off | off | ≤ 6° |
| custom cursor | off | dot | dot + contextual labels |
| magnetic CTAs | off | primary CTA | all CTAs |
| preloader | off | off | yes (home, first visit) |
| 3D scene speed multiplier | 0.5 | 1 | 1 |

### 2.2 Typography (Thai + Latin)

**Fluid scale** (kitmotion adds these to globals.css; 360 → 1920 px):

```css
--step--1: clamp(0.8125rem, 0.78rem + 0.10vw, 0.875rem);  /* 13–14 labels */
--step-0:  clamp(1rem,      0.96rem + 0.20vw, 1.125rem);  /* 16–18 body */
--step-1:  clamp(1.125rem,  1.05rem + 0.35vw, 1.375rem);  /* lead */
--step-2:  clamp(1.375rem,  1.20rem + 0.75vw, 1.875rem);  /* h4 */
--step-3:  clamp(1.75rem,   1.40rem + 1.50vw, 2.75rem);   /* h3 */
--step-4:  clamp(2.25rem,   1.60rem + 2.80vw, 4rem);      /* h2 */
--step-5:  clamp(2.75rem,   1.80rem + 4.40vw, 6rem);      /* h2 statement / Thai h1 */
--step-6:  clamp(3.25rem,   1.80rem + 6.60vw, 8.5rem);    /* hero, Thai max */
--step-7:  clamp(4rem,      1.50rem + 11vw,   13rem);     /* Latin giant titles */
--step-8:  clamp(4.5rem,    18vw,             22rem);     /* wordmark (Latin) */
```

Utility classes: `.text-step-0 … .text-step-8`, `.display-thai`, `.display-latin`, `.mono-label`, `.font-accent`.

**Thai rules (non-negotiable)**

- **Script detection on the server.** `isThai(text)` uses `/[฀-๿]/`. Headings render `data-script="thai" | "latin" | "mixed"`, and CSS keys line-height and tracking on it.
- **Line-height.** Thai display is ≥ 1.2: Anuphan/Prompt/Mitr 1.2; Kanit/Chonburi/Chakra 700 1.25; Trirong/Taviraj/Maitree serif 1.28. Thai body is 1.7. Latin display is 0.88–0.95.
- **Tracking.** Never use negative tracking on Thai; it is ≥ 0. Wide tracking (`0.2em`) and `uppercase` are for **Latin only**. Thai eyebrows use `letter-spacing: 0.02em; font-weight: 600` (fixes A5).
- **Splitting.** Never split Thai per character except into **grapheme clusters**, and only for strings of ≤ 12 graphemes. Segment once on the server with `Intl.Segmenter("th", {granularity: "word"})` (the existing `segmentText`/`glueMaiYamok`) and pass the parts to the client. Line grouping happens on the client by measuring word `offsetTop` after `document.fonts.ready`. It only sets styles and never restructures the DOM.
- **No clipping.** Every mask (`overflow: hidden` wrapper) uses `padding-block: 0.2em; margin-block: -0.2em`. Marquee and giant rows use `line-height ≥ 1.25` plus `padding-block: 0.15em` (fixes A6).
- **Size caps.** Thai headlines cap at `--step-6`. Only Latin strings may use `--step-7/8`. A giant wordmark of a Thai brand name caps at `14vw`.
- **Wrapping.** Use `text-wrap: balance` on headings ≤ 4 lines and `text-wrap: pretty` on paragraphs. `ๆ` is glued to its word (existing helper).

**Fonts.** The 25 existing Thai fonts stay. Add **Latin-only accent fonts** for numerals, Latin brand words and giant wordmarks. CSS per-glyph fallback means Thai characters inside an accent run fall through to the theme's display font.

| key | family | next/font loader | use |
|---|---|---|---|
| `instrument-serif` | Instrument Serif (400, 400 italic) | `Instrument_Serif` | editorial italics: shop, clinic, salon, course |
| `fraunces` | Fraunces (300–800, opsz) | `Fraunces` | soft luxury / bakery: hotel, cafe |
| `unbounded` | Unbounded (400–800) | `Unbounded` | wide display numerals: platform, topup, events |
| `space-grotesk` | Space Grotesk (400–700) | `Space_Grotesk` | grotesk display: corporate |
| (global) `--font-mono` | JetBrains Mono (400, 500) | `JetBrains_Mono` | tiny labels, clocks, counters, HUD; not a theme choice |

- `FontDef` gains `latinOnly?: boolean`. Theme `fonts` gains an optional `accent` key.
- `--font-accent = var(--font-<accent>), <display stack>`.
- Admin heading/body pickers must hide `latinOnly` fonts. A new "ฟอนต์ภาษาอังกฤษ (accent)" picker lists only them, plus "ใช้ฟอนต์ display".

### 2.3 Grid, spacing, framing

- **12-column grid.** Gutter `--gutter: clamp(16px, 2.2vw, 40px)`. Containers keep `data-container` (narrow 64rem / normal 80rem / wide 96rem / full). Hero and gallery media may break out to full bleed.
- **Section rhythm.** `--section-y: calc(clamp(88px, 12vw, 200px) * var(--density))`. A "calm" section after a heavy moment uses `--section-y`. A transition into a pinned scene uses 0 top padding, so the scene owns the viewport.
- **Asymmetry.** Editorial layouts use 7/5 and 8/4 splits and offset images (`translateY(10%)`), not 6/6.
- **Corner frames.** Hero corners host tiny meta labels (`.mono-label`): city plus live clock, season or collection, scroll cue, index "01/08". These are the "studio" details the references use.
- **Mobile.** 16 px side gutter, never horizontal page scroll. The hero shows a **visual (photo, scene or poster) occupying ≥ 40% of the first 390×844 viewport** (fixes A2). It shows at most 2 chips and moves stats below the fold.

### 2.4 Light, depth, texture

- **Grain.** The existing `data-grain` is upgraded to an animated SVG-noise overlay (3–6% opacity, `steps(4)` jitter at 8 fps, static under reduced motion). `pointer-events: none` and `z-index` above the content but below modals.
- **Depth tokens.** `--shadow-float: 0 30px 80px -20px color-mix(in oklab, var(--foreground) 35%, transparent)`, `--shadow-glow: 0 0 60px -10px var(--glow)`. Glass is `backdrop-filter: blur(18px) saturate(1.4)` on `color-mix(in oklab, var(--background) 60%, transparent)` with a 1px `color-mix(... var(--foreground) 12%)` border.
- **3D lighting.** Use procedural only. Never use drei `<Environment preset=…>` (it downloads HDRs from a third-party CDN). Use `<Environment resolution={256}>` with `<Lightformer>` children, or three's `RoomEnvironment` via PMREM. Never use drei `<Text>`/`<Text3D>` (they fetch fonts). Draw text to a 2D canvas with the loaded webfont and use it as a texture or point-sample.
- **No post-processing library.** Fake bloom with additive sprites, fresnel rims and soft radial textures.
- **Theme colours in 3D.** Every scene derives its palette from `primary`, `accent`, `glow`, `background`, `foreground` and `surface` (see `useThemeColors`). The fallback poster uses the same tokens in CSS gradients.

### 2.5 Interaction vocabulary (what users learn once and meet everywhere)

| Element | Behaviour |
|---|---|
| Text link / nav item | `RollText`: the label rolls up and a duplicate rolls in (Latin per letter at 12ms stagger; Thai as a whole word). Underline draws left→right on hover/focus. |
| Primary CTA | `Magnetic` (≤ 10px pull, inner label moves 1.4× for parallax) + arrow icon that slides out and in. Press is `scale(.97)`. |
| Cards | Lift 6px, image scale 1.04 inside a fixed frame, pointer-tracked glow (`GlowCard`). Optional `TiltCard` ≤ 6°. |
| Images in editorial contexts | `ImageReveal` clip-in on enter; on hover a subtle SVG displacement (`DisplaceImage`), desktop fine pointers only. |
| Galleries / carousels / 3D | Drag with inertia; the cursor shows the label "ลาก" / "DRAG". |
| Projects / events / rooms list | Hover shows a floating preview image that follows the cursor (`HoverPreview`). The cursor label is the action ("ดูโปรเจกต์", "ซื้อบัตร", "ดูห้อง"). |
| Focus | `:focus-visible` gets a 2px `--ring` outline with 3px offset on everything, including canvases' DOM mirrors. Never `outline: none` without a replacement. |
| Press feedback | Buttons give an immediate state change (≤ 100ms): spinner, morph to ✓. Forms never wait on an animation to submit. |

### 2.6 Preloader and page transitions

**Preloader** (`Preloader`, expressive presets only):

- Shows only on `/`, only on the first visit per session (`sessionStorage["rw-preloaded"]`), only with JS, and never under reduced motion or `saveData`.
- Concept: the brand wordmark assembles letter by letter (graphemes for Thai) while a mono counter rolls 000→100. A `--ease-in-out-circ` curtain then lifts (`clip-path: inset(0 0 100% 0)`) and hands off to the hero intro.
- **Hard cap 1.6s.** After 1.2s the overlay has `pointer-events: none`. Content is server-rendered underneath (LCP is unaffected). The overlay is `aria-hidden`.

**Page transitions** (`RouteTransition` via `apps/web/src/app/(sites)/rw/[tenantId]/template.tsx`):

- Enter-only animation keyed by pathname. Styles: `fade` (220ms), `rise` (main fades and rises 24px, 450ms), `curtain` (a theme-coloured panel wipes up off the screen, 700ms, expressive marketing routes only).
- **Never** keep the old page in the DOM (duplicate accessible names break Playwright's strict locators). Never delay interactivity beyond 150ms. `effects.pageTransitions=false` gives `none`. Operational routes always use `fade`.
- A top route-progress line (2px, `--primary`) appears on navigation start (link click) and completes on render.

### 2.7 Reduced motion

`prefers-reduced-motion: reduce` gives:

- No Lenis (native scroll) and no pinning. Sticky stories become plain stacked blocks. Horizontal scroll becomes a native swipe row.
- All reveals show final state immediately (CSS start states already live under `no-preference` only).
- 3D scenes render **one static frame** (or the poster) with no render loop. No autoplay, no marquees moving (rows wrap statically). Odometers show the final value. The cursor is native only.
- The preloader is skipped. Page transitions are `none`.

### 2.8 Performance budget

| Item | Budget |
|---|---|
| First-load route JS, marketing pages (gzip) | ≤ 230 KB incl. React/Next baseline; gsap core + ScrollTrigger + lenis ≈ 55 KB is inside this |
| 3D chunk (three + r3f + used drei modules), lazy | ≤ 260 KB gz, requested only after `requestIdleCallback` **and** the scene is within 200px of the viewport |
| Operational pages | no three, no ScrollTrigger, no lenis in their client graph; ≤ 170 KB |
| WebGL canvases | **max 1 per viewport**; max 2 mounted per page at once (scenes > 1.5 viewports away unmount) |
| DPR | `[1, 1.75]` desktop, `[1, 1.25]` mobile/mid; `PerformanceMonitor` steps down 1.75→1.25→1, and < 30 fps for 3s swaps to the poster |
| Particles | high 40k / mid 18k / low → poster |
| Textures per scene | ≤ 8, each ≤ 1024px (Unsplash `w=1024`), `anisotropy` 4 |
| LCP | < 2.5s on 4G mid-tier; hero H1 and hero image SSR'd, image `fetchPriority="high"` |
| CLS | < 0.05: every scene reserves its box (aspect-ratio or explicit height) on the server |
| INP | < 200ms: no work on scroll except rAF-batched transforms; no React state on scroll |

**Capability tiers** (`useCapability`):

- `low`: `hardwareConcurrency ≤ 4` ‖ `deviceMemory ≤ 4` ‖ `saveData` ‖ no WebGL ‖ reduced motion
- `mid`: coarse pointer ‖ viewport < 768
- `high`: everything else

Theme `effects.scene3d: "auto" | "lite" | "off"` overrides: `lite` gives shader backdrops only, `off` gives posters only.

---

## 3. Kit spec

### 3.0 Packaging rules (both kits)

- **Exports.** `packages/ui/package.json` gets subpath exports. The kitmotion agent owns this file and adds all three lines in its first step:
  ```json
  "./three/*": "./src/three/*.tsx", "./motion/*": "./src/motion/*.tsx", "./fx/*": "./src/fx/*.tsx"
  ```
  The barrels `@rentweb/ui/three`, `/motion` and `/fx` keep working.
- **The three barrel never pulls three.js eagerly.** Every public 3D component is a light `"use client"` wrapper in `src/three/<name>.tsx`. It renders `Scene3D` plus a `React.lazy(() => import("./impl/<name>-scene"))`. All `three` / `@react-three/*` imports live only in `src/three/impl/**` and `src/three/core/use-*.ts` loaded by impl.
- **Server components** (sections) render the wrappers directly with serialisable props only: strings, numbers, plain objects, no functions.
- **No randomness in render.** Use a seeded PRNG (`mulberry32(seedFromString(id))`, in `src/three/core/random.ts` and re-exported from motion) so SSR and the client agree.
- **Theme colours.** Wrappers accept colour props as **token names** (`"primary" | "accent" | "glow" | "foreground" | "background" | "surface"`) or CSS colours. Default is tokens.
- **Day-1 stubs.** Kits publish compiling **stubs with the final API on day 1** (render the fallback/poster). Sections, shell and platform code against them in parallel.
- **Lab pages.** Every component gets a demo on a kit lab page: `apps/web/src/app/(platform)/lab/three/page.tsx` (kit3d) and `apps/web/src/app/(platform)/lab/motion/page.tsx` (kitmotion). `robots: noindex`; `notFound()` when `NODE_ENV === "production"`.

### 3.1 3D kit (`kit3d` → `packages/ui/src/three/**`)

#### Core (all client; P0)

| File | Export | Spec |
|---|---|---|
| `core/scene-3d.tsx` | `Scene3D` | Props: `{ className?, style?, fallback: ReactNode, rootMargin?="200px", keepAlive?="150%", dpr?=[1,1.75], quality?: "auto"\|"high"\|"low", frameloop?: "always"\|"demand", camera?: {fov?, position?: [x,y,z]}, eventSource?: "self"\|"section", interactive?=true, onFirstFrame?(), children }`. Renders `fallback` on the server and until ready. Mounts the r3f `<Canvas>` when IntersectionObserver says it is near, and unmounts it when farther than `keepAlive`. Sets `frameloop="never"` when off-screen or `document.hidden`. Checks WebGL with `useCapability`. Context lost gives the fallback (no retry loop). Canvas fades in over 600ms after the first frame. Reduced motion renders one frame (`frameloop="demand"` + single `invalidate()`). The canvas is `aria-hidden` and `tabIndex={-1}`. The wrapper has the box size set by the parent (no CLS). Adds `PerformanceMonitor` (drei) DPR stepping. |
| `core/use-capability.ts` | `useCapability()` | Returns `{ ready, webgl, webgl2, tier: "high"\|"mid"\|"low", reducedMotion, finePointer, saveData, mobile }` using the tiers in §2.8. Reads `html[data-scene3d]` (`auto`/`lite`/`off`). SSR returns `{ready:false}` and never touches `window` in render. |
| `core/use-theme-colors.ts` | `useThemeColors(keys?)`, `resolveCssColor(value)` | Resolves `--primary` etc. **through a 1×1 canvas** (read the custom property with `getComputedStyle`, assign it to `ctx.fillStyle`, `fillRect`, then `getImageData`) so `oklch()`/`color-mix()` become sRGB. Returns `THREE.Color`s. Re-reads on a `MutationObserver` of `<html>` (class/style/data-*) and `#tenant-theme` (childList/characterData), plus the `rw:theme` window event (admin live preview dispatches it). Also exports a non-three `useThemeHex(keys)` for 2D canvases. |
| `core/use-section-progress.ts` | `useSectionProgress(ref, {start?, end?})` | Returns a `MutableRefObject<number>` (0..1) for scroll progress through a section. Updated via ScrollTrigger if registered, else rAF + `getBoundingClientRect`. No React state. |
| `core/poster.tsx` | `ScenePoster` | **Server-safe** (no "use client"). Props `{ variant: "aurora"\|"silk"\|"mesh"\|"ocean"\|"stage"\|"ember"\|"orb"\|"grid"\|"plain", image?, imageAlt?, className? }`. Layered CSS radial/conic gradients from theme vars + optional image + grain. This is the fallback for every scene, so it must look intentional on its own. |
| `core/canvas-text.ts` | `drawTextTexture`, `sampleTextPoints`, `sampleSvgPathPoints`, `sampleImagePoints` | 2D-canvas helpers. Wait for `document.fonts.load(font)`. Thai text is fine because the browser shapes it. |
| `core/random.ts` | `mulberry32`, `seedFromString` | Deterministic randomness. |

#### Signature components

Each component below is a wrapper in `src/three/<file>.tsx` with its impl in `src/three/impl/<file>-scene.tsx`.

**P0: build first**

**`ShaderBackdrop`** (`shader-backdrop.tsx`)
- Props: `{ variant: "aurora"|"silk"|"mesh"|"grain-gradient"|"ember"|"caustics", colors?: TokenOrColor[] (default ["primary","accent","glow","background"]), speed?=1, intensity?=1, pointer?=true, grain?=0.05, className? }`.
- One full-screen quad with a fragment shader: fbm noise flow; silk = anisotropic folds; caustics = Voronoi light. Pointer bends the flow locally.
- Mid tier is allowed (cheap). Poster: `ScenePoster` with the same variant.

**`CurvedGallery`** (`curved-gallery.tsx`)
- Props: `{ items: {image: string; title: string; subtitle?: string; href?: string; tag?: string}[], radius?=7, arc?=1.25 (fraction of π the visible arc spans), cardAspect?=0.8 (w/h), rows?: 1|2, bend?=0.12, autoplay?=0.05 (rad/s, 0=off), drag?=true, scrollLinked?=true, floor?: "grid"|"reflect"|"none", fog?=true, height?: "screen"|"tall"|"compact", labels?: "dom"|"none", cursorLabel?="ลาก", openLabel?="เปิดดู", className? }`.
- Cards are curved planes (24 segments) on the inside of a cylinder around the camera, Vyre-style: cards wrap the viewer. The floor is a perspective grid shader in `foreground` @ 12% fading into fog; `reflect` uses a blurred mirror of the cards.
- Motion: drag rotates with inertia, scroll velocity adds spin, and autoplay idles. Hover lifts the card toward the camera (0.25 units), scales it 1.04, raises saturation, and shows a DOM label (title + subtitle) pinned under it. Click navigates (`<a>` in the DOM mirror; the canvas dispatches `click()` on it).
- **SSR DOM mirror:** an `<ul>` of real links (visually hidden when the canvas is live, visible as the fallback). Focusing a link rotates the cylinder to that card.
- Textures load via `TextureLoader` (`crossOrigin="anonymous"`), SRGB colour space, with a theme `surface` placeholder until loaded.
- Fallback / low / reduced motion: a CSS 3D strip (`perspective: 1200px`, each card `rotateY` by its offset from the centre, scroll-snap, drag) that still reads as 3D.
- Mobile: `rows=1`, radius 5, no reflect.

**`ParticleMorph`** (`particle-morph.tsx`)
- Props: `{ shapes: Shape[], active?: number (controlled index), auto?: {interval: number} , morphOn?: "time"|"scroll"|"controlled", count?: number (default by tier 40k/18k), size?=1.6, colors?: [TokenOrColor, TokenOrColor] (gradient along shape), pointerRepel?=0.6, rotate?=0.08, depth?=0.35, className? }`.
- `type Shape = "sphere"|"torus"|"knot"|"crystal-flower"|"star"|"wave"|"globe"|{text: string; font?: string; weight?: number}|{svgPath: string; viewBox?: string}|{image: string; threshold?: number}`.
- GPU morph: all shape positions are baked into attributes (`aPos0..aPosN` up to 6, else a DataTexture). The vertex shader lerps with an eased `uMorph` and adds curl noise during the transition, so particles swirl rather than slide.
- Pointer repulsion uses the pointer projected onto the z=0 plane. Additive blending, soft round sprite, depth-faded size.
- `{text}` and `{svgPath}` sample via `core/canvas-text.ts`. lucide icon paths are valid `svgPath` input (the platform uses this).

**`FloatingObjects`** (`floating-objects.tsx`)
- Props: `{ set: "fashion"|"gaming"|"clinic"|"food"|"spa"|"corporate"|"pastry"|"yoga"|"resort"|"events"|"abstract", material?: "auto"|"glass"|"chrome"|"clay"|"pearl"|"satin", count?: number, layout?: "orbit"|"scatter"|"stack"|"rain", pointerParallax?=true, scrollParallax?=0.3, interactive?: "none"|"poke"|"drag", className? }`.
- Procedural geometry only; no GLTF downloads.

| set | geometry |
|---|---|
| fashion | buttons (torus + discs), satin ribbons (sine-deformed planes), thread spools (lathe) |
| gaming | gems (octahedron), coins (beveled cylinders w/ emissive rim), D-pad / plus shapes (extruded), capsules |
| clinic | glass droplets (sphere stretched), pearls, serum capsules (capsule), rings |
| food | bowls (lathe), chilies (tube along curve), basil leaves (extruded shape), rice grains (instanced) |
| spa | smooth stones (squashed, noise-displaced spheres), bamboo (cylinders), lotus (lathe petals) |
| corporate | chrome rounded cubes, half-pipes, grid tiles |
| pastry | donuts (torus + icing displaced + instanced sprinkles), macarons (2 squashed spheres + cylinder), croissant (twisted tube), cherries |
| yoga | stacked balancing stones, torus rings, soft spheres |
| resort | pebbles, sun disc (emissive), glass waves (extruded) |
| events | tickets (rounded box, holo material), star bursts, spotlight cones |
| abstract | mixed primitives |

- `material="auto"` picks per set: glass for clinic/resort, chrome for corporate/gaming, clay for pastry/food, satin for fashion/spa.
- Glass uses drei `MeshTransmissionMaterial` (samples 4, resolution 256) on the high tier only and `MeshPhysicalMaterial` (transmission) on mid.
- `poke`: click/tap applies an impulse (spring, no physics engine).

**`WormholeTunnel`** (`wormhole-tunnel.tsx`)
- Props: `{ steps: {kicker?: string; title: string; body?: string; image?: string}[], tint?: TokenOrColor="primary", wireframe?=true, rings?=48, stars?=true, length?: "short"|"normal"|"long" (200/300/400vh), className? }`.
- The section is `position: relative; height: <length>` with a sticky 100svh stage.
- The camera flies along a CatmullRom curve through a `TubeGeometry` wireframe (or ring lines), driven by `useSectionProgress`.
- Each step = a tilted floating card (image texture with title drawn to a canvas texture) placed along the path, alternating sides. A **DOM overlay** shows the active step's `kicker/title/body` with SplitReveal crossfade. The DOM step list is the accessible content.
- Fallback: CSS concentric rings with `perspective` + the step list as numbered cards.

**P1: next**

**`OceanSurface`** (`ocean-surface.tsx`)
- Props: `{ mode: "ocean"|"pool"|"ripple", image?: string (ripple: refract this photo), sun?: TokenOrColor="glow", water?: TokenOrColor="accent", sky?: TokenOrColor="background", horizon?=0.62 (0..1 of height), pointerRipples?=true, className? }`.
- `ocean`: Gerstner waves (4 octaves) with fresnel, sun glitter and sky reflection; the camera is low over the water. `pool`: top-down caustics. `ripple`: full-rect photo with pointer-spawned ring ripples refracting it (spa hero).
- Poster `ocean`.

**`StageLights`** (`stage-lights.tsx`)
- Props: `{ beams?=6, colors?: TokenOrColor[]=["primary","accent"], haze?=true, sweep?=0.35, bpm?=118 (intensity pulse), floor?: "reflect"|"none", crowd?=false (silhouette strip), className? }`.
- Volumetric cones (additive, noise-modulated gradient shader) sweeping from truss positions above, with dust motes and a reflective floor. Transparent canvas over a photo.

**`Ticket3D`** (`ticket-3d.tsx`)
- Props: `{ title: string, date: string, venue?: string, price?: string, code?: string, holo?=true, interactive?: "drag"|"tilt"|"none", className? }`.
- Rounded-box ticket with perforated stub. Front/back textures are drawn on a 2D canvas (Thai fonts OK) with an iridescent foil shader on `holo`. It floats, the pointer tilts it, and drag spins it with inertia (snaps to front).
- The DOM mirror holds the same text (the canvas is `aria-hidden`).

**`CardStack3D`** (`card-stack-3d.tsx`)
- Props: `{ items: {image: string; title: string; badge?: string; href?: string}[], layout?: "fan"|"orbit"|"stack", autoplay?=true, floor?: "synthgrid"|"none", rim?: TokenOrColor="accent", className? }`.
- Game covers as holographic cards (rounded rect, rim light, foil sheen). `fan` spreads on hover, `orbit` circles a glowing portal ring; `synthgrid` adds a moving perspective grid floor in the same canvas. Click navigates. DOM mirror = links.

**`BreathingOrb`** (`breathing-orb.tsx`)
- Props: `{ pattern?: [number, number, number, number]=[4,4,6,2] (in, hold, out, hold seconds), cues?: [string,string,string]=["หายใจเข้า","ค้างไว้","หายใจออก"], colors?: TokenOrColor[]=["primary","glow","accent"], noise?=0.18, showCue?=true, className? }`.
- Sphere with simplex displacement, fresnel rim and an inner gradient. Scale and displacement follow the breathing cycle.
- The DOM cue text (`aria-live="off"`) syncs with the phase and shows a progress ring. The reduced-motion fallback is a static CSS orb with the cue text listed.

**`SteamRise`** (`steam-rise.tsx`)
- Props: `{ origin?: "bottom"|"center"|[x,y], density?=1, embers?=true, warmth?: TokenOrColor="glow", className? }`.
- Curl-noise smoke sprites (soft, alpha) rising from a point/line, plus ember sparks (additive). Transparent canvas laid over a food photo.

**`ImageSilk`** (`image-silk.tsx`)
- Props: `{ image: string, alt: string, wind?=0.6, pointer?=true, hang?: "rod"|"free", sheen?=0.4, className? }`.
- A 48×64-segment plane hanging from a thin rod, deformed by layered noise "wind". The pointer pushes a soft dent that propagates as a wave. Anisotropic satin sheen in `glow`. The image is the lookbook photo. The fallback is the same photo in a CSS-skewed, softly waving `clip-path` frame.

**P2: if time allows**

**`MediaPlanes`** (`media-planes.tsx`)
- One fixed full-viewport canvas renders WebGL planes over DOM images marked `[data-media-plane]` inside its scope: liquid hover distortion and scroll-velocity bend. The DOM `<img>` stays (opacity 0 while the plane is live).
- Shop product grids and corporate project lists only.

### 3.2 Motion kit (`kitmotion` → `packages/ui/src/motion/**`, `fx/**`, `styles/**`)

S = server component (no "use client"; may render a client child). C = client.

| File | Export | S/C | Spec |
|---|---|---|---|
| `motion/gsap.ts` | `gsap`, `ScrollTrigger`, `useGSAP`, `registerGsap()`, `mm()` | C | Registers ScrollTrigger, Flip, Observer, CustomEase once. `mm()` wraps `gsap.matchMedia()` with the conditions `{reduce: "(prefers-reduced-motion: reduce)", fine: "(pointer: fine)", desktop: "(min-width: 768px)"}`. |
| `motion/smooth-scroll.tsx` | `SmoothScroll`, `useLenis()` | C | Lenis `{lerp: 0.1, smoothWheel: true, syncTouch: false}`. Drives ScrollTrigger (`lenis.on("scroll", ScrollTrigger.update)`; `gsap.ticker.add(t => lenis.raf(t*1000))`; `lagSmoothing(0)`). Props `{enabled: boolean, disabledRoutes?: RegExp}`. Off under reduced motion and when `html[data-route="operational"]`. `lenis.stop()` while `body[data-scroll-locked]` (Radix dialogs/sheets). Hash links scroll with offset `var(--header-h)`. Elements with `data-lenis-prevent` scroll natively (sheets, menus, maps). Adds lenis CSS (`html.lenis{height:auto}`…) to globals. |
| `motion/split.ts` | `isThai`, `scriptOf`, `splitWords`, `splitGraphemes` | S (pure) | Wraps the existing `segmentText`/`glueMaiYamok`. `splitGraphemes` falls back to word parts for Thai strings over 12 graphemes. |
| `motion/split-reveal.tsx` + `split-reveal-client.tsx` | `SplitReveal` | S→C | Props `{text, as?="h2", mode?: "words"\|"lines"\|"chars", from?: "mask"\|"below"\|"blur"\|"rotate", trigger?: "mount"\|"inView"\|"scrub", delay?, stagger?, duration?, className?}`. The server splits; the client animates. Lines mode groups words by `offsetTop` after fonts load. Renders `data-script`. **Accessible name = full text**: an sr-only span carries the text and the split spans are `aria-hidden`. `TextReveal` stays as a thin alias (`mode="words"`). |
| `motion/scrub-text.tsx` | `ScrubText` | S→C | Statement paragraph whose words go from 20% to 100% opacity as you scroll (scrub). Text-section `size="large"` uses it. |
| `motion/roll-text.tsx` | `RollText` | S→C | Props `{children: string, className?}`. Two stacked copies; the second is `aria-hidden`. Latin rolls per letter, Thai as a whole word (the server decides). Triggers on the parent's hover/focus (`group`). **Never doubles the accessible name.** |
| `motion/magnetic.tsx` (upgrade) | `Magnetic` | C | Props `{strength?=0.35, max?=10, inner?=1.4, children}`. Fine pointer only; disabled inside `form` and under reduced motion. The transform goes on a wrapper `span` so Playwright stability checks still pass. |
| `fx/cursor.tsx` | `CursorProvider`, `Cursor` | C | Dot (8px) + ring (36px) with lerp follow, `mix-blend-mode: difference` option. Reads `[data-cursor="view\|drag\|play\|link\|text\|hide"]` and `[data-cursor-label]` on hover targets. The native cursor is hidden **only** inside `[data-cursor]` zones (galleries, drag areas, project lists) and never over `input, textarea, select, [contenteditable], form`. Fine pointer + motion allowed only. Mode from `effects.cursor`. |
| `motion/velocity-marquee.tsx` | `VelocityMarquee` | C | Props `{items: (string\|ReactNode)[], speed?=40 (px/s), direction?: 1\|-1, reactToScroll?=true, skew?=true, separator?, outline?, size?: "sm"\|"md"\|"lg"\|"giant", pauseOnHover?=true}`. Scroll velocity speeds it up and flips direction; skew ≤ 6° (expressive). Thai-safe line box (§2.2). Reduced motion gives a static wrapped row. |
| `motion/image-reveal.tsx` | `ImageReveal` | C (SSR img) | Props `{src, alt, from?: "bottom"\|"left"\|"center"\|"circle", scaleFrom?=1.18, parallax?=0.08, priority?, sizes?, className?}`. `clip-path` inset reveal + inner scale settle. The image is in the SSR HTML (hidden state only under `scripting:enabled` + no-preference). |
| `motion/parallax-media.tsx` | `ParallaxMedia` | C | Props `{speed?=-0.15, scale?=1.12, children}`. Scrubbed `yPercent`. Replaces `Parallax` (keep the alias). |
| `motion/sticky-story.tsx` | `StickyStory` | C (SSR content) | Props `{items: {key, title, kicker?, body?, chips?, media: ReactNode}[], side?: "left"\|"right", mediaMode?: "crossfade"\|"clip"\|"stack", counter?=true, className?}`. Left: titles at `--step-5`, inactive at 22% opacity, active 100% with kicker/body expanding. Right: `position: sticky; top: calc(var(--header-h) + 8vh)` stage whose media crossfades/clips per active item (IntersectionObserver on titles, rootMargin -45%/-45%). Mobile (< 768): stacked title + media per item. Keyboard: titles are buttons that scroll to their item. |
| `motion/horizontal-scroll.tsx` | `HorizontalScroll` | C | Props `{children, label, snap?=true, progress?=true}`. Desktop + motion: sticky stage, track `x` scrubbed from scroll, section height = track overflow + 100vh. Mobile/reduced: native `overflow-x: auto; scroll-snap-type: x mandatory` with prev/next buttons (44px). The track is a `role="region"` with `aria-label`. |
| `motion/scatter-cards.tsx` | `ScatterCards` | C (SSR positions) | Props `{cards: {image, alt?, title?, tag?, avatar?}[], seed: string, density?: "airy"\|"dense", float?=true, assemble?: "none"\|"in"\|"out", children}`. Deterministic positions from `seed` around a centred child (headline). Three depth layers with pointer parallax (4/10/18px). Idle float via CSS keyframes. On scroll out the cards fly outward (`assemble="out"`). Mobile: 4 cards (2 top, 2 bottom). |
| `motion/word-cycler.tsx` | `WordCycler` | S→C | Props `{words: string[], interval?=2200, mode?: "roll"\|"blur"\|"flip", className?}`. SSR renders `words[0]`. The slot width animates to the measured word width. An sr-only static text "ร้านค้า, คลินิก, …" carries the full list; animated spans are `aria-hidden`. Pauses off-screen. |
| `motion/odometer.tsx` | `Odometer` | S→C | Props `{value: number\|string, locale?="th-TH", prefix?, suffix?, duration?=1.6, trigger?: "inView"\|"mount", className?}`. Rolling digit columns (0–9 strips, staggered), separators static. sr-only final value; columns `aria-hidden`. **Marketing stats only — never totals/prices on operational pages** (journeys read them). |
| `motion/letter-drop.tsx` | `LetterDrop` | S→C | Props `{text, bounce?=0.5, trigger?}`. Graphemes drop with spring and squash (playful; Latin or Thai ≤ 12 graphemes). |
| `motion/preloader.tsx` | `Preloader` | C | Props `{brand: string, logoUrl?: string, variant?: "counter"\|"wordmark"\|"curtain", minMs?=600, maxMs?=1600, onceKey?="rw-preloaded"}`. §2.6. Sets `html[data-preloaded]` when done; hero intros wait for it (max `maxMs`). |
| `motion/route-transition.tsx` | `RouteTransition`, `RouteProgress` | C | §2.6. Props `{style: "none"\|"fade"\|"rise"\|"curtain", children}`. `RouteProgress` = top 2px bar. |
| `motion/scroll-progress.tsx` | `ScrollProgress` | C | Thin top bar or circular ring (`variant: "bar"\|"ring"`). |
| `motion/live-clock.tsx` | `LiveClock` | C | Props `{tz?="Asia/Bangkok", label?="กรุงเทพฯ", seconds?=false, className?}`. SSR renders `label --:--`; fills in `useEffect` (`suppressHydrationWarning` on the time span); updates each minute (or second). Mono font. |
| `motion/back-to-top.tsx` | `BackToTop` | C | Label "กลับขึ้นด้านบน" (Thai rolls as a word) or "BACK TO TOP" (split letters roll), circular scroll-progress ring, `lenis.scrollTo(0)` / native smooth. |
| `motion/giant-wordmark.tsx` | `GiantWordmark` | S→C | Props `{text, effect?: "rise"\|"parallax"\|"spotlight"\|"marquee", outline?, image?, className?}`. Fits the container width: the server sets `font-size: min(<cap>, calc((100cqw) / (<graphemeCount> * <fontFactor>)))` via container query units; the client refines with one measurement (`transform: scaleX` ≤ 3%), so there is no layout shift. `spotlight`: `background-clip: text` radial gradient following the pointer. Decorative copies are `aria-hidden`. |
| `motion/hover-preview.tsx` | `HoverPreview` | C | List rows `[data-preview-src]`; a floating image (16:10, 320px) follows the pointer with lerp and rotates with velocity; fine pointer only. |
| `motion/reveal.tsx`, `stagger.tsx`, `counter.tsx`, `marquee.tsx`, `tilt-card.tsx` | existing | C | Keep the APIs. Retune defaults to §2.1 tokens. `Counter` becomes an alias of `Odometer`; `Marquee` an alias of `VelocityMarquee` with `reactToScroll=false`. |
| `fx/grain.tsx` | `Grain` | C | Animated SVG noise overlay (§2.4); replaces the static `body::after` when `data-grain="true"`. |
| `fx/glow-card.tsx` | `GlowCard` | C | Pointer-tracked radial highlight (`--mx/--my` CSS vars) + border glow; renders `as` any element. |
| `fx/displace-image.tsx` | `DisplaceImage` | C | SVG `feTurbulence` + `feDisplacementMap` hover distortion (scale 0→18) for `<img>`; fine pointer only. |
| `fx/gradient-border.tsx` | `GradientBorder` | S | Animated conic border (`@property --angle`) for highlighted plans/cards. |
| `fx/hero-background.tsx` (upgrade) | `HeroBackground` | C | Extend `HeroBackgroundKind` with `"shader-aurora"\|"shader-silk"\|"shader-mesh"\|"shader-caustics"`, which lazy-render `ShaderBackdrop` (poster = same CSS). Existing CSS kinds stay. |
| `fx/scene.tsx` | `HeroScene` | C | **The single switch sections use:** `HeroScene({ kind: SceneKind, preset: string, image?, cards?, words?, className? })`. `kind="auto"` resolves via `SCENE_BY_PRESET` (below). Renders the right 3D wrapper with the right props, or nothing for `none`. |

`SceneKind = "auto"|"none"|"particle-morph"|"floating-objects"|"card-stack"|"breathing-orb"|"image-silk"|"ocean"|"stage-lights"|"steam"|"water-ripple"|"shader"`

`SCENE_BY_PRESET` (in `fx/scene.tsx`):

| preset | scene |
|---|---|
| aurora | `image-silk` |
| neon | `card-stack` |
| porcelain | `floating-objects` (clinic, glass) |
| ember | `steam` |
| zen | `water-ripple` |
| quartz | `floating-objects` (corporate, chrome) |
| candy | `floating-objects` (pastry, clay, poke) |
| midnight | `particle-morph` (star → crystal-flower) |
| studio | `particle-morph` (wave → sphere) |
| loft | `breathing-orb` |
| riviera | `ocean` |
| stage | `stage-lights` |
| obsidian | `particle-morph` (crystal-flower → star → globe) |

### 3.3 Styles (`packages/ui/src/styles/globals.css`, kitmotion)

Add:

- tokens §2.1 and §2.2, `--gutter`, `--section-y`, `--shadow-float`, `--shadow-glow`, `--font-accent`, `--font-mono`
- `[data-script]` line-height/tracking rules
- `.mono-label` (`--font-mono`, 11–12px, tracking .08em, uppercase Latin)
- lenis CSS and the cursor CSS
- a focus-visible ring on everything
- Thai mask padding (§2.2)
- `@media (prefers-reduced-motion: reduce)` overrides
- `html[data-route="operational"]` hooks that disable cursor/lenis visuals

Remove nothing that existing selectors use (`data-reveal*`, `.btn`, `.card`, `[data-card]`, `[data-button]`, sticky-bar rules).

---

## 4. Platform showcase site (RentWeb itself, Thai-first)

### 4.1 Identity

**Concept: "เปิดไฟหน้าร้าน"** (switching the shop lights on). The site is a dark, cinematic night street. Each business type is a lit shop window, and RentWeb is the switch. The coral "online" dot is the brand atom.

- **Palette.** Scoped to `(platform)/layout.tsx` as CSS vars on `<html>`, plain hex, no tenant theme. AA verified, min 6.23:1 dark, 4.59:1 paper.

| token | dark (default) | paper (light chapters) |
|---|---|---|
| background | `#07080B` | `#F3F1EC` |
| foreground | `#F3F1EC` | `#0B0B0C` |
| card / surface | `#111319` / `#0E1015` | `#FFFFFF` / `#EAE7E0` |
| primary ("ไฟร้าน" coral) / fg | `#FF6B3D` / `#0B0B0C` | `#C2410C` / `#FFFFFF` |
| accent (violet) / fg | `#8E7DFF` / `#07080B` | `#5B47E0` / `#FFFFFF` |
| muted / muted-fg | `#14161D` / `#A3A099` | `#EAE7E0` / `#57544E` |
| glow | `#FFB38A` | `#FFD3BF` |
| border | `#23262F` | `#D6D2C8` |

  Light "paper" chapters (`data-tone="paper"` on a section) appear twice: the sticky story and pricing. That rhythm of night → paper → night mirrors the two references.
- **Fonts.** Thai display/heading **Anuphan** 600 (body 400); body **IBM Plex Sans Thai**; Latin accent **Unbounded** (wordmark, numerals, giant titles); labels **JetBrains Mono**. Load all four in the platform layout via `apps/web/src/fonts.ts`.
- **Logo.** Wordmark `RentWeb` in Unbounded 600 with a trailing **coral dot** `●` that pulses like an "online" status (2.4s, off under reduced motion). The favicon is the dot inside a rounded square. No other mark.

### 4.2 Sitemap and links

| Route | File | Purpose |
|---|---|---|
| `/` | `(platform)/page.tsx` | story + conversion |
| `/templates` | `(platform)/templates/page.tsx` | all 10 templates, filter by business |
| `/templates/[key]` | `(platform)/templates/[key]/page.tsx` | one template deep-dive (`generateStaticParams` from `listTemplates()`, `notFound()` on unknown key) |
| `/features` | `(platform)/features/page.tsx` | modules, payments, LINE, design system, security |
| `/pricing` | `(platform)/pricing/page.tsx` | plans from DB + comparison + billing FAQ |
| `/site-status/*`, not-found | existing | restyle with the identity; keep their texts |

- **Shared chrome.** `apps/web/src/components/platform/site-header.tsx` and `site-footer.tsx`, rendered from `(platform)/layout.tsx`.
- **Header links (RollText).**
  - เทมเพลต → `/templates`
  - ฟีเจอร์ → `/features`
  - ราคา → `/pricing`
  - เข้าสู่ระบบ → `${ADMIN_URL}/login`
  - CTA **"เริ่มฟรี 14 วัน"** (Magnetic) → `${ADMIN_URL}/signup`
- **CTA targets** (found in the current page; keep the text):
  - Signup: `${env().ADMIN_URL}/signup`
  - Per plan: `${ADMIN_URL}/signup?plan=<key>`. `/signup` reads only `?next=` today, so the param is harmless and future-proof.
  - Demos: `${proto}://demo-${t.key}.${rootHost()}` with `proto = host.startsWith("localhost") ? "http" : "https"`, opened in a new tab.
- **Template-specific signup** ("ใช้เทมเพลตนี้"): `${ADMIN_URL}/signup?next=${encodeURIComponent("/onboarding?template=" + key)}`. Onboarding does not read `template` yet; that is a later admin follow-up, not a platform task.
- **Real numbers, computed at render time:**
  - templates = `listTemplates().length` (10)
  - presets = `Object.keys(PRESETS).length` (12, 13 after `obsidian`)
  - Thai fonts = `Object.values(FONTS).filter(f => !f.latinOnly).length` (25)
  - business systems = `new Set(listTemplates().flatMap(t => t.modules)).size` (7: commerce, topup, clinic, booking, restaurant, rental, events)
  - plans from the `plans` table, active, `priceMonthly > 0`. Today: Starter ฿390, Pro ฿990, Business ฿2,490 per month (yearly ฿3,900 / ฿9,900 / ฿24,900); Enterprise ฿8,000 shown as "ติดต่อเรา"; trial 14 days.
- **Template screenshots** (captured by the platform agent **after** the template redesigns land; script `tooling/qa/redesign/capture-showcase.ts`, Playwright, isolateHmr, motion settled, LINE pill hidden via `[data-hide-floating-chat]` injection):
  - `apps/web/public/showcase/<key>.webp`: 1440×900 viewport, q 80, ≤ 180 KB (CurvedGallery textures, cards)
  - `apps/web/public/showcase/<key>-m.webp`: 390×844 @2x = 780×1688, ≤ 160 KB (phone mockups)
  - `apps/web/public/showcase/<key>-long.webp`: 1440 wide full page, resized to 960 wide, cropped to max 4800 tall, ≤ 400 KB (auto-scroll previews)
  - keys: `shop topup clinic restaurant salon corporate cafe course hotel events`
  - Until they exist, fall back to `t.previewImage`.

### 4.3 Home `/`: storyboard

| # | Section | Layout and content (Thai copy is illustrative; keep it as natural Thai) | 3D / motion idea |
|---|---|---|---|
| 0 | Preloader | `RentWeb●` assembles; mono counter `000 → 100` | `Preloader variant="counter"`, first visit only |
| 1 | Header | wordmark left; RollText links; `LiveClock label="กรุงเทพฯ"` mono label; Magnetic CTA | transparent over hero, then glass after 24px |
| 2 | **Hero (cinematic)** | H1 (keep): **"เปิดเว็บธุรกิจของคุณ ใน 5 นาที"** at `--step-6`. Line 2: "เว็บสำหรับ `[ร้านค้า · คลินิก · ร้านอาหาร · คาเฟ่ · โรงแรม · อีเวนต์ · สตูดิโอโยคะ · ร้านเติมเกม · สปา · เอเจนซี]`" (`WordCycler mode="roll"`). Sub: "เลือกเทมเพลต ปรับโลโก้ สี ฟอนต์ แล้วเปิดรับลูกค้าได้เลย รองรับ PromptPay สลิป และ LINE". CTAs: "เริ่มทดลองฟรี 14 วัน" (signup) + "ดูเดโมสด" (→ #templates). Corner labels: `RENTWEB ©2026`, `SCROLL ↓`, `10 TEMPLATES`. | **ParticleMorph** in the right 55% (full-bleed on mobile, behind a scrim, under the headline). Shapes: `{text:"RentWeb"}` → lucide `ShoppingBag`, `Gamepad2`, `Sparkles`, `UtensilsCrossed`, `Hotel`, `Ticket`, `Coffee`, `Flower2`, `Building2`, `PersonStanding` (copy each icon's `d` paths into `apps/web/src/components/platform/shapes.ts`). `active` is **synced with WordCycler's index**. Colours coral → violet. Pointer repels. |
| 3 | Payment / tool strip | "รองรับ PromptPay · ตรวจสลิปอัตโนมัติ · LINE แจ้งเตือน · LINE Login · บัตรเครดิต · โดเมนของคุณเอง · ภาษาไทยเต็มรูปแบบ" | `VelocityMarquee size="lg" outline` alternating filled/outline words |
| 4 | **Template cylinder** | Giant title `TEMPLATES` + accent superscript `©10` (scroll-scaled 0.6→1 as it enters). Sub "10 ธุรกิจ 10 บุคลิก คลิกเพื่อดูเดโมสด". | **CurvedGallery** of the 10 `showcase/<key>.webp`, `floor="grid"`, autoplay, DOM labels `name.th` + module chips; click → `/templates/<key>`; cursor label "ลาก" / "เปิดดู" |
| 5 | **Sticky story** (paper) | Left: business list, big type: ร้านแฟชั่น / ร้านเติมเกม / คลินิกความงาม / ร้านอาหาร / สปา / เอเจนซี / คาเฟ่ / สตูดิโอโยคะ / โรงแรม / อีเวนต์. Under the active one: 3 chips of what that site does (e.g. "ตะกร้า + ชำระเงิน", "QR สั่งที่โต๊ะ", "จองคิวออนไลน์", "เลือกวันเข้าพัก", "ขายบัตร + สแกนเข้างาน"). | **StickyStory** with `media` = a CSS-3D **device pair** (laptop + phone, `perspective` 1400px, rotateY −14°) whose screens crossfade to `<key>.webp` / `<key>-m.webp`; the device glow and the active title colour take that template preset's primary (read from `getPreset(t.themePreset)`). This is the fastwork "morphing profile" idea made ours. |
| 6 | Pain points | Heading: "เจ้าของร้านคนไหน ก็เคยเจอ" | `ChatBubbles` (platform component): customer bubbles pop in on scroll ("ทักมาถามราคาซ้ำ ๆ ทั้งวัน", "เช็กสลิปจนตาลาย", "จ้างทำเว็บแพง แก้เองไม่ได้", "คิวชนเพราะจดในสมุด"), then RentWeb answer bubbles in coral ("ราคาอยู่บนเว็บ สั่งซื้อเองได้ 24 ชม.", "ระบบตรวจสลิปให้อัตโนมัติ", "แก้สี ฟอนต์ เนื้อหาเองได้ทุกเมื่อ", "ลูกค้าจองคิวเอง ไม่มีชน"). Typing-dots indicator before each answer. |
| 7 | **Wormhole** | Heading: "จากไอเดีย ถึงเปิดร้าน ใน 5 นาที". Steps: 01 เลือกเทมเพลต · 02 ใส่โลโก้ สี ฟอนต์ · 03 เพิ่มสินค้า/บริการ · 04 เชื่อม PromptPay + LINE · 05 เปิดเว็บ รับลูกค้าได้เลย | **WormholeTunnel** `length="normal"`, tint primary, cards = showcase screenshots |
| 8 | Real numbers | 10 เทมเพลต · 7 ระบบธุรกิจ · 12 ธีมดีไซน์ · 25 ฟอนต์ไทย (computed, §4.2) | `Odometer` in Unbounded at `--step-7`, thin dividers, mono captions |
| 9 | Feature bento | "ทุกอย่างที่ร้านต้องมี" — 6 tiles, each with a live micro-demo (DOM/CSS, no extra canvas): **PromptPay QR** (scan beam sweeps), **ตรวจสลิป** (slip card gets a ✓ stamp), **LINE แจ้งเตือน** (notification stack slides in), **ปรับธีมเอง** (interactive: 5 swatches recolour a mini site preview live via CSS vars, *the customisability proof*), **ฟอนต์ไทย 25 แบบ** (specimen "สวัสดี" cycling fonts), **โดเมนของคุณ** (types `yourshop.co.th`, then a lock icon) | `GlowCard` tiles, `Stagger` |
| 10 | Pricing (paper) | "เริ่มต้นหลักร้อยต่อเดือน" + monthly/yearly toggle ("จ่ายรายปีประหยัดกว่า 2 เดือน"); 3 plans from DB; Enterprise row | `TiltCard` (≤ 5°) + `GlowCard`; Pro has `GradientBorder` + badge "ยอดนิยม"; prices roll with `Odometer` on toggle; CTA "เริ่มทดลองฟรี" → `signup?plan=<key>` |
| 11 | FAQ | keep the 5 existing Q&As | numbered rows (`01`…), `--step-2` questions, plus→× rotate, height spring |
| 12 | Final CTA | "พร้อมเปิดร้านแล้วหรือยัง?" at `--step-6`, centred; a big round magnetic button (160px) "เริ่มฟรี 14 วัน" | `ShaderBackdrop variant="ember"` in coral/violet behind (counts as this viewport's only canvas) |
| 13 | Footer | link columns; LiveClock; "© 2026 RentWeb"; `GiantWordmark text="RentWeb" effect="spotlight"` full width; `BackToTop` | spotlight gradient follows the pointer inside the letters |

Mobile: section 2 is a full-bleed scene at 48svh with the headline below. Section 4 is the CSS strip fallback if `mid` tier. Section 5 is stacked. Section 7 is the step cards fallback.

### 4.4 `/templates`

- **Header.** Giant `TEMPLATES` + `©10`, then filter chips (ทั้งหมด / ขายของ / จองคิว / ร้านอาหาร / เติมเกม / ที่พัก / อีเวนต์ / องค์กร), built from template `modules`/`category`. The filter uses `Flip` for the grid reflow.
- **Grid.** 2 columns, staggered `translateY(12%)` on even cards. Each card:
  - the `<key>-long.webp` inside a 16:10 window that **auto-scrolls on hover** (`object-position` animated over 6s), with cursor label "ดูเทมเพลต"
  - name, preset swatches (4 dots), modules as mono chips
  - "ดูเดโมสด ↗" (demo URL, new tab)
- **Footer CTA.** Same as home §12.

### 4.5 `/templates/[key]`

1. **Hero.**
   - Template `name.th` at `--step-6` and `description.th`.
   - Preset chip (`preset.name.th`).
   - CTAs "ดูเดโมสด ↗" and "ใช้เทมเพลตนี้" (template signup link).
   - Background: `ShaderBackdrop variant="mesh"` coloured with **that preset's** primary/accent (pass explicit colours).
2. **Device showcase.** A CSS-3D laptop with `<key>-long.webp` auto-scrolling, plus a phone with `<key>-m.webp`, parallax at different speeds.
3. **"มีอะไรในเทมเพลตนี้".** Module features as a numbered list (01–0n), from a `MODULE_FEATURES` map in `apps/web/src/components/platform/module-features.ts`. Use Thai copy for each module key, e.g. commerce: "ตะกร้า + ชำระเงิน PromptPay/สลิป", "คูปอง รีวิว", "ติดตามพัสดุ".
4. **Design system strip.**
   - Fonts specimen (heading/body names rendered in their font).
   - Palette swatches with hex.
   - Recommended presets (`t.recommendedPresets`) as clickable swatch sets that recolour the device mockup frame.
5. **Next template.** A giant link "ถัดไป → {next.name.th}" with `HoverPreview` of its screenshot and a curtain transition.

### 4.6 `/features`

- **Sticky story** by module: ขายของออนไลน์, จองคิว & คลาส, เติมเกม, ร้านอาหาร + QR, ที่พัก, อีเวนต์ & บัตร, หน้าเว็บ & ดีไซน์. Media = annotated screenshot crops of the demos (from the showcase images).
- **Section "รับเงินเข้าบัญชีคุณโดยตรง".** PromptPay, slip verify, COD, card gateway; the existing FAQ copy is the source of truth.
- **LINE section.** Chat-bubble demo of a LINE notification.
- **Security.** "แยกข้อมูลทุกร้านด้วย Row Level Security · สำรองข้อมูลทุกวัน · PDPA" with an odometer "99.95%" only on the Enterprise SLA line, as stated in the plan features.
- **CTA.**

### 4.7 `/pricing`

- **Plans.** As home §10.
- **Comparison table** from `plans.limits`:
  - rows: สินค้า, หน้าเว็บ, พนักงาน, พื้นที่, ผู้ใช้, ออเดอร์/เดือน, ตรวจสลิป/เดือน, สาขา
  - `∞` for unlimited
  - sticky header row; zebra rows in `surface`
  - mobile: the plan selector switches the visible column (no horizontal scroll)
- **Billing FAQ** (ยกเลิก, ใบกำกับภาษี, เปลี่ยนแพ็กเกจ, ทดลองฟรี). Write the answers only from the existing facts on the page/plans; do not invent policies.

---

## 5. The 10 templates (each must feel like a different studio made it)

### 5.0 Rules for every template

- Template files live in `packages/templates/src/<key>.ts`. A changed composition shows on a demo only after `reset-demo` (see the brief).
- **Keep all existing copy** unless a line below says otherwise. New sections reuse photos already in that template's file. Any **new** Unsplash id must be checked with `curl -sI` (200) **and looked at**. Ids verified by direction (200 + subject checked):
  - `1616394584738-fc6e612e71b9`: facial mask treatment
  - `1612817288484-6f916006741a`: skincare bottles on stones
  - `1617897903246-719242758050`: serum dropper on wood
  - `1600334129128-685c5582fd35`: hot-stone massage
  - `1551024601-bec78aea704b`: sprinkle donuts
  - `1558961363-fa8fdf82db35`: cookies basket
  - `1501281668745-f7f57925c3b4`: concert crowd
  - `1550745165-9bc0b252726f`: neon retro gaming gear
  - `1445205170230-053b83016050`: clothes rack
- Headings may contain `\n` for a **forced line break**; SplitReveal and hero renderers honour it. Use it to fix bad Thai breaks (A5).
- New preset effect fields (§6.1) get these per-preset defaults:

| preset | template | motion | smoothScroll | cursor | preloader | transition | heroBackground | scene (auto) |
|---|---|---|---|---|---|---|---|---|
| aurora | shop | expressive | on | label | wordmark | curtain | none | image-silk |
| neon | topup | expressive | on | label | counter | rise | shader-mesh | card-stack |
| porcelain | clinic | standard | on | dot | off | fade | shader-silk | floating-objects |
| ember | restaurant | expressive | on | dot | off | rise | noise | steam |
| zen | salon | subtle | on (lerp .08) | off | off | fade | blobs | water-ripple |
| quartz | (customers) | standard | on | dot | off | rise | grid | floating-objects |
| candy | cafe | expressive | on | label | wordmark | rise | blobs | floating-objects |
| midnight | (customers) | standard | on | dot | off | curtain | spotlight | particle-morph |
| studio | (customers) | expressive | on | label | off | rise | grid | particle-morph |
| loft | course | standard | on | dot | off | fade | waves | breathing-orb |
| riviera | hotel | standard | on | dot | off | fade | spotlight | ocean |
| stage | events | expressive | on | label | counter | curtain | noise | stage-lights |
| **obsidian** (new) | corporate | expressive | on | label | counter | curtain | none | particle-morph |

**Inner content pages (all templates).** `[...slug]` pages without a hero start with a **PageIntro**: eyebrow, a giant SplitReveal title, a thin rule that draws, an optional lead line, and a mono index (`02 / ABOUT`).

- About (`text size=large`) renders as a `ScrubText` statement followed by the existing CTA card.
- Contact pages use `contact variant="chips"` where interests make sense (corporate, clinic, hotel, events) and `classic` elsewhere. The map is tinted to the theme (grayscale + `mix-blend-mode: multiply` on a `surface` overlay; dark presets use `screen`).
- Privacy, terms and refund pages are plain readable prose (max 70ch, body 18px/1.75) with **no motion** beyond the PageIntro.
- Gallery pages add an intro text block and a closing CTA (fixes A9).

**Module pages (later phase, one agent per module) follow the template's direction below.** Listing pages are "marketing-light": PageIntro + filter chips with a sliding active pill + `Flip` reflow + card hover language. Detail pages have a parallax hero media and a sticky action box. Operational pages (§6.4) stay calm.

### 5.1 Shop: Siam Atelier (`shop`, preset `aurora`)

- **Mood.** A Thai handweaving atelier printed as a fashion magazine: paper, ink, vermilion thread. Quiet luxury, generous white space, asymmetric editorial grid.
- **Palette.** Keep `aurora` (`#FAF8F2` / `#141414` / vermilion `#CC3418` / ultramarine `#2E5BFF`).
- **Fonts.** Taviraj (heading) / Anuphan (body) / Fahkwang (display) + accent **Instrument Serif italic** for Latin words ("Monsoon ’26", "No. 01").
- **Signature scene.** **ImageSilk**: the lookbook photo printed on a silk panel hanging from a thin rod, swaying; the pointer pushes ripples through the fabric. It lives in the hero's right 5 columns, and is the first 52svh on mobile.
- **Hero** (`hero variant="editorial" scene="auto"`):
  - Heading `"สวมใส่ความเรียบง่าย\nที่ไม่ธรรมดา"` in Taviraj at `--step-6`, mask-line reveal.
  - Corner labels: "คอลเลกชันฤดูฝน 2026" (Thai, normal tracking) + accent italic "Monsoon ’26"; index `01 / 08`.
  - Buttons sharp, primary vermilion.
  - Silk panel enters by "unrolling" (`clip-path` top→bottom, 1.2s).

**Home composition**

1. `hero` editorial, `scene=auto`
2. `marquee` style `outline` → VelocityMarquee alternating filled/outline words, separator `✦`, skew
3. `category-list` tiles → **hover-reveal index**: 3 giant category names (เสื้อผ้า / กระเป๋า / ของแต่งบ้าน) as rows; `HoverPreview` shows the category photo; count in mono
4. `product-grid` `cardStyle=editorial` newest → staggered editorial grid with mono numbering `01–08`, image swap on hover + `DisplaceImage`, quick-add pill slides up
5. **`sticky-story`** (new): eyebrow "กว่าจะเป็นเสื้อหนึ่งตัว", heading "จากเส้นด้าย ถึงตู้เสื้อผ้าของคุณ"
   - items: ปลูกฝ้าย · ย้อมคราม · ทอมือ · ตัดเย็บ, each with a 1-line body and a photo from `shop.ts`
   - `mediaStyle="card"`, `side="right"`
6. `image-text` overlap (keep copy) → parallax depth layers
7. `product-grid` `cardStyle=hover-swap` best-sellers → 3D tilt cards (≤ 5°)
8. `stats` row → Odometer
9. `testimonials` marquee → two VelocityMarquee rows in opposite directions
10. `features` icons
11. `faq`
12. `cta` glow → `variant="wordmark"`: "สมัครรับข่าวคอลเลกชันใหม่ก่อนใคร"

**Module pages (commerce).**
- `/products` and `/collections`: PageIntro "สินค้าทั้งหมด", chip filters with a sliding pill, `Flip` reflow, the same card language.
- Product detail: photos as a **draggable CSS-3D card stack** (swipe/drag to flip through, the current card faces front), a click opens a zoom lightbox, a sticky buy box, and size chips that spring.
- "เพิ่มลงตะกร้า": the button morphs to ✓ and a thumbnail flies to the cart icon (FLIP); the cart badge bounces.
- Cart rows animate out with `layout`.
- Checkout: calm.

**Preloader / transition.** Wordmark "Siam Atelier" assembles, then a vermilion curtain.

### 5.2 Topup: GameHub (`topup`, preset `neon`)

- **Mood.** A night arcade with an esports HUD. A portal of game worlds. Crisp, fast, glowing, but **copy never sits under 3D** (fixes A3).
- **Palette.** Keep `neon` dark (`#07071A`, violet `#9466F8`, cyan `#22D3EE`).
- **Fonts.** Chakra Petch / Bai Jamjuree + accent **Unbounded** for numerals (`10`, `1.2M+`); `--font-mono` HUD labels (`[ LIVE ]`, `PING 12ms`). Scanlines stay.
- **Signature scene.** **CardStack3D `layout="orbit"`**: the 8 game covers circle a glowing portal ring above a moving synthgrid floor. Hover spreads the cards; click goes to `/games/<slug>`. It sits in the right column only.
- **Hero** (`hero variant="split" scene="auto" cards=[8 games]`):
  - Heading "เติมเกมไว\nภายใน 10 วินาที"; "10" renders in the accent font automatically (the digit-run rule in §7.0).
  - Stats as HUD readouts (Odometer, mono captions, corner brackets).
  - Cards: RoV, Free Fire, Genshin Impact, Valorant, PUBG Mobile, Roblox, Mobile Legends, Steam Wallet, using the cover images already in `topup.ts`, href `/games/<slug>`.

**Home composition**

1. `hero` split, card-stack
2. `marquee` outline → giant outline VelocityMarquee of game names, skew
3. `game-grid` tiles (moved up: choosing a game is the job) → `GlowCard` rim-light tiles, cover parallax on hover, category pill filter, search field glows on focus
4. `topup-feed` → HUD ticker (mono, live dot). **When there are no rows the section renders nothing on the home page** (never "ยังไม่มีรายการ").
5. `steps` cards → `variant="numbered"` 01–03 with glowing icons
6. `features` bento → GlowCard bento; the big tile shows a scrolling slip-verify demo (CSS)
7. `stats` cards → HUD odometers
8. `testimonials` cards → `variant="chat"` (gamer-chat bubbles with rank badges)
9. `faq` two-column
10. `cta` glow → **dark** `ShaderBackdrop variant="aurora"` violet/cyan behind the heading (fixes the jarring light block)

**Module pages.**
- `/games/[slug]` (operational-light): the game cover as a blurred parallax banner + sharp cover tile.
- Glass step panels: package chips get an animated neon border-draw + ✓ on select; sticky summary.
- The "ยืนยันด้วย OTP เพื่อเติม" button has a soft pulse-glow; no 3D.
- Code reveal: CSS 3D card flip.
- `/wallet`: calm.

**Preloader.** HUD boot `LOADING 000→100%` in mono, 900ms max.

### 5.3 Clinic: Lumière Clinic (`clinic`, preset `porcelain`)

- **Mood.** Soft daylight through frosted glass. Pearl, blush, sage. Medical trust with beauty-editorial elegance.
- **Brand motif.** The **arch** (`border-radius: 999px 999px 0 0` frames) on every portrait/photo.
- **Palette.** Keep `porcelain`; enable `glassmorphism`.
- **Fonts.** Trirong / Sarabun + accent **Instrument Serif italic** (the word "Lumière", numerals).
- **Signature scene.** **FloatingObjects `set="clinic"`**: glass droplets and pearls drifting and refracting in front of the arch-framed hero portrait, overlapping its edges. The canvas covers the media column + 10% bleed.
- **Hero** (split): heading `"สวยอย่างเป็นธรรมชาติ\nในมือแพทย์ที่คุณไว้ใจ"`; the license line is a mono-label pill; CTAs "นัดปรึกษาฟรี" + "ดูบริการทั้งหมด".
- **Data fix (A7).** In `clinic.ts`, replace the consult service image `1559757148-5c350d0d3c56` (anatomical brain) with `u("1616394584738-fc6e612e71b9", 800)`.

**Home composition**

1. `hero` split, scene auto
2. `features` icons → trust row (thin line icons that draw on enter)
3. `service-list` cards → arch-photo cards with soft glow hover, category tabs with a sliding pill
4. `package-list` → glass cards; featured package gets a `GradientBorder`
5. **`sticky-story`** (new, replaces the image-text): heading "ทุกการรักษาเริ่มจากการฟัง"
   - items: ปรึกษาแพทย์ · วิเคราะห์ผิว · วางแผนเฉพาะคุณ · ติดตามผล
   - `mediaStyle="arch"`, photos from `clinic.ts` + `1612817288484-6f916006741a` / `1617897903246-719242758050`
6. `staff-grid` → doctors in arches; hover reveals credentials
7. `stats` row → Odometer
8. `gallery` filmstrip → HorizontalScroll in arch frames
9. `testimonials` spotlight
10. `booking-widget` (operational inside: no motion in the widget)
11. `faq`
12. `cta` card → glass card over `ShaderBackdrop variant="silk"` in blush/sage

### 5.4 Restaurant: บ้านริม (`restaurant`, preset `ember`)

- **Mood.** An old riverside house kitchen at dusk: teak, chili red, banana-leaf green, charcoal glow and rising steam. Hungry, warm, a little theatrical.
- **Palette.** Keep `ember`.
- **Fonts.** Chonburi / K2D (accent unset → display).
- **Signature scene.** **SteamRise** over the hero dish photo: steam curling up, ember sparks drifting. The hero photo slowly pushes in (scale 1.08→1 over 2.4s).
- **Hero** (`fullscreen`): heading "รสชาติบ้าน\nที่คิดถึง" bottom-left at `--step-6`; stats move out of the hero into a strip directly under it; CTAs "ดูเมนู" / "จองโต๊ะ".

**Home composition**

1. `hero` fullscreen, steam
2. `marquee` giant → VelocityMarquee giant **with the Thai clip fix**, dish names alternating filled/outline
3. `menu-highlight` filmstrip → HorizontalScroll: plates as circular cut-outs on cards that rotate 12° → 0 as they arrive; price chips in accent
4. **`sticky-story`** (new, replaces the image-text): "จากสวนถึงจาน ภายในวันเดียว"
   - items: 05:00 สวนผักนครปฐม · 07:00 ตลาดเช้า · 10:00 ครัวบ้านริม · 11:00 โต๊ะของคุณ (times as mono kickers)
   - `mediaStyle="full"`, existing photos
5. `features` cards (สแกนสั่งที่โต๊ะ / สั่งกลับบ้าน / จองโต๊ะ) → icon micro-demos (QR scan beam)
6. `gallery` masonry → 3 parallax columns at different speeds
7. `testimonials` cards → note cards pinned at ±2° that straighten on hover
8. `reservation-cta` → split, candle-warm `ShaderBackdrop variant="ember"` on the image side; the form stays calm
9. `stats` row → Odometer
10. `faq`

**Module pages.**
- `/menu`: sticky category bar with a sliding pill (`layoutId`); item add → a dot flies to `[data-rw-cartbar]`, which bounces.
- `/order`, `/t/[qrToken]`: operational (fast, no lenis).
- `/reserve`: calm.

### 5.5 Salon / spa: สบาย สบาย (`salon`, preset `zen`)

- **Mood.** "Slow water": stillness, stone, linen, sage. The whole site exhales; everything is slower (`subtle`) and nothing jumps.
- **Palette.** Keep `zen`.
- **Fonts.** Maitree / Noto Sans Thai + accent **Instrument Serif italic** (light).
- **Signature scene.** **WaterRipple** (`OceanSurface mode="ripple"`) over a still-life photo (hot stones / water, `1600334129128-685c5582fd35` or the template's own). The pointer leaves slow, wide rings. At rest a single ring every 6s.
- **Hero** (`variant="cinematic"`, was centered): full-bleed ripple photo with a soft linen scrim; heading `"หายใจเข้าช้า ๆ\nแล้วปล่อยให้เราดูแล"` centred in Maitree; CTAs "จองคิวตอนนี้" / "ดูบริการ"; scroll cue is a breathing dot.

**Home composition**

1. `hero` cinematic, water-ripple
2. `service-list` menu → spa menu with dotted leaders (name … duration · price) and `HoverPreview` photos
3. **`text`** (new, `size="large"` → ScrubText statement): "บ้านเก่าในซอยสวัสดี ที่เงียบจนได้ยินเสียงใบไม้"
4. `image-text` overlap → parallax depth (heading shortened to "พักในบ้าน ไม่ใช่ในห้าง" or keep the original)
5. `steps` horizontal → connecting line draws with scroll
6. `staff-grid` → soft portraits, slow hover
7. `gallery` filmstrip → slow auto-drift strip (no pin, gentle scroll response)
8. `testimonials` cards → calm stagger
9. `booking-widget`
10. `faq`
11. `cta` banner → full-bleed `ShaderBackdrop variant="silk"` in sage/linen, giant heading "ให้วันนี้เป็นวันที่คุณได้พัก"

**Gallery page.** Add an intro text and a CTA (A9). Masonry + lightbox.

### 5.6 Corporate: Northstar Studio (`corporate`, NEW preset `obsidian`)

- **Mood.** A black studio of precision, the closest to the Vyre reference. A north star to navigate by: crystal, starlight, grotesk type, live clock, giant wordmark.
- **New preset `obsidian`.** Add it to `PRESETS`; set `corporate.themePreset = "obsidian"`; `recommendedPresets: ["obsidian","quartz","midnight","aurora"]`. AA-verified palettes (min 6.55 dark, 5.07 light):

```ts
dark:  { background:"#0A0A0B", foreground:"#EDEDE8", card:"#121214", cardForeground:"#EDEDE8", popover:"#121214", popoverForeground:"#EDEDE8",
         primary:"#EDEDE8", primaryForeground:"#0A0A0B", secondary:"#1C1C1F", secondaryForeground:"#EDEDE8", muted:"#161618", mutedForeground:"#9C9C96",
         accent:"#7C93FF", accentForeground:"#0A0A0B", border:"#2A2A2E", input:"#2E2E33", ring:"#7C93FF", glow:"#2B3A8F", surface:"#0F0F11", ...baseDark }
light: { background:"#F2F1EC", foreground:"#0B0B0C", card:"#FFFFFF", cardForeground:"#0B0B0C", popover:"#FFFFFF", popoverForeground:"#0B0B0C",
         primary:"#0B0B0C", primaryForeground:"#F2F1EC", secondary:"#E4E2DB", secondaryForeground:"#0B0B0C", muted:"#E9E7E1", mutedForeground:"#55544F",
         accent:"#2F45D8", accentForeground:"#FFFFFF", border:"#CFCDC6", input:"#CFCDC6", ring:"#2F45D8", glow:"#B9C3FF", surface:"#EAE8E2", ...base }
```

  - name `{ th: "ออบซิเดียน — สตูดิโอ/เอเจนซี", en: "Obsidian — Studio & agency" }`, tags `["corporate","agency","studio","portfolio","tech"]`, `defaultMode: "dark"`
  - fonts `{ heading: "anuphan", body: "ibm-plex-sans-thai", display: "anuphan", accent: "space-grotesk" }`, radius `sm`, density `spacious`
  - layout `{ header: "classic", footer: "big", buttonStyle: "pill", cardStyle: "flat", containerWidth: "wide", headerSticky: true, headerTransparent: true }`
  - effects per §5.0 table, `grain: true`
  - motion `{ ease: "cubic-bezier(0.16,1,0.3,1)", durationFast: 160, durationBase: 520, durationSlow: 1100 }`
- **Signature scenes.** **ParticleMorph** hero (crystal-flower → star → globe, slow `auto` 5s) + **CurvedGallery** of work + **WormholeTunnel** process. These are three heavy moments, so everything else stays calm.
- **Hero** (`variant="cinematic"`, `clock=true`): heading `"สร้างระบบที่ทีมของคุณ\nอยากใช้ทุกวัน"` bottom-left at `--step-6`; corner labels "Software & Design Studio — Bangkok", `LiveClock` "BKK 23:15", "SCROLL ↓"; CTAs "ปรึกษาโปรเจกต์ฟรี" / "ดูผลงาน".
- **Data fix (A7).** Replace the `dummyimage.com` logos with `logos.names` (typographic wordmarks in the accent font, fictional demo names): "Siam Retail Group", "Krungthep Health", "Chao Phraya Logistics", "Lanna Foods", "Andaman Resorts", "Isan Agritech".

**Home composition**

1. `hero` cinematic, particle-morph, clock
2. **`giant-wordmark`** (new) text "NORTHSTAR", effect `rise`
3. `logos` with `names`, VelocityMarquee, heading "องค์กรที่ไว้วางใจเรา"
4. **`curved-gallery`** (new): `bigTitle="WORKS"`, `bigTitleSuffix="©19—26"`; items = the work page's case studies (title, category · year, image, href `/work`)
5. **`project-list`** (new, `list-hover`): the same case studies + 2 more from `corporate.ts` content, cursor label "ดูโปรเจกต์"
6. `stats` big → giant Odometers in the accent font
7. `features` cards (6 services) → `variant="list"` numbered rows 01–06, expanding on hover
8. **`tunnel`** (new): "โปร่งใสทุกสัปดาห์": 01 เข้าใจปัญหา · 02 ออกแบบ · 03 สร้างและทดสอบ · 04 ส่งมอบและดูแล (from the existing steps + features copy)
9. `team` grid → `variant="large"` horizontal portraits, grayscale → colour on hover
10. `testimonials` spotlight → giant SplitReveal quote
11. `pricing` (Support & Growth) → flat dark cards; highlighted gets `GradientBorder`
12. `faq`
13. `cta` glow → `variant="wordmark"` "มีโปรเจกต์ในใจ? มาคุยกัน" → `/contact`

**Other pages.**
- Work → `project-list grid-staggered` + `curved-gallery`.
- Services → `features variant="sticky"`.
- Contact → `contact variant="chips"`:
  - interests: เว็บไซต์ · แอปมือถือ · ระบบหลังบ้าน · Data / Dashboard · UX/UI
  - budgets: < ฿300k · ฿300k–1M · ฿1M–3M · ฿3M+
- Footer big: giant "Northstar Studio" wordmark + BackToTop.

### 5.7 Cafe / bakery: Sugar Puff (`cafe`, preset `candy`)

- **Mood.** Pastel bakery pop: sugar-coated, bouncy, sticker-y, morning light. Feels like opening a pastry box.
- **Palette.** Keep `candy`.
- **Fonts.** Mitr / Athiti / Itim + accent **Fraunces** (soft, 700) for "Sugar Puff" and prices.
- **Signature scene.** **FloatingObjects `set="pastry"` `interactive="poke"`**: clay-like donuts with sprinkles, macarons, a croissant and cherries drop in on load with a bounce, idle-bob, and spin when tapped.
- **Hero** (`variant="scatter"`):
  - Heading `"ขนมอบที่ทำให้วันธรรมดา\nหวานขึ้นนิดนึง"`; the second line uses `LetterDrop` (≤ 12 graphemes rule satisfied).
  - Scatter cards: 5 product photos (croissant, cookies `1558961363-fa8fdf82db35`, cake, latte, donuts `1551024601-bec78aea704b`) with sticker tags ("ใหม่", "ขายดี").
  - The 3D pastry layer sits behind the cards.

**Home composition**

1. `hero` scatter, pastry
2. `marquee` badges → sticker pills (rotated ±3°), VelocityMarquee
3. `product-grid` standard → **sticker cards**: brutal border (preset), wobble ±2° spring on hover, jelly press on quick-add
4. `image-text` overlap "เค้กวันเกิดที่ออกแบบได้เอง" → layered parallax + CSS candle flicker
5. `features` icons → bouncy icon entrance (`--ease-spring`)
6. `gallery` grid → `layout="polaroid"`: scattered polaroids you can drag (motion `drag`, constrained)
7. `testimonials` marquee → `variant="chat"` bubbles
8. `faq`
9. `cta` card, bouncy

**Preloader.** "Sugar Puff" LetterDrop, then a pink curtain.

### 5.8 Course / studio: Sala Flow (`course`, preset `loft`)

- **Mood.** A morning studio of oak and breath: terracotta, olive, warm paper. Calm but alive. The site **breathes with you**.
- **Palette.** Keep `loft`.
- **Fonts.** Prompt / Krub + accent **Instrument Serif italic** ("inhale · exhale").
- **Signature scene.** **BreathingOrb** in the hero centre with the DOM cue "หายใจเข้า · ค้างไว้ · หายใจออก" (pattern 4-4-6-2) and a thin progress ring. Reduced motion shows a static orb with the pattern written out.
- **Hero** (`variant="cinematic"`, was split): line 1 "หายใจให้ช้าลง" above the orb, line 2 "แล้วขยับให้ลึกขึ้น" below it; CTAs below; stats strip after the hero.

**Home composition**

1. `hero` cinematic, breathing-orb
2. `marquee` outline → VelocityMarquee class names
3. `class-highlights` cards → `variant="editorial"` rendered as HorizontalScroll cards with level chips
4. `weekly-schedule` (operational-ish: refined, motion only on day switch)
5. `features` icons → numbered list (`variant="list"`)
6. `instructor-grid` → tall pill-shaped portraits with hover tilt + specialty chips
7. `pass-pricing` → tilt cards, best value with `GradientBorder`
8. `image-text` → `style="pinned"` (photo pinned while the text scrolls) "ห้องไม้โอ๊ก แสงธรรมชาติ…"
9. `stats` row → Odometer
10. `testimonials` spotlight
11. `faq`
12. `cta` card

### 5.9 Hotel / resort: บ้านทะเล เขาหลัก (`hotel`, preset `riviera`)

- **Mood.** Golden hour on the Andaman: sand, teal water, brass, linen. Slow luxury with panoramic framing.
- **Palette.** Keep `riviera`; glass on.
- **Fonts.** Trirong / Sarabun / Taviraj + accent **Fraunces** 300 (numerals, "Khao Lak").
- **Signature scene.** **OceanSurface `mode="ocean"`** at golden hour. In the hero the photo occupies the sky/land top while the WebGL sea fills the lower band (`horizon≈0.62`), reflecting `glow`. The glass search card floats on the water. Low tier shows the photo only.
- **Hero** (`stay-search fullscreen`, fixes A8): heading `"ตื่นมาพร้อมเสียงคลื่น\nที่บ้านทะเล"` at `--step-6`, centred high; sub on 1 line; badges hidden < 768; stats move to a strip under the hero.

**Home composition**

1. `stay-search` fullscreen, ocean
2. **`text`** (new, ScrubText statement): "21 ห้องพักและพูลวิลล่า บนหาดคึกคักที่เงียบที่สุดของเขาหลัก"
3. `room-grid` cards → `variant="editorial"` rendered as panoramic HorizontalScroll cards with inner-image parallax
4. **`sticky-story`** (new, from the features bento) "วันหยุดที่ไม่ต้องรีบไปไหน"
   - items: เช้า อาหารเช้าริมทะเล · บ่าย สระและหาดส่วนตัว · เย็น พระอาทิตย์ตกที่ท่าเรือ · ค่ำ ดินเนอร์ใต้แสงเทียน
   - **The stage background shifts by time of day** (morning `surface` → afternoon `accent` 20% → sunset `glow` → night `foreground` 90%). Creative signature.
5. `image-text` overlap (อาหารเช้า) → parallax
6. `gallery` masonry → `layout="filmstrip"` panorama: 21:9 crops scrolling horizontally at two speeds
7. `testimonials` spotlight
8. `faq`
9. `cta` split → full-bleed ocean poster with a slow shader shimmer "ให้ทะเลเป็นคนปลุกคุณ"

**Module pages.**
- `/rooms`: editorial large-photo list, amenities icons, `HoverPreview`.
- Room detail: panoramic parallax gallery + sticky quote box.
- `/stay` booking: operational calm; the range calendar gets refined selection animation only.

### 5.10 Events: Maker Yard Bangkok (`events`, preset `stage`)

- **Mood.** A riverside warehouse at night: concrete, lime + magenta stage light, poster typography, a beat you can feel.
- **Palette.** Keep `stage`.
- **Fonts.** Kanit / Anuphan + accent **Unbounded** (dates `21.11`, prices, countdown digits).
- **Signature scene.** **StageLights with a `ticket`**: sweeping volumetric beams over the dimmed hero photo, plus a **Ticket3D** of the featured event (title, date, venue, price) floating on the right in the **same canvas**. Drag spins it; holo foil catches the beams. The countdown becomes Odometer digits.
- **Hero** (`event-hero fullscreen`, fixes A8): the headline must fit in ≤ 3 lines at 1440×900 (`--step-5` for event titles over 24 graphemes) so "ซื้อบัตร · เริ่มต้น ฿890" is above the fold; a compact countdown row.

**Home composition**

1. `event-hero` fullscreen, stage-lights + ticket
2. `marquee` (new) giant VelocityMarquee: "RIVERSIDE LIVE ✦ LEATHER WORKSHOP ✦ DESIGN TALK ✦ NIGHT RUN ✦ MAKER MARKET"
3. `event-grid` cards → poster cards with tilt, date stamp in the accent font, hover beam-glow; `list` variant → project-list style with `HoverPreview`, cursor label "ซื้อบัตร"
4. `features` bento → ticket QR scan micro-demo, wallet stack
5. `event-highlights` filmstrip → HorizontalScroll with velocity skew, mono captions
6. `image-text` overlap → parallax
7. `testimonials` spotlight
8. `faq`
9. `cta` split → `ShaderBackdrop variant="aurora"` lime/magenta "สุดสัปดาห์นี้ออกจากบ้านมาคลองสาน"

**Module pages.**
- `/events`: PageIntro + filter pills + poster grid.
- Event detail: parallax poster hero + sticky ticket bar; the ticket picker stays calm (keep every `data-testid`).
- `/tickets/*`: the ticket card gets a **CSS** 3D tilt and holo sheen (no WebGL), with the QR always flat and scannable.

---

## 6. Storefront shell spec (theme-driven, applies to every tenant immediately)

### 6.1 Theme schema additions (`packages/core/src/theme/**`, shell agent)

All of these are **optional with preset defaults**, so stored themes stay valid. `parseTheme` must still accept every old theme.

```ts
// schema.ts
export const HERO_BACKGROUNDS = [...existing, "shader-aurora", "shader-silk", "shader-mesh", "shader-caustics"] as const;
export const CURSOR_MODES = ["off", "dot", "label"] as const;
export const PRELOADERS = ["off", "counter", "wordmark"] as const;
export const TRANSITION_STYLES = ["none", "fade", "rise", "curtain"] as const;
export const SCENE_QUALITY = ["auto", "lite", "off"] as const;
effectsSchema += { smoothScroll: z.boolean(), cursor: z.enum(CURSOR_MODES), preloader: z.enum(PRELOADERS),
                   transitionStyle: z.enum(TRANSITION_STYLES), scene3d: z.enum(SCENE_QUALITY) }   // all inside .partial()
fonts += { accent: z.string() }   // optional; "" = use display
```

- **`fonts.ts`.** Add `latinOnly?: boolean` to `FontDef` and the 4 accent fonts (§2.2). `fontStack()` for `accent` returns `var(--font-<accent>), <display stack>`.
- **`resolve.ts`.**
  - `sharedVars` gains `--font-accent`.
  - `dataAttrs` gains `data-cursor`, `data-smooth`, `data-scene3d`, `data-transition`.
- **`apps/web/src/fonts.ts`.** Add the next/font loaders `Instrument_Serif`, `Fraunces`, `Unbounded`, `Space_Grotesk`, `JetBrains_Mono` (`preload: false`, `display: "swap"`, `latin` subset only) and include them in `fontClassNames`.
- **Presets.** Fill the new fields for all 12 presets per §5.0, apply the per-template preset tweaks named in §5.x (porcelain `glassmorphism: true`; neon `heroBackground: "shader-mesh"` replaces the orb), add `obsidian` (§5.6), and keep `pnpm --filter @rentweb/core test` green (contrast test covers obsidian automatically).
- **Admin design editor** (sections agent, `apps/admin/src/app/t/[slug]/design/theme-editor.tsx`). Add to the "effects" tab:

| Thai label | control |
|---|---|
| เลื่อนหน้าแบบนุ่มนวล | toggle |
| เคอร์เซอร์ | select off/dot/label = ปิด / จุด / จุด + ป้ายบอก |
| หน้าโหลดแรกเข้า | select off/counter/wordmark = ปิด / ตัวนับ / โลโก้ |
| สไตล์เปลี่ยนหน้า | select none/fade/rise/curtain = ไม่มี / เฟด / ลอยขึ้น / ม่านเลื่อน |
| คุณภาพ 3D | select auto/lite/off = อัตโนมัติ / เบา / ปิด |

  Also add `TH.heroBg` labels for the 4 shader kinds (ออโรรา 3D, ผ้าไหม 3D, เมช 3D, แสงน้ำ 3D), an accent-font picker (latinOnly fonts + "ใช้ฟอนต์ display"), and hide `latinOnly` fonts from the heading/body pickers.

### 6.2 Route kind

- `packages/storefront/src/shell/route-kind.tsx` (client) uses `useSelectedLayoutSegment()` (the same mechanism as `FloatingChatLink`, so server and client agree). It sets `document.documentElement.dataset.route = "marketing" | "operational"`.
- **Operational segments:** `cart, checkout, account, orders, order, t, wallet, topup, book, bookings, reserve, reservations, stay, stays, tickets, login, preview`.
- Everything else is marketing, including home, `[...slug]`, products/collections listing + detail, services, staff, classes, schedule, instructors, packages, menu, games, rooms, events.
- Exported as `useRouteKind()` for shell components.
- Operational routes get: no Lenis, no custom cursor, no preloader, `fade` transition, no scenes (sections never render there anyway).

### 6.3 Components

| Piece | File(s) | Spec |
|---|---|---|
| Layout wiring | `(sites)/rw/[tenantId]/layout.tsx` | Inside `MotionRoot` render `RouteKind`, `SmoothScroll enabled={theme.effects.smoothScroll}`, `CursorProvider mode={theme.effects.cursor}`, `Grain` (if `effects.grain`), `Preloader` (if `effects.preloader !== "off"`, brand = `brand.logoText ?? name`, logo = `brand.logo`), existing `ThemeEffects`, header, main, footer, FloatingChat, Toaster. **Keep** `<main className="flex-1 overflow-x-clip">` and every existing attribute. |
| Page transition | `(sites)/rw/[tenantId]/template.tsx` (new) | `<RouteTransition style={…}>` reading the theme via `getRuntime`. Operational segments use `fade`, `effects.pageTransitions=false` uses `none`. Enter-only. |
| Loading | `(sites)/rw/[tenantId]/loading.tsx` (new) | No full-screen spinner: an empty main area of `min-h-[60vh]` with a 2px top progress line in `--primary`. Must not render any text that matches journey locators. |
| Not found / error | `not-found.tsx` (exists), `error.tsx` (new, client) | Giant "404" in the accent font with a ParticleMorph-free CSS glitch/float. Thai copy "ไม่พบหน้านี้" + "กลับหน้าแรก". The error page: "เกิดข้อผิดพลาด" + "ลองใหม่" button (`reset()`). |
| Header | `shell/header.tsx`, `header-shell.tsx` | **All 6 layouts keep their structure and the accessible names** ("เปิดเมนู", account, cart labels). Add: nav links via `RollText`; an active-page dot that slides (`layoutId`); dropdown panels mask-reveal with 40ms item stagger. The CTA is wrapped in `Magnetic`. Transparent→solid stays at 24px. On scroll > 120px the header height shrinks 80→64px (`--dur-ui`). **No hide-on-scroll** (a hidden fixed header breaks Playwright clicks). The cart badge bounces when `cartCount` changes. Optional `LiveClock` in the header when the preset is obsidian or `header.clock` is set in tenant settings (`settings.header.clock: boolean`). Floating variant: the glass pill gets an inner highlight border and shrinks its width slightly on scroll. |
| Mobile menu | `shell/mobile-nav.tsx` | Keep the Radix `Sheet` (focus trap, Esc, `aria-label="เปิดเมนู"`). Restyle to **full-screen** on phones: background `--foreground` with `--background` text (or `--primary` on playful presets), entering via `clip-path: circle(0 at top right)` → `circle(150%)` over 600ms `--ease-in-out-circ`. Links at `--step-4` with word SplitReveal stagger 50ms and a mono index `01 02 03`. Bottom: contact lines, social, LiveClock. Children accordion keeps its behaviour. Add `data-lenis-prevent` on the scroll container. |
| Footer | `shell/footer.tsx` | All 4 layouts keep their link/contact content. Add to **every** layout: a `GiantWordmark` of `brand.logoText ?? tenant.name` (big layout already has one; upgrade it to `effect="rise"`, or `"spotlight"` on dark presets) and `BackToTop`. `big` layout on ≥ 1024px with expressive motion: **sticky reveal** (`footer {position: sticky; bottom: 0; z-index: 0}`; main gets `position: relative; z-index: 1; background: var(--background)`), disabled when the footer is taller than the viewport. Keep TAP_LINK sizes. |
| Floating LINE | `shell/floating-chat-link.tsx` | Keep `data-floating-chat`, `aria-label`, the hide segments and the AA colours. New look: 56px circle (LINE green icon on `#067A36`) whose label pill **expands on hover/focus** (desktop) and shows only on first load for 4s on phones, then collapses to the circle (fixes A11). Wrap in `Magnetic` on desktop. Enter animation: scale from 0.6 with spring after 1.2s. |
| Theme toggle | `shell/theme-toggle.tsx` | Sun↔moon morph (SVG mask circle), 320ms. Keep the labels. |
| Effects | `shell/effects.tsx` | Keep `CursorGlow`/`Scanlines`; `CursorGlow` is disabled automatically when `effects.cursor !== "off"` (no double cursor). |
| Page body | `apps/web/src/components/page-body.tsx` | `HERO_TYPES` stays `hero, stay-search, event-hero`. Every new hero *variant* (scatter, cinematic) is still type `hero`, so no change is needed; keep the file as is unless a hero-type section is added. |

### 6.4 Operational page polish (shell provides tokens; module agents apply them)

Cart, checkout, account/*, orders, order status, booking wizard, reserve, stay booking, wallet, topup form, tickets, QR dine-in, login/OTP:

- PageIntro "compact" variant (no SplitReveal; a 300ms fade).
- Progress steppers with a line that fills.
- Form fields with a floating-label focus line (CSS only).
- Primary buttons with an instant pressed state, then spinner, then ✓ morph.
- List add/remove via `motion` `layout` (≤ 250ms).
- Number changes (qty, totals) are plain text updates with a 150ms colour flash. **No odometer** (journeys read these values).
- Skeletons in `--muted` with a shimmer.
- Sticky action bars keep `data-sticky-bar`.

**Forbidden on these routes:** 3D, Lenis, pinning, custom cursor, preloader, parallax, marquee, and anything that delays an interaction.

---

## 7. Sections spec (`packages/storefront/src/sections/**`, `definitions/**`, `render.tsx`)

### 7.0 Rules for every section

- **Backwards compatibility.** `parseSectionProps` falls back to **all defaults** when any prop fails validation, so every enum change is **additive only**. Never rename or remove an enum value, and every new prop has a default. Every old variant value maps to a new hi-end rendering (tables below).
- **Shared building blocks.** Add these to `sections/_shared.tsx` and export them from `packages/storefront/src/index.ts`, so module agents reuse them:
  - **`SectionHeading`** (upgrade): eyebrow (Thai-safe tracking per `data-script`), heading via `SplitReveal mode="lines"`, optional giant/`bigTitle` mode, alignment.
  - **`PageIntro`** (new): `{eyebrow?, title, lead?, index?, compact?}` for module and inner pages.
  - **`DisplayText`** (new, server): renders a heading string, honouring `\n` as `<br/>`, applying `data-script`, and wrapping **digit runs** (`/\d[\d.,:+%]*/`) in `<span class="font-accent">` when the theme has an accent font. This is the digit-run rule.
- **One heavy moment at a time (one canvas per viewport).** Inside a hero, when `scene` resolves to a WebGL scene, any shader `background` renders its CSS poster instead, so there is never a second canvas. A section that mounts a WebGL scene must not be placed adjacent to another WebGL section. Templates are responsible for the order; `RenderSections` adds `data-heavy` to the wrapper and logs a dev warning when two are adjacent.
- **H1.** `H1_SECTIONS` stays `{"hero"}`. Module heroes keep their own H1 logic.
- **Admin.** Every new prop key gets a Thai label in `apps/admin/src/lib/zod-introspect.ts` `LABELS`. Add an `OPTION_LABELS` map so enum buttons show Thai (`cinematic` → "ภาพยนตร์ (3D)", `scatter` → "การ์ดลอย", `curved` → "แกลเลอรีโค้ง 3D", …) via `auto-form.tsx`.

### 7.1 Existing sections: new rendering and variant mapping

| Section | Old value → new look | New props (all defaulted) |
|---|---|---|
| **hero** | `split` → 7/5 grid: copy column with mask-line SplitReveal; media column = `ImageReveal` + `HeroScene` *inside the media column* (never behind copy). `centered` → centred headline at `--step-6` over `HeroBackground`; the scene sits behind with a radial scrim that guarantees AA. `fullscreen` → full-bleed photo with a slow push-in, scroll parallax + darkening, the scene as an overlay layer, copy bottom-left. `editorial` → giant type spanning 8 columns, offset media with clip reveal, corner labels. `stacked` → headline, then wide media that **scales from 0.86 → 1 width with scroll**. **New** `scatter` → `ScatterCards` around a centred headline (uses `cards`). **New** `cinematic` → full-bleed `HeroScene` + giant headline + corner labels; the photo becomes the scene texture/poster. | `scene: SceneKind = "auto"`, `cards: {image, alt, title?, tag?, href?}[] = []`, `cycleWords: string[] = []` (WordCycler replaces `{*}` in `heading`, or is appended as a new line), `headingSize: "auto"\|"xl"\|"giant" = "auto"`, `clock: boolean = false`, `cornerLabels: string[] = []` (max 3). Variant enum += `"scatter","cinematic"`. Background enum += the 4 shader kinds. |
| **features** | `cards` → GlowCards, stagger. `list` → numbered rows `01…` with a hover expand of the description. `bento` → asymmetric bento with ImageReveal/parallax images. `icons` → line icons that draw on enter. **New** `sticky` → StickyStory (items' `image` as media). | variant += `"sticky"` |
| **text** | `normal` → editorial column, `--step-1` lead. `large` → **ScrubText** statement at `--step-4`/`--step-5`. | — |
| **image-text** | `plain` → ImageReveal + ParallaxMedia. `card` → floating text card overlapping the image (`--shadow-float`). `overlap` → 3 depth layers (image, colour block, text card) with different parallax speeds. **New** `pinned` → image sticky while the text scrolls. | style += `"pinned"` |
| **gallery** | `grid` → DisplaceImage hover + lightbox. `masonry` → columns at different parallax speeds. `carousel` → **CurvedGallery 3D** (CSS strip fallback). `filmstrip` → HorizontalScroll with velocity skew. **New** `curved` (explicit 3D), `polaroid` (draggable scattered prints). | layout += `"curved","polaroid"` |
| **testimonials** | `cards` → staggered cards, the quote mark draws. `marquee` → two VelocityMarquee rows in opposite directions. `spotlight` → giant SplitReveal quote + avatar switcher. **New** `chat` → chat bubbles popping in (left/right alternating, typing dots, rating as stars in a bubble footer). | variant += `"chat"` |
| **faq** | `single`/`two-column` → numbered accordion rows at `--step-2`, plus→× rotation, spring height, mask reveal. | — |
| **cta** | `banner` → full-bleed giant heading + round magnetic button + thin marquee band. `card` → floating card with `ShaderBackdrop mesh` inside. `split` → clip-reveal image + text. `glow` → `ShaderBackdrop aurora` behind a giant heading with a pointer glow, **always theme-dark-aware** (no light block on dark presets). **New** `wordmark` → heading fitted to the full width (GiantWordmark logic) with the button under it. | variant += `"wordmark"` |
| **contact** | (no variant) → `classic`: tinted map, floating-label fields, hours as a clean table. **New** `chips` → interest + budget chip groups that prefill the message field (client only, **no backend change**; the submitted form is the same). | `variant: "classic"\|"chips" = "classic"`, `interests: string[] = []`, `budgets: string[] = []` |
| **stats** | `row` → Odometer with thin dividers. `cards` → GlowCards with odometers. `big` → full-width giant odometers in the accent font. | — |
| **logos** | `marquee` → VelocityMarquee, grayscale→colour on hover; static grid otherwise. | `names: string[] = []` (typographic logos in the accent font; rendered when `items` is empty or in addition) |
| **marquee** | all 4 styles → VelocityMarquee (`giant` gets the Thai clip fix). | `velocity: boolean = true` |
| **pricing** | → TiltCard (≤ 5°) + GlowCard; `highlighted` gets `GradientBorder` and a slightly rotated sticker badge. | — |
| **team** | `grid` → portraits with hover colour + RollText name. `cards` → as today, refined. `large` → HorizontalScroll portraits. | variant += `"list"` (rows with HoverPreview portraits) |
| **video** | poster with ImageReveal; a magnetic round play button (cursor "play"); click loads the iframe in place (lazy, no autoplay). | — |
| **steps** | `horizontal` → a connecting line drawn by scroll. `vertical` → sticky numbers. `cards` → cards that stack as you scroll (sticky offsets). **New** `numbered` → giant `01–04` grid (Vyre process). **New** `tunnel` → WormholeTunnel with the items as steps. | variant += `"numbered","tunnel"` |
| **spacer** | `divider` → a line that draws on enter. | — |
| **announcement** | a thin band; with `scroll` a slow VelocityMarquee. | `scroll: boolean = false` |

### 7.2 New section types (add to `definitions/index.ts`, `SECTION_DEFS` and the `render.tsx` registry)

```ts
export const curvedGallery = defineSection({
  type: "curved-gallery", name: { th: "แกลเลอรีโค้ง 3D", en: "Curved 3D gallery" }, category: "media",
  schema: z.object({
    eyebrow: z.string().default(""), heading: z.string().default(""), subheading: z.string().default(""),
    bigTitle: z.string().default(""), bigTitleSuffix: z.string().default(""),
    items: z.array(z.object({ image: z.string(), title: z.string(), subtitle: z.string().default(""), tag: z.string().default(""), href: z.string().optional() })).default([]),
    floor: z.enum(["grid", "reflect", "none"]).default("grid"),
    autoplay: z.boolean().default(true),
    height: z.enum(["screen", "tall", "compact"]).default("screen"),
    cta: link.optional(),
  }), defaults: {},
});

export const stickyStory = defineSection({
  type: "sticky-story", name: { th: "เรื่องเล่าแบบเลื่อนติด (Sticky story)", en: "Sticky story" }, category: "content",
  schema: z.object({
    eyebrow: z.string().default(""), heading: z.string().default(""), subheading: z.string().default(""),
    items: z.array(z.object({ title: z.string(), kicker: z.string().default(""), body: z.string().default(""), image: z.string().default(""), chips: z.array(z.string()).default([]), href: z.string().optional() })).default([]),
    mediaStyle: z.enum(["card", "arch", "full", "device", "plate"]).default("card"),
    side: z.enum(["left", "right"]).default("right"),
    counter: z.boolean().default(true),
  }), defaults: {},
});

export const tunnel = defineSection({
  type: "tunnel", name: { th: "อุโมงค์ขั้นตอน 3D", en: "Wormhole steps" }, category: "content",
  schema: z.object({
    eyebrow: z.string().default(""), heading: z.string().default(""),
    steps: z.array(z.object({ kicker: z.string().default(""), title: z.string(), body: z.string().default(""), image: z.string().default("") })).default([]),
    tint: z.enum(["primary", "accent", "foreground"]).default("primary"),
    length: z.enum(["short", "normal", "long"]).default("normal"),
  }), defaults: {},
});

export const giantWordmark = defineSection({
  type: "giant-wordmark", name: { th: "ตัวอักษรยักษ์ (Wordmark)", en: "Giant wordmark" }, category: "layout",
  schema: z.object({
    text: z.string().default(""),            // "" = tenant name
    style: z.enum(["solid", "outline", "gradient", "image"]).default("solid"),
    image: image.optional(),
    effect: z.enum(["rise", "parallax", "spotlight", "marquee"]).default("rise"),
    caption: z.string().default(""),
  }), defaults: {},
});

export const horizontalScroll = defineSection({
  type: "horizontal-scroll", name: { th: "การ์ดเลื่อนแนวนอน", en: "Horizontal scroll" }, category: "media",
  schema: z.object({
    eyebrow: z.string().default(""), heading: z.string().default(""), subheading: z.string().default(""),
    items: z.array(z.object({ image: z.string(), title: z.string(), body: z.string().default(""), tag: z.string().default(""), href: z.string().optional() })).default([]),
    cardStyle: z.enum(["poster", "editorial", "numbered"]).default("poster"),
    ratio: z.enum(["3/4", "4/5", "16/10", "1/1"]).default("4/5"),
  }), defaults: {},
});

export const projectList = defineSection({
  type: "project-list", name: { th: "รายการผลงาน (Hover preview)", en: "Project list" }, category: "media",
  schema: z.object({
    eyebrow: z.string().default(""), heading: z.string().default(""), bigTitle: z.string().default(""),
    items: z.array(z.object({ title: z.string(), category: z.string().default(""), year: z.string().default(""), image: z.string().default(""), summary: z.string().default(""), href: z.string().optional() })).default([]),
    layout: z.enum(["list-hover", "grid-staggered"]).default("list-hover"),
    cursorLabel: z.string().default("ดูโปรเจกต์"),
  }), defaults: {},
});

export const interlude = defineSection({
  type: "interlude", name: { th: "ฉากคั่น 3D", en: "3D interlude" }, category: "media",
  schema: z.object({
    scene: z.enum(["shader", "particle-morph", "floating-objects", "breathing-orb", "ocean", "stage-lights", "steam", "water-ripple"]).default("shader"),
    heading: z.string().default(""), body: z.string().default(""), cta: link.optional(),
    words: z.array(z.string()).default([]),   // particle-morph text shapes / cycler
    height: z.enum(["screen", "tall"]).default("screen"),
    align: z.enum(["center", "left"]).default("center"),
  }), defaults: {},
});
```

**Rendering notes**

- All new sections render their DOM content on the server: titles, links, step text (SEO, a11y, fallback).
- `curved-gallery`/`tunnel`/`interlude` reserve their height on the server (`100svh`, or `length` × `100svh` for tunnel) and show `ScenePoster` until the scene is ready.
- `items`/`steps` with an empty array render nothing (no empty shells).
- New Thai labels for the admin: bigTitle "หัวข้อยักษ์", bigTitleSuffix "ข้อความต่อท้ายหัวข้อยักษ์", floor "พื้น 3D", autoplay "หมุนอัตโนมัติ", height "ความสูง", mediaStyle "สไตล์สื่อ", side "ฝั่งสื่อ", counter "แสดงเลขลำดับ", chips "ป้าย", kicker "ข้อความนำ", steps "ขั้นตอน", tint "โทนสี", length "ความยาว", effect "เอฟเฟกต์", ratio "สัดส่วนภาพ", category "หมวด", year "ปี", summary "สรุป", cursorLabel "ข้อความบนเคอร์เซอร์", scene "วัตถุ 3D", words "คำ", cards "การ์ดลอย", cycleWords "คำที่สลับวน", headingSize "ขนาดหัวข้อ", clock "แสดงนาฬิกา", cornerLabels "ป้ายมุมจอ", interests "ตัวเลือกความสนใจ", budgets "ตัวเลือกงบประมาณ", names "ชื่อแบรนด์ (ตัวอักษร)", velocity "ตอบสนองการเลื่อน", scroll "เลื่อนวิ่ง", subtitle "คำบรรยายรอง", tag "ป้าย".

### 7.3 Module sections (for the later module agents)

Module sections keep their schemas. They adopt the shared building blocks and the template directions in §5:

- product-grid / category-list: card hover language, hover-reveal index for categories
- game-grid / topup-feed: GlowCard, HUD ticker, empty feed hidden
- menu-highlight: HorizontalScroll plates
- service-list `menu`: HoverPreview
- class-highlights `editorial`: HorizontalScroll
- room-grid `editorial`: panoramic HorizontalScroll
- stay-search: ocean scene
- event-hero: StageLights + Ticket3D + Odometer countdown
- event-grid: poster tilt
- event-highlights: HorizontalScroll

Additive enum changes only.

---

## 8. Ownership map and phases

### 8.1 Phase 1 (now, in parallel)

| Agent | Owns (exclusive write) | Must not touch | Delivers first (day-1 stubs) |
|---|---|---|---|
| **kit3d** | `packages/ui/src/three/**`, `apps/web/src/app/(platform)/lab/three/**` | everything else (asks kitmotion for `package.json` exports) | `Scene3D`, `useCapability`, `useThemeColors`, `ScenePoster`, and wrappers for every §3.1 component rendering the poster, with final prop types |
| **kitmotion** | `packages/ui/src/motion/**`, `packages/ui/src/fx/**`, `packages/ui/src/styles/**`, `packages/ui/package.json` (exports only), `apps/web/src/app/(platform)/lab/motion/**` | three/** | the exports lines, `gsap.ts`, `SmoothScroll`, `SplitReveal`, `RollText`, `Odometer`, `VelocityMarquee`, `StickyStory`, `HorizontalScroll`, `HeroScene` (switch), and the tokens in globals.css |
| **platform** | `apps/web/src/app/(platform)/**` (excluding `lab/**`), `apps/web/src/components/platform/**`, `apps/web/public/showcase/**`, `tooling/qa/redesign/platform-*.ts` + `capture-showcase.ts` | tenant code, kits | §4 complete; screenshots captured after the template phase |
| **shell** | `packages/storefront/src/shell/**`, `(sites)/rw/[tenantId]/layout.tsx`, `loading.tsx`, `not-found.tsx`, `error.tsx`, `template.tsx`, `packages/core/src/theme/**`, `apps/web/src/app/globals.css`, `apps/web/src/fonts.ts`, `apps/web/src/components/page-body.tsx` | sections, kits | §6.1 schema + presets (incl. obsidian) + fonts first, because sections and admin depend on them |
| **sections** | `packages/storefront/src/sections/**`, `packages/storefront/src/definitions/**`, `packages/storefront/src/render.tsx`, `apps/admin/src/app/t/[slug]/design/**`, `apps/admin/src/app/t/[slug]/pages/**`, `apps/admin/src/components/editor/**`, `apps/admin/src/lib/zod-introspect.ts` | templates, modules, shell | §7 (`_shared` building blocks first) + the admin option UIs for §6.1 effects |

Shared append-only file: `packages/storefront/src/index.ts`. Shell appends shell exports and sections appends section exports. Never reorder or delete lines.

### 8.2 Phase 2 (after phase 1 lands): one agent per module

Each module agent owns `packages/modules/<module>/**`, its tenant routes under `apps/web/src/app/(sites)/rw/[tenantId]/<routes>` and the template files using it:

| Module | Routes | Templates |
|---|---|---|
| commerce | products, collections, cart, checkout, orders | shop, cafe |
| topup | games, topup, wallet | topup |
| booking | services, staff, book, bookings, classes, schedule, instructors, packages | clinic, salon, course |
| restaurant | menu, order, reserve, reservations, t | restaurant |
| rental | rooms, stay, stays | hotel |
| events | events, tickets | events |
| corporate (no module) | — | corporate (+ `packages/templates/src/shared.ts`) |

Each agent applies §5 to its template file, runs `reset-demo` + `create-admin`, and screenshots.

### 8.3 Phase 3: QA

Full Playwright journeys (`tooling/qa/*-journey.ts`, all 26 must stay green), hydration and console checks, overflow at 360/390/768/1440/1920, reduced-motion and no-WebGL passes, Lighthouse budgets (§2.8), and an art-director screenshot review.

---

## 9. Definition of done (every builder, every page)

1. **Function.** Every existing journey passes. Visible Thai labels, button texts, headings, form labels, ARIA names, routes and `data-*` hooks are unchanged. Split or rolled text keeps **one** accessible name (no doubled names).
2. **Theme.** Recolouring the tenant (admin design editor) recolours every surface **and every 3D scene** without a reload of the scene logic. A Thai-only logo text, a Latin-only logo text and an uploaded logo all look right in the header, footer wordmark and preloader.
3. **Thai.** No clipped marks at any size, no orphaned `ๆ`, no letter-spaced Thai, and line-heights per §2.2.
4. **Motion.** It follows §2.1 tokens and the motion-level table. Reduced motion gives a complete static page. No hydration warnings (seeded randomness, server-side segmentation, clocks filled after mount).
5. **Performance.** Within §2.8. Scenes pause off-screen and when the tab is hidden, and fall back on context loss, with no layout shift.
6. **Accessibility.** Keyboard reachable, visible focus, AA contrast (including text over scenes), tap targets ≥ 44px, custom cursor never over form fields.
7. **Responsive.** 360 → 1920 with no horizontal page scroll. The mobile first viewport shows a visual (A2).
8. **Evidence.** Screenshots at 1440×900 and 390×844 in `tooling/screenshots/redesign-<agent>-<page>-<w>.png`, each reviewed with an art director's eye. Iterate until it is a page you would submit to Awwwards. Progress is logged in `tooling/qa/redesign/<agent>.md`.

