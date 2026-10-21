# sections agent progress (storefront sections + definitions + admin page-builder options) — status: COMPLETE (2026-10-22)
Owner: packages/storefront/src/sections/**, packages/storefront/src/definitions/**, packages/storefront/src/render.tsx,
apps/admin/src/app/t/[slug]/{design,pages}/**, apps/admin/src/components/editor/**, apps/admin/src/lib/zod-introspect.ts,
apps/web/src/app/(platform)/lab/sections/**, append-only: packages/storefront/src/index.ts

## status
- [x] read spec §2/§3/§5/§7, kit docs (kit3d.md, kitmotion.md), all existing sections, definitions, render, admin auto-form/introspect/section-editor/theme-editor
- [x] definitions: `fx` prop on every core section + additive enums (hero scatter/cinematic + 4 shader bgs + scene/cards/cycleWords/headingSize/clock/cornerLabels,
      features sticky, image-text pinned, gallery curved/polaroid, testimonials chat, cta wordmark, contact variant/interests/budgets,
      logos names, marquee velocity, team list, steps numbered/tunnel, announcement scroll) + new types (curved-gallery, sticky-story, tunnel,
      giant-wordmark, horizontal-scroll, project-list, interlude) + Thai descriptions for every core type
- [x] _shared building blocks + _styles (hoisted CSS) + _scene (scene switch) + client islands
- [x] all 18 existing sections rebuilt (old prop values map onto the new look) + 7 new section components + render registry + heavy-adjacency dev warning
- [x] admin: LABELS + OPTION_LABELS/optionLabel (Thai enum buttons/selects), nested primitive arrays inside object items (sticky-story chips),
      add-dialog wireframe thumbnails + 2-line descriptions (components/editor/section-thumbs.tsx), theme-editor §6.1: smoothScroll,
      cursor, preloader, transitionStyle, scene3d, 4 shader hero bgs, accent-font picker, latinOnly fonts hidden from heading/body/display
- [x] lab page http://localhost:3000/lab/sections (?preset=&type=hero,gallery&fx=calm|off&mode=dark) — 77 samples, notFound in production
- [x] verification: all 10 homes + corporate services/work/about/contact at 1440 + 390 (tooling/qa/redesign/sections-shots.ts), 0 console /
      hydration errors, 0 px overflow; lab fx=off / fx=calm / candy / riviera-390 and reduced-motion corporate/cafe: 0 errors
      (qa/redesign/_sections-checks.ts); admin page builder + design editor screenshots 0 errors (qa/redesign/_sections-admin.ts)
- [x] `pnpm --filter @rentweb/storefront --filter @rentweb/admin --filter @rentweb/web typecheck` green; `pnpm --filter @rentweb/core test` 189/189

## exported API (packages/storefront index.ts) for module agents
Section({type, fx, heavy, tone, ariaLabel, as}), SectionHeading({…old, layout:"split", index, fx, accent, size:"sm|md|lg|xl"}),
PageIntro({eyebrow, title, lead, index, compact, align}) (renders the page <h1>), DisplayText (\n + digit runs in font-accent),
RevealHeading({text, as, trigger, mode, from, fx, accent}) (SplitReveal, pre-line), Eyebrow (Thai-safe tracking), CtaButton
(Magnetic + RollText + sliding arrow), ArrowGlyph, Rise, StaggerList/StaggerCell, fxOf, allow3d, hasAccentFont, motionOf, sized, pad2,
SectionStyles, SceneLayer/resolveScene/sceneRole/Poster/shaderFor/posterFor/presetKey (_scene), NumberedSteps, BigTitle, isHeavySection.
In _shared but not re-exported: stepFor(text, [s1,s2,s3], [l1,l2]) / textLen (length-aware type steps).

## decisions
- per-section `fx: "auto" | "calm" | "off"` (label "เอฟเฟกต์ & 3D"): auto = theme; calm = reveals only, no WebGL / pin / horizontal pin;
  off = no motion at all (plain markup, static marquee). Theme effects.scene3d="off" also disables section 3D (allow3d).
- scene "auto" = preset signature scene; missing inputs (card-stack without ≥3 cards, silk/ripple without photo) fall back to the preset's
  FloatingObjects (or a shader). Placement-aware props in _scene.tsx (media / backdrop / full). A hero never mounts a shader bg + scene.
- definitions inline HERO_SCENES (no @rentweb/ui import in definitions: admin bundles it).
- section CSS: sections/_styles.tsx = React 19 hoisted `<style href="rw-sections" precedence="default">`, base rules in @layer components
  (utilities win), scroll-linked effects = CSS scroll-driven animations (progressive enhancement, no JS on scroll).
- FAQ schema gets NO new array prop (admin-journey clicks the only "เพิ่มรายการ" button). Add-dialog buttons keep the Thai section name.
- glow CTA / big stats sit on `--rw-night` (foreground in light themes, deepened background in dark): never a light block on dark presets.

## gotchas
- kit classes (.rw-img-reveal, .rw-glow-card, .rw-wordmark …) are UNLAYERED with position:relative → never pass `absolute`; wrap them.
- view() timelines break inside overflow:hidden ancestors (they become the scroller) → sections use overflow-clip; hero uses a named
  timeline (--rwhero) for drift/darken.
- Turbopack caches a failed resolve: never import a file before it exists (admin served "Can't resolve ./_styles" until restarted).
- Restarting a dev server from an agent: `run_in_background` children die / lose their console (0xc0000142 on spawn) → start with
  PowerShell `Start-Process cmd -ArgumentList "/c","pnpm dev:web > log 2>&1" -WindowStyle Hidden` from the repo root.
  2026-10-22 ~01:50 both :3000 and :3001 were restarted this way (stale "module factory is not available" for cta.tsx / ./_styles).
- /api/topup/feed 500 seen earlier was the stale cta.tsx factory (route imports @/modules → storefront render); fixed by the restart.

## for later agents (template / module phase)
- templates should add `\n` to long Thai headings (A5) — e.g. shop "สวมใส่ความเรียบง่าย\nที่ไม่ธรรมดา"; corporate logos need `names`
  (dummyimage placeholders still render when names are empty); topup hero needs `cards` for the card-stack scene.
- module sections can adopt SectionHeading layout="split", PageIntro, CtaButton, StaggerList/Cell, Section heavy/fx.

## screenshots
tooling/screenshots/redesign-sections-<site>-<1440|390>.png (contact sheets of scrolled viewport frames; f00 = first viewport),
redesign-sections-corporate-{services,work,about,contact}-<w>.png, redesign-sections-lab-hero-obsidian-1440.png,
redesign-sections-lab-new-obsidian-1440.png, redesign-sections-admin-{add-dialog,hero-form,sticky-form,effects,fonts}.png
