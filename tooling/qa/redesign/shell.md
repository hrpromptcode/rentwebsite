# shell agent progress (storefront shell + tenant layout + theme presets)
Owner: packages/storefront/src/shell/**, apps/web/src/app/(sites)/rw/[tenantId]/{layout,loading,not-found,error,template}.tsx,
packages/core/src/theme/**, apps/web/src/fonts.ts, apps/web/src/app/globals.css

## done
- read direction §1-2, §5, §6; kit3d.md, kitmotion.md; existing shell + theme code

- theme: schema (HERO_BACKGROUNDS += shader-*, CURSOR_MODES, PRELOADERS, TRANSITION_STYLES, SCENE_QUALITY, effects += smoothScroll/cursor/preloader/transitionStyle/scene3d, fonts.accent),
  fonts.ts (latinOnly accent fonts instrument-serif/fraunces/unbounded/space-grotesk + THAI_FONT_KEYS/ACCENT_FONT_KEYS/isThaiFont/isAccentFont/accentStack),
  resolve.ts (fonts.accent, --font-accent, data-cursor/smooth/scene3d/transition/preloader/accent), presets (all 12 filled per §5.0 + obsidian); core theme tests green
- apps/web/src/fonts.ts: Instrument_Serif, Fraunces, Unbounded, Space_Grotesk, JetBrains_Mono (--font-jetbrains-mono)
- shell: route-kind(-shared/-script), nav-links (RollText + layoutId dot + mask dropdown), header-shell (DOM attrs data-scrolled/compact/on-dark/flow),
  header (clock, CartBadge, HeaderCta magnetic), mobile-nav (full-screen circle reveal), footer (GiantWordmark + BackToTop + big sticky reveal via footer-reveal),
  floating-chat-link (56px circle, peek), theme-toggle morph, effects (no CursorGlow when cursor on), social.tsx, shell.css (imported by apps/web globals.css)
- tenant layout wiring + template.tsx (RouteTransition) + error.tsx + not-found.tsx
- packages/templates/src/corporate.ts: themePreset "obsidian", recommendedPresets ["obsidian","quartz","midnight","aurora"] (§5.6);
  demo-corporate switched in place with tooling/qa/redesign/_shell-preset.ts (stored theme was just {preset})
- verification script tooling/qa/redesign/shell-shots.ts (--only=, --views=, --widths=, --checks)

- verified (shell-shots.ts, all 10 demos × 1440/390: top, scrolled, footer, menu, operational route, 404 + --checks):
  header transparent→glass + compact (65px) everywhere, on-dark hero detection, route kind flips (cart/checkout/book/stay/wallet =
  operational: no Lenis, no cursor), big footer sticky reveal where it fits (events, corporate @1440), keyboard rings on all header
  links, reduced motion = no Lenis + menu without animation, client nav keeps active dot; 0 hydration errors; only console errors
  are the expected "404 (Not Found)" document status on the 404 view. Screenshots tooling/screenshots/redesign-shell-*.png (reviewed).
- proxy.ts sets x-tenant-path → layout server-renders html[data-route] and mounts the Preloader only on "/" (no inline route
  script: Next renders 404s from its error shell on the client and React logs every <script> it creates there)
- typecheck green: @rentweb/core, storefront, web (+ admin, templates, tooling); core tests 189/189

## STATUS: DONE (2026-10-22)

## next (later phases / not shell-owned)
- sections agent: admin theme-editor controls for the new effect fields + accent picker (see "For other agents")
- common agent: reset-demo corporate when its composition changes (demo-corporate already switched to obsidian in place)

## decisions
- accent fonts live in FONTS with latinOnly:true (admin heading/body pickers must filter them; resolve() ignores them for heading/body/display)
- storefront package.json exports "./shell/route-kind" + "./shell/route-kind-shared" (client template imports without the barrel)
- header state = DOM attributes (no React state on scroll); in-flow sticky headers get margin compensation when compact
- floating chat: the anchor itself stays the fixed [data-floating-chat] element (globals.css offsets + verify scripts rely on it)
- cart badge text = number only (commerce-journey reads `header a[href="/cart"]` text); `rw:cart-bump` window event bounces it; `[data-cart-icon]` = fly-to target
- big footer: inverted block on light themes, --surface on dark themes; tokens re-mapped inside .rw-ft-inner
- NO tenant-level loading.tsx: a Suspense boundary at [tenantId] makes every notFound() answer HTTP 200 (soft 404; journeys
  assert 404 statuses). RouteProgress (2px --primary line on link click) is the navigation feedback instead. `.rw-loading-block`
  (muted shimmer skeleton) stays in shell.css for module agents' own skeletons.
- footer: BackToTop sits in a meta row above the wordmark (never in the bottom-right corner under the LINE button)
- dark sites: menu panel = background 72% + glow 28% (contrast verified ≥ 12.9 text / 7.2 muted on all presets)

## For other agents (exported APIs)
- @rentweb/core/theme: CURSOR_MODES (off|dot|label), PRELOADERS (off|counter|wordmark), TRANSITION_STYLES (none|fade|rise|curtain),
  SCENE_QUALITY (auto|lite|off), HERO_BACKGROUNDS += shader-aurora|shader-silk|shader-mesh|shader-caustics;
  ThemeEffects += smoothScroll, cursor, preloader, transitionStyle, scene3d (all optional in stored themes, presets fill them);
  theme.fonts.accent (stored: "" = use display; unset = preset default); ResolvedTheme.fonts.accent ("" when none);
  FONTS gains latinOnly accent fonts; THAI_FONT_KEYS / ACCENT_FONT_KEYS / isThaiFont / isAccentFont / accentStack.
  → admin theme-editor (sections agent): effects tab controls per §6.1 + TH.heroBg labels for shader-* + accent picker from
    ACCENT_FONT_KEYS + filter heading/body/display pickers with isThaiFont (resolve() already ignores Latin-only picks there).
- <html> data attributes: data-route (marketing|operational, set by inline script + RouteKind), data-cursor, data-smooth,
  data-scene3d, data-transition (none when pageTransitions=false), data-preloader, data-accent (accent key when set).
- client: `useRouteKind()` from "@rentweb/storefront/shell/route-kind"; pure `routeKindOf(segment)` / OPERATIONAL_SEGMENTS
  from "@rentweb/storefront/shell/route-kind-shared" (also re-exported by the barrel).
- cart: header cart link has `data-cart-icon` (fly-to-cart target); `window.dispatchEvent(new Event("rw:cart-bump"))` bounces
  the badge (it also bounces whenever the server count changes). Badge text = the number only.
- `ArrowSwap` (arrow slide-out/in icon for CTAs) exported from "@rentweb/storefront"; `.rw-loading-block` shimmer skeleton class.
- Footer/menu re-map tokens inside their panels (--foreground/--background/--muted-foreground/--border) so token classes just work.
