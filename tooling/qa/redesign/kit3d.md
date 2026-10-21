# kit3d — 3D kit (packages/ui/src/three/**) · status: COMPLETE (2026-10-22)

Lab: http://localhost:3000/lab/3d (alias /lab/three) — every component with sample images, live preset/mode switcher,
`data-scene3d` switch (auto / lite / off = posters) and an FPS meter. notFound() in production, robots noindex.

## done
- core: random, types, use-capability, theme-colors (no three), use-theme-colors (three), use-section-progress, scene-3d,
  poster, canvas-text, kit-styles; impl/canvas-host (r3f Canvas + drei PerformanceMonitor DPR stepping + fps watchdog + context-loss)
- ALL §3.1 components (P0 + P1). MediaPlanes (P2) = pass-through stub with final API.
- verification (tooling/qa/redesign/):
  - `kit3d-shots.ts` → tooling/screenshots/redesign-kit3d-<plate>-<1440|390>.png (37 plates × 2 widths), all `live`,
    55–60 fps on Intel UHD (headless with GPU flags), 0 console errors, 0 hydration warnings, 0 px horizontal overflow at 390.
  - `kit3d-checks.ts` (21 checks, all PASS): reduced motion (gallery CSS strip, tunnel static cards, orb cue list),
    no-WebGL (`--disable-3d-apis`: posters everywhere, 0 canvases), context loss → poster, gallery hover label / drag /
    Tab-focus rotates + labels / Enter + click navigate, live theme switch recolours canvases, remount after scroll-away and
    back-navigation come back live, ParticleMorph shapes (bag icon, flower, star, "RentWeb" text).
  - `contact-sheet.ts` builds review sheets (screenshots/_kit3d-sheet-*.png).
- `pnpm --filter @rentweb/ui --filter @rentweb/web typecheck` green.

## decisions / gotchas
- The barrel `@rentweb/ui/three` never imports three: wrappers lazy-load `impl/*-scene.tsx`, Scene3D lazy-loads
  `impl/canvas-host.tsx` (requested after requestIdleCallback once the box is within `rootMargin`).
