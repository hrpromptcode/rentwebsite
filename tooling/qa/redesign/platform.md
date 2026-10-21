# platform (RentWeb showcase site) progress

Owner: apps/web/src/app/(platform)/** (except lab/**), apps/web/src/components/platform/**, apps/web/public/showcase/**,
tooling/qa/redesign/platform-*.ts + capture-showcase.ts

## done
- read direction §4, kit3d.md, kitmotion.md, existing page (CTA targets: `${env().ADMIN_URL}/signup`, `/login`, `signup?plan=<key>`)
- showcase imagery captured (30 files) by `tooling/qa/redesign/capture-showcase.ts` (cd tooling; `pnpm exec tsx qa/redesign/capture-showcase.ts [--only=k1,k2] [--skip-long] [--skip-m]`):
  apps/web/public/showcase/<key>.webp (1440×900), <key>-m.webp (780×1688), <key>-long.webp (960 wide ≤4800 tall).
  keys: shop topup clinic restaurant salon corporate cafe course hotel events. RE-RUN after the storefront redesign (names stable).
  If a capture comes out ~2 KB the dev server was mid-rebuild → re-run with --only.
- components/platform/shapes.ts (lucide paths for ParticleMorph, generated), platform.css (tokens + brand CSS)

- route structure: (platform)/layout.tsx = root html (fonts, metadata, tokens via platform.css html:has(.pf-root));
  (platform)/(site)/layout.tsx = chrome (Preloader, SmoothScroll, RouteProgress, Grain, CursorProvider, SiteHeader, SiteFooter, .pf-root)
- home (site)/page.tsx DONE: hero (ParticleMorph synced to WordCycler via hero-sync.tsx), tools VelocityMarquee, TemplateCylinder
  (CurvedGallery), BusinessStory (StickyStory + CSS-3D DevicePair, paper), pains ChatBubbles, LaunchTunnel (WormholeTunnel),
  RealNumbers (Odometer), FeatureBento (live micro-demos), PricingSection (paper, PricingPlans toggle), FAQ (FaqList), FinalCta (ShaderBackdrop ember)
- verification scripts: tooling/qa/redesign/platform-shots.ts (--pages= --w= --frames --reduce --nogl --nofull), platform-hero-seq.ts

- pages written: /templates (TemplateGrid Flip filter), /templates/[key] (mesh shader hero, DevicePair parallax + long autoscroll,
  features list, PresetScope palette playground, next-template HoverPreview), /pricing (hero odometer, PricingSection, CompareTable,
  billing FAQ), /features (module StickyStory w/ AnnotatedShot, payments, LINE phone, security + SLA odometer, bento), branded 404
  ((site)/[...rest] → notFound → (site)/not-found.tsx; (platform)/not-found.tsx without chrome), site-status restyled (texts kept),
  robots.txt + sitemap.xml route handlers, OG image public/showcase/og.png (tooling/qa/redesign/platform-og.ts), icon public/showcase/icon.svg
- NOTE: files created with bash heredoc are sometimes not picked up by Turbopack → make a real Edit to them.

- verification so far: 1440 + 390 frames for every page reviewed; reduced-motion pass (home/templates/tpl-shop/features/pricing,
  0 errors, 0 overflow after .pf-story overflow-x:clip); no-WebGL pass (posters); 404 console clean (Preloader moved from the
  (site) layout into home page.tsx — a <script> in the layout made React warn on 404s).
- thai.ts tg(): {groups} + auto LOANWORDS list, WJ inside + ZWSP around (skipped next to brackets/quotes).

## in progress
- final full-page screenshots (platform-shots.ts --w=1440,390) + typecheck

## next
- /templates, /templates/[key], /pricing, /features, not-found ([...rest] catch-all → notFound()), robots/sitemap/OG
- verify 1440/390 + reduced motion + console; typecheck

## decisions
- fonts: Unbounded + JetBrains Mono loaded locally in components/platform/fonts.ts (apps/web/src/fonts.ts is shell-owned)
- tokens scoped to html[data-site="platform"]; paper chapters [data-tone="paper"]
- unmatched platform URLs: default Next 404 today (multiple root layouts) → add (platform)/[...rest]/page.tsx calling notFound()

- Thai line breaks: Chrome AND Node split loanwords/compounds ("สตูดิ|โอ", "จากไอ|เดีย", "ราย|ละ|เอียด"). components/platform/thai.ts
  `tg("…{word}…")` joins the graphemes of {groups} with U+2060 WORD JOINER; used on headings + lead copy.
- Turbopack sometimes keeps a stale (platform)/layout.tsx after a bash heredoc rewrite → make a tiny real edit to the file.

- billing FAQ: no tax-invoice (ใบกำกับภาษี) policy exists in code/docs → omitted instead of inventing; Enterprise CTA "ติดต่อเรา" links to signup?plan=enterprise (no sales contact channel known) — owner follow-up.

## For kit owners
- SplitReveal (lines/words) breaks inside loanwords because Intl.Segmenter splits them ("จากไอ|เดีย") — consider a glue list or honour U+2060.
- GiantWordmark: `cap` (default --step-8) wins over the fit factor, so wide accent fonts (Unbounded) overflow; platform passes cap="40vw".
- WordCycler has no index callback; platform hero syncs ParticleMorph by observing `data-active` on `.rw-cycler` (MutationObserver).
