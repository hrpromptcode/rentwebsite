# direction (creative director) progress

## done
- before-shots script: tooling/qa/redesign/before-shots.ts (run from tooling/: pnpm exec tsx qa/redesign/before-shots.ts [--only=shop])
- 1440+390 before-shots captured (42 files, 0 console errors) + reviewed (heroes contact sheet in scratchpad); template dump script qa/redesign/_dump-templates.ts
- code read: definitions, render, shell header/header-shell/footer, theme schema/presets/resolve/fonts, ui kit, platform page, admin auto-form + zod-introspect LABELS + theme-editor effects, page-body HERO_TYPES

## key findings (for the doc)
- css vars are --background/--primary/... (NOT --rw-*); data attrs on <html>: data-preset/header/footer/button/card/container/motion/hero-bg/grain/glass
- 12 presets: aurora neon porcelain ember zen quartz candy midnight studio loft riviera stage; 25 fonts; 10 templates; modules used: commerce booking topup restaurant clinic rental events (cms base)
- parseSectionProps falls back to ALL defaults when a prop fails -> enums must stay additive
- admin enum options render raw values; field labels from apps/admin/src/lib/zod-introspect.ts LABELS
- signup only reads ?next=; onboarding has no ?template= support
- page-body.tsx HERO_TYPES must include any new hero-type section
- clinic consult image 1559757148-5c350d0d3c56 is an anatomical brain (wrong); corporate logos = dummyimage "Partner N" placeholders
- restaurant giant marquee clips Thai ascenders; topup orb overlaps hero copy; cafe/course/clinic heroes are the same split layout

## in progress
- (none) — direction COMPLETE 2026-10-21

## next
- builders follow docs/design/hi-end-direction.md (§8 ownership). Direction agent may be asked to review builder screenshots against §9.

## decisions so far
- new preset "obsidian" for corporate (dark, AA verified: dark min 6.55, light min 5.07); platform palette dark #07080B / coral #FF6B3D / violet #8E7DFF (AA verified)
- add fonts.accent (Latin-only: instrument-serif, fraunces, unbounded, space-grotesk) falling back to display for Thai glyphs; global --font-mono jetbrains-mono
- hero gets prop scene (default "auto" = preset signature scene) + variants scatter/cinematic; new section types curved-gallery, sticky-story, tunnel, giant-wordmark, horizontal-scroll, project-list, interlude
- verified unsplash: 1616394584738-fc6e612e71b9 facial mask (replace clinic consult brain), 1612817288484-6f916006741a skincare on stones, 1617897903246-719242758050 serum dropper, 1600334129128-685c5582fd35 hot stones, 1551024601-bec78aea704b donuts, 1558961363-fa8fdf82db35 cookies, 1501281668745-f7f57925c3b4 concert, 1550745165-9bc0b252726f retro gaming, 1445205170230-053b83016050 clothes rack