- `useThemeColors` (THREE.Color, for code inside impl/) is NOT exported from the barrel (would pull three).
- Kit CSS (strip fallback, tunnel, orb cue, silk/steam/ticket fallbacks, sr-only) is injected with React 19 hoisted
  `<style href="rw-three-kit" precedence>` via `<KitStyles/>` — styles/** untouched.
- useMemo in impl must stay pure (r3f double-invokes in StrictMode); parenting/adding objects happens in effects.
- Glass = fresnel + reflection-luminance alpha on MeshPhysicalMaterial (real transmission on a transparent canvas only
  samples black). No HDR downloads: procedural PMREM "studio" env tinted with theme colours (`useStudioEnvironment`).
- Additive glow only on dark themes; light themes switch to normal blending automatically (`theme.dark`).
- Headless Playwright: launch with `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11`; SwiftShader is too slow and the
  low-fps watchdog swaps scenes to posters (set `html[data-scene3d-force]` to disable the watchdog when testing on software GL).
- Not enforced in code: "max 2 canvases mounted per page" — scenes unmount beyond `keepAlive` (150%); builders keep ≤ 1 canvas per viewport.

---------------------------------------------------------------------------------------------------------------------------
# PUBLIC API — `import { … } from "@rentweb/ui/three"` (or `@rentweb/ui/three/<file>` for a single component)

All components are `"use client"` wrappers that are safe to render from SERVER components with serialisable props
(strings, numbers, arrays, plain objects). Colours are `TokenOrColor`: a theme token name
(`"primary" | "accent" | "glow" | "foreground" | "background" | "surface" | "muted" | "ring" | "card" | "border"`) or any CSS colour;
scenes re-read them on theme change (html class/style/data-*, `#tenant-theme` edits, `window.dispatchEvent(new Event("rw:theme"))`).
Every scene: server-renders its fallback (no CLS, the PARENT sizes the box), mounts WebGL near the viewport, pauses off-screen /
hidden tab, unmounts far away, falls back on context loss or sustained < 30 fps, renders one static frame (or its poster)
under reduced motion, honours `html[data-scene3d]` = `auto | lite | off` and `html[data-motion="subtle"]` (half speed).
Canvases are `aria-hidden`; meaningful content is always in the DOM.

## Core
| export | use |
|---|---|
| `ScenePoster({ variant: "aurora"\|"silk"\|"mesh"\|"ocean"\|"stage"\|"ember"\|"orb"\|"grid"\|"plain", image?, imageAlt?, grain?=0.06, className?, style? })` | SERVER-safe static art (theme gradients + optional photo + grain). `position:absolute; inset:0` by default. |
| `Scene3D({ fallback, className?, style?, rootMargin?="200px", keepAlive?="150%", dpr?=[1,1.75], quality?="auto"\|"high"\|"low", frameloop?, camera?, orthographic?, eventSource?="self"\|"section", interactive?=true, minTier?="mid", lite?, reducedMotion?="frame"\|"poster", flat?, transparent?=true, overlay?, onFirstFrame?, onStatusChange?(s), children })` | Host for custom r3f scenes (children are r3f nodes). Root gets `data-scene-status="idle\|poster\|loading\|live\|lost"`. |
| `useCapability()` | `{ ready, webgl, webgl2, tier, deviceTier, reducedMotion, finePointer, saveData, mobile, scene3d }` (SSR → `ready:false`). |
| `useThemeHex(keys, scopeRef?)` / `readThemeHex(keys, scope?)` / `resolveCssColor(v, scope?)` / `subscribeThemeChange(cb)` / `isDarkColor(hex)` | theme colours as sRGB hex for 2D canvases/DOM (oklch / color-mix resolved via a 1×1 canvas). |
| `useSectionProgress(ref, { start?="top bottom", end?="bottom top" })` | `MutableRefObject<number>` 0..1, rAF-driven only while near the viewport, no React state. |
| `drawTextTexture`, `sampleTextPoints`, `sampleSvgPathPoints`, `sampleImagePoints`, `resolveFontFamily`, `ensureFont`, `wrapText` | 2D-canvas helpers (Thai-safe; wrap with Intl.Segmenter). |
| `mulberry32(seed)`, `seedFromString(s)`, `seeded(id)`, `rand` | deterministic randomness (also re-exported by the motion kit). |
| `KitStyles` | renders the hoisted kit CSS (wrappers already include it). |

## P0
### ShaderBackdrop — full-bleed animated shader background (cheap; runs on mid tier and in `lite` mode)
`{ variant: "aurora"|"silk"|"mesh"|"grain-gradient"|"ember"|"caustics", colors?: TokenOrColor[] (≤4, default ["primary","accent","glow","background"]; the 4th is the base), speed?=1, intensity?=1, pointer?=true, grain?=0.05, className?="absolute inset-0" }`
Dark base → light accents added; light base → tinted. Keep text on it AA (dark themes stay mostly dark).
```tsx
<section className="relative isolate overflow-hidden">
  <ShaderBackdrop variant="ember" colors={["#FF6B3D", "#8E7DFF", "glow", "background"]} />
  <div className="relative z-10">…heading + CTA…</div>
</section>
```

### CurvedGallery — Vyre-style cards bent on a cylinder around the camera above a perspective grid floor
`{ items: { image, title, subtitle?, href?, tag? }[], radius?=7, arc?=1.25, cardAspect?=0.8 (w/h; use 1.6 for 16:10 screenshots), rows?=1|2, bend?=0.12, autoplay?=0.05 (rad/s; 0 = snap to cards), drag?=true, scrollLinked?=true, floor?="grid"|"reflect"|"none", fog?=true, height?="screen"|"tall"|"compact", labels?="dom"|"none", cursorLabel?="ลาก", openLabel?="เปิดดู", ariaLabel?, className? }`
- Sizes itself (`screen` 100svh/min 560, `tall` 130svh, `compact` min(74svh,760)); renders nothing for `items=[]`.
- DOM: a real `<ul>` of `<a href>` links (CSS 3D scroll-snap strip as fallback / reduced motion; visually-hidden mirror when live:
  Tab focus rotates the ring to the card and shows the label with a focus ring; Enter follows the link).
- Drag (inertia), horizontal wheel, page-scroll velocity and autoplay rotate the ring; hover lifts/brightens a card and pins a
  glass DOM label (tag · title · subtitle) under it; click = the mirror link's `click()` (plain `<a>` navigation).
- Cursor hooks for the motion kit: root `data-cursor="drag"` + `data-cursor-label` (switches to `view` + openLabel on hover), `data-dragging`.
- Mobile: rows=1, radius ≤ 5, reflect → grid. Big titles ("WORKS ©19—26") go in the section above/over the top 25%.
```tsx
<CurvedGallery items={templates.map((t) => ({ image: `/showcase/${t.key}.webp`, title: t.name.th, subtitle: t.modules.join(" · "), tag: t.key.toUpperCase(), href: `/templates/${t.key}` }))} cardAspect={1.6} floor="grid" ariaLabel="เทมเพลตทั้งหมด" />
```

### ParticleMorph — GPU particles morphing between shapes with a curl-noise swirl
`{ shapes: ParticleShape[], active?: number, auto?: { interval: number }, morphOn?: "time"|"scroll"|"controlled", count? (default 40k high / 18k mid), size?=1.6, colors?: [TokenOrColor, TokenOrColor] (bottom→top, default ["primary","accent"]), pointerRepel?=0.6, rotate?=0.08, depth?=0.35, className?="relative h-full w-full" }`
`ParticleShape = "sphere"|"torus"|"knot"|"crystal-flower"|"star"|"wave"|"globe"|{ text, font?, weight? }|{ svgPath, viewBox?="0 0 24 24" }|{ image, threshold? }`
- `active` set → controlled (sync it with a WordCycler index); `morphOn="scroll"` maps the box's scroll progress across shapes.
- Lucide icons: pass the icon's path `d` strings joined with spaces as `svgPath` (stroke-sampled). Text uses the theme display font.
- Flat shapes (text/svg/image/star/wave) settle face-on with a gentle sway; volumetric shapes spin. `interactive` canvas is off
  (pointer read globally), so it never blocks clicks; put it in its own box (not under body copy).
```tsx
<ParticleMorph shapes={[{ text: "RentWeb" }, { svgPath: SHOPPING_BAG_D }, "crystal-flower"]} active={wordIndex} colors={["#FF6B3D", "#8E7DFF"]} className="absolute inset-y-0 right-0 w-[55%]" />
```

### FloatingObjects — procedural, theme-coloured objects per business (no GLTF)
`{ set: "fashion"|"gaming"|"clinic"|"food"|"spa"|"corporate"|"pastry"|"yoga"|"resort"|"events"|"abstract", material?="auto"|"glass"|"chrome"|"clay"|"pearl"|"satin", count? (7 high / 5 mid), layout?="orbit"|"scatter"|"stack"|"rain" (default per set), pointerParallax?=true, scrollParallax?=0.3, interactive?="none"|"poke"|"drag", clearCenter?=0 (fraction of width kept empty for copy, scatter), className?="absolute inset-0" }`
- sets: fashion = satin ribbons, buttons, thread spool, pearls · gaming = gems, coins with star, plus-pads, capsules · clinic = glass
  droplets, pearls, serum capsule, ring · food = bowl, chilies, basil leaves, rice · spa = stones, bamboo, lotus · corporate = chrome
  rounded cubes, half-pipes, glass grid tiles · pastry = iced donuts with instanced sprinkles, macarons, croissant, cherries
  (falls in with a bounce) · yoga = balancing stone stack + rings + soft spheres · resort = sun disc, glass waves, pebbles ·
  events = holo tickets, star bursts, spotlight cones · abstract = mixed.
- `interactive="none"` → `pointer-events:none` (safe over content); `poke` = tap impulse with springy return; `drag` = grab & throw.
```tsx
<div className="relative h-[70svh]"><FloatingObjects set="pastry" interactive="poke" clearCenter={0.25} /></div>
```

### WormholeTunnel — wireframe tunnel the camera flies through on scroll, with step cards and a DOM overlay
`{ steps: { kicker?, title, body?, image? }[], tint?="primary", wireframe?=true, rings?=48 (per 40 world units), stars?=true, length?="short"|"normal"|"long" (200/300/400svh), ariaLabel?, className? }`
- The component IS the tall section (sticky 100svh stage inside) — don't wrap it in another fixed-height box; renders nothing for `steps=[]`.
- Overlay (aria-hidden) crossfades the active step (`01 / 05 · kicker`, title, body) + progress ticks; the accessible content is a
  visually-hidden `<ol>` (with `<h3>` titles). Reduced motion: height auto, numbered cards grid, no stage. No WebGL: CSS rings.
```tsx
<WormholeTunnel steps={[{ kicker: "Template", title: "เลือกเทมเพลต", body: "…", image: "/showcase/shop.webp" }, …]} length="normal" ariaLabel="ขั้นตอนเปิดร้าน" />
```

## P1
### OceanSurface `{ mode: "ocean"|"pool"|"ripple", image?, imageAlt?, sun?="glow", water?="accent", sky?="background", horizon?=0.62, pointerRipples?=true, className?="absolute inset-0" }`
ocean = analytic Gerstner sea at golden hour with sun glitter path (low camera); pool = top-down tiles + voronoi caustics;
ripple = the photo refracted by pointer/tap ripples + ambient drops (spa hero). Pool/ripple are lite-capable. The ripple poster is the photo.

### StageLights `{ beams?=6, colors?=["primary","accent"], haze?=true, sweep?=0.35, bpm?=118, floor?="reflect"|"none", crowd?=false, className?="absolute inset-0" }`
Transparent volumetric beams from a truss, pulsing to the tempo, dust motes lit inside the beams, mirrored floor hits, optional
silhouette crowd (two rows, raised arms). Lay it OVER a photo (`<img className="absolute inset-0 object-cover opacity-40"/>` then `<StageLights crowd/>`).

### Ticket3D `{ title, date, venue?, price?, code?, holo?=true, interactive?="drag"|"tilt"|"none", className?="relative h-full w-full min-h-[320px]" }`
Extruded ticket with perforated stub notches, front/back drawn on canvas with theme fonts (Thai OK), iridescent foil; drag spins with
inertia and snaps to the front; pointer tilt. DOM mirror = sr-only text; fallback = CSS ticket.

### CardStack3D `{ items: { image, title, badge?, href? }[], layout?="fan"|"orbit"|"stack", autoplay?=true, floor?="synthgrid"|"none", rim?="accent", ariaLabel?, className?="relative h-full w-full min-h-[420px]" }`
Holographic cards (rim light, foil band): fan opens on hover, orbit circles a swirling portal ring (+ synthwave grid floor),
stack deals the top card to the back every ~2.6 s. Links live in a DOM mirror (CSS fan fallback); click/Enter navigate.

### BreathingOrb `{ pattern?=[4,4,6,2] (in, hold, out, hold s), cues?=["หายใจเข้า","ค้างไว้","หายใจออก"], colors?=["primary","glow","accent"], noise?=0.18, showCue?=true, className?="relative h-full w-full" }`
Displaced fresnel sphere breathing in sync with a DOM cue pill + progress ring (`aria-live="off"`). Reduced motion: static CSS orb
+ cue list "หายใจเข้า 4 วิ …". Also exports `breathAt(clock, nowMs)`.

### SteamRise `{ origin?="bottom"|"center"|[x,y] (0..1), density?=1, embers?=true, warmth?="glow", className?="absolute inset-0" }`
Wispy smoke billboards + additive embers over a food photo (transparent, pointer wind). Fallback: CSS steam puffs.

### ImageSilk `{ image, alt, wind?=0.6, pointer?=true, hang?="rod"|"free", sheen?=0.4, className?="relative h-full w-full" }`
The photo printed on hanging silk (48×64 segments), noise wind, pointer dent + ripples, satin sheen in `glow`. Root has
`role="img" aria-label={alt}`. Fallback: photo in a softly swaying clip-path frame under a rod.

## P2
### MediaPlanes `{ children, hover?, bend?, className? }` — pass-through container today (`data-media-planes`), safe to adopt.

## Legacy (lazy now): `OrbScene`, `FloatingShapes` (fx/hero-background imports ../three/orb-scene directly — kept).
