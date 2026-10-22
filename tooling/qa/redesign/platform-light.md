# platform-light — light redesign of the RentWeb home, PromptCode brand (owner requests 2026-10-22)

Owner: apps/web/src/app/(platform)/** (except lab/**), apps/web/src/components/platform/**, apps/web/public/showcase/**,
apps/web/public/brand/** (generated assets). Brief 1: bright, light, colourful, more interactive home ("ลูกเล่น").
Brief 2 (palette change): drop the violet "Daybreak" palette → the owner's own brand PromptCode (logo colours), RentWeb
presented as "a PromptCode product". Everything else (light theme, device-stack hero, chips, mesh, interactions) kept.

## palette (tokens in components/platform/platform.css, html:has(.pf-root)) — AA-checked
- background #F6F8FC · surface #EDF2FA · card #FFFFFF (glass white 70% + blur, border #DFE6F1) · ink #1B2233 (14.9:1)
  · muted #5B6477 (5.6:1 page, ≥4.5 on every pastel wash) · border #DFE6F1
- primary brand blue #1561B7 (white 6.1:1; hover #0F4F99) · accent pink #FF2E7E (decor) / #D11A63 small pink text (4.9:1)
- --pf-ocean #0EC0DC → #1E8FD8 → #1561B7 → #194FA9 (progress bar, typing dots, journey ticks, floor tint)
- --pf-sunrise #FF9F5A → #FB8464 → #FF5470 → #FF2E7E (doodles, sparkles, chips, recommended border, badge/pill tag)
- --pf-brand ocean → sunrise in sRGB with a short bridge (no purple midpoint): cycler underline, FAQ accent bar
- text gradients: --pf-sunrise-ink #E8632E → #EF4F52 → #E0246C ("5 นาที", ≥3:1 large) · ocean-ink #0A7FB0 → #1670C4 → #194FA9
  (TEMPLATES titles via .pf-grad-ocean, odometers)
- fills with white text: --pf-ocean-deep #0B78B4 → #1670C4 → #1561B7 → #194FA9 (≥4.4:1) · --pf-sunrise-deep #E0246C → #D11A63
- mesh washes #CDEFF7 cyan, #D6E4FA blue, #FFE2D3 peach, #FFD6E5 pink (+ white); chapter hue via [data-hue]
  (names historical: lilac = brand default, sky, peach, blush, violet = ocean, mint = aqua, dawn)
- fonts: Latin accent = Manrope 800 (components/platform/fonts.ts, `--font-pf-manrope`); Thai = Anuphan display + IBM Plex Sans Thai body (unchanged); tg() kept

## done
- brand assets: tooling/qa/redesign/brand-assets.ts → apps/web/public/brand/promptcode-mark.{png,webp} (455×512, transparent, colour-distance alpha
  against a fitted background model, edge colours decontaminated, drop shadow removed) + promptcode-logo.{png,webp} (1024 wide);
  check sheet tooling/screenshots/pf-brand-check.png (white + dark slate). Site icon public/showcase/icon.svg = SVG redraw of the 3 shapes (same path)
- header: PromptCode mark + "RentWeb" (Manrope 800) + "BY PROMPTCODE" (md+); footer: glass PromptCode brand card (full logo,
  "RentWeb — a PromptCode product", links https://promptcode-portfolio.netlify.app/ + https://www.facebook.com/promptcode.mb, new tab, rel=noopener),
  © "RentWeb by PromptCode", giant wordmark "Rent" ocean / "Web" sunrise (like the two halves of the mark) + pointer spotlight; metadata title/creator/publisher
- hero extras (PromptCode site motifs): faint giant outlined "RENTWEB" + six sunrise/ocean sparkle doodles twinkling
- tokens + paper tokens light; body transparent, html paints #F6F8FC; viewport themeColor #F6F8FC / colorScheme light
- MeshBackdrop (mesh-backdrop.tsx): 5 fixed pastel blobs, drift, pointer lean, chapter hue crossfade (@property colours)
- chrome: header transparent → white glass; glass menu button; pastel mobile menu; ScrollProgress ocean bar; cursor ocean disc with labels;
  preloader ocean; grain 0.026
- buttons: primary = ocean-deep fill + shine sweep + coloured shadow; ghost = glass; orb = white disc → ocean fill
- hero: HeroTitle (CSS mask rise, shimmering sunrise "5 นาที"), cycler + brand underline that follows the word width, HeroStage = live 3D browser +
  phone (pointer tilt / touch sway, page-wipe to the template of the current word, 5 glass chips popping on a loop at depth, halo, cursor light),
  link to the current template. Word→key map in hero-data.ts (shared, no "use client")
- tools pills, light gallery stage (scoped tokens → blue grid, peach-pink pool, white fog), story washes via :has(), DevicePair slate bezels,
  chat bubbles (blush pain / ocean answer), LaunchJourney (CSS-3D light tunnel: rings + confetti + flying screenshots + glass step card;
  reduced motion = numbered glass cards), numbers (glass + tilt + ocean odometers + colour corner glow, Reveal stagger), bento (glass,
  hairline gradient border, spotlight, reveal-on-seen), pricing (glass, tilt, sunrise rotating border + glow + "★ แนะนำ", ocean toggle pill),
  FAQ (glass rows, accent bar, filled icon), final CTA (deep blue → cyan panel with sunrise/pink corners, floating glass shapes, scrim)
- other pages: /templates ocean title; /templates/[key] hero light mesh (preset colours mixed with white, masked into the page);
  features/pricing glass cards + ocean odometers; AnnotatedShot light frame; compare badge "แนะนำ"; 404 blue neon
- showcase re-captured (30 files); hotel-long re-taken under reduced motion (capture-showcase.ts LONG_REDUCE: pinned horizontal sections
  left blank bands); OG re-tinted to PromptCode (platform-og.ts: mark + RentWeb BY PROMPTCODE, sunrise "5 นาที", ocean pill)
- verification (all with the PromptCode palette): platform-light-shots.ts home 1440/390 frames + full (stitched >16k px), --reduce, --nogl;
  templates / tpl-shop / features / pricing / 404 at 1440/390; platform-light-interact.ts (tilt + screen swap, CTA hover, yearly toggle,
  FAQ, gallery cursor): 0 console / hydration errors, 0 px overflow everywhere (404 page logs its own 404 response only);
  contrast sampled on screenshots: white on CTA panel ≥ 6.7:1, muted on hero mesh ≥ 4.8:1. `pnpm --filter @rentweb/web typecheck` green.

## decisions / gotchas
- dev server :3000 was NOT running at start → started with `pnpm dev:web` (log tooling/screenshots/_web-dev.log)
- after switching the accent font, Turbopack failed on next/font/google ("queries have exactly one entry", noto_sans_thai) even after a
  restart → stale persistent cache; fixed by moving apps/web/.next/dev/cache aside to apps/web/.next/dev/cache-stale-20261022 (10 GB, safe to delete)
- kit WormholeTunnel replaced by a CSS-3D light journey (full control of the light look, no WebGL needed, reduced-motion list built in)
- full-page Playwright captures > 16384 px wrap around → platform-light-shots.ts stitches 8000 px clips (fixed layers look stretched in full-page shots; judge with frames)
- device mockups keep dark (slate) bezels but get light rims/bases and coloured floor glows
