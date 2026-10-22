# shared1 agent progress (phase 3 — shared-layer fixer)
Owner: packages/ui/**, packages/storefront/src/**, packages/core/src/theme/**, apps/web/src/app/(sites)/rw/[tenantId]/{layout,template,not-found,error}.tsx,
apps/web/src/lib/**, apps/web/src/app/(platform)/** + apps/web/src/components/platform/**, packages/templates/src/shared.ts
(+ cafe.ts / topup.ts / hotel.ts follow-ups), apps/admin onboarding (template preselect), rental-styles.tsx hotel block.

## checklist (source → item)
- [x] 1  commerce+topup: `.rw-chat` collision (testimonials chat thread vs floating LINE pill) → rename sections class; cafe.ts + topup.ts testimonials → "chat"; reset cafe + topup
     → code: sections class → `.rw-chat-thread` (_styles.tsx, client/chat-thread.tsx); cafe.ts + topup.ts testimonials "chat" — demos reset ✓
- [x] 2  commerce: mobile LINE pill must collapse after 4 s
     → code: StrictMode re-run left data-peek="true" with no timer (dev) → keep timer when still open; also collapse on first scroll. Probe: data-peek true → false, 56px after 7 s ✓
- [x] 3  commerce: hero `scatter` 1440×900 — 2-line Thai heading wraps, CTAs below the fold
     → code: hero.tsx headingFit() — forced lines (⏎) cap font-size by the longest line via container query units (clamp(step-1, 100cqi/k, step)); cafe 1440 CTA↓ 919→804, fs 92→71; verified cafe/clinic/corporate/hotel-facilities/events-venue/shop 1440+390
- [x] 4  booking+common#3: stats Odometer decimals (4.9 → "5")
     → code: stats.tsx decimalsOf() → Odometer decimals + fx=off toLocaleString with same digits
- [x] 5  booking: hero heading auto size by longest line (or headingSize) — split column 4-line wrap
     → code: same headingFit (longest-line rule); clinic keeps 4 forced lines at step-5 (CTA↓893); booking may now go back to 2 lines
- [x] 6  booking: PageIntro rw-draw-line half drawn above the fold → mount-time draw
     → code: _styles.tsx `.rw-intro > .rw-draw-line` = time-based draw on mount (.9s, .35s delay, origin left / centre)
- [x] 7  booking: FloatingObjects `count` documented
     → docs: kit3d.md FloatingObjects `count` note + JSDoc (1–14, overrides tier default)
- [x] 8  restaurant: route announcer duplicates h1 (empty document.title at commit) → titles on operational pages — WONTFIX
     → tried next.config htmlLimitedBots:/.*/ (blocking metadata) — announcer still copied the h1: Next 16's app-router renders the
       head through useDeferredValue(head, prefetchHead), so on a client navigation the page commits before the new <title> and
       AppRouterAnnouncer falls back to the h1 regardless of streaming. Reverted (next.config untouched). Not fixable from the
       tenant layout without patching Next internals; even a correct title ("ตะกร้าสินค้า · Shop") would still contain the h1
       text for substring getByText → journeys keep using getByRole("heading") (restaurant already does).
- [x] 9  restaurant: promote `--rw-night` / `--rw-night-fg` to global styles
     → code: packages/ui/src/styles/globals.css :root/--rw-night + --rw-night-fg (+ :root.dark); sections keep their identical layered copy; restaurant may switch --rr-night → --rw-night
- [x] 10 topup: CardStack3D static fan li width must scale with count → restore 8 cards in topup.ts
     → code: card-stack-3d.tsx --fan-w/--fan-step/--fan-step-h/--fan-rot by count (kit-styles.tsx); topup.ts HERO_CARDS = 8
- [x] 11 topup: hero split + card-stack orbit — outer cards clipped by canvas edges
     → code: orbit fit = min(1.25, vh/4.6, vw/8.4) (was vw/7.5 landscape, /5.2 portrait → clipped)
- [x] 12 rental: sticky-story per-step stage tone → remove hotel `[data-section="sticky-story"]` block in rental-styles.tsx
     → code: definitions stickyStory `tones: none|time-of-day` + item `tone: auto|base|soft|accent|glow|night`; kit StoryItem.tone → data-tone; sticky-story.tsx toneOf(); _styles `.rw-story-toned` rules; hotel.ts tones:"time-of-day"; rental-styles.tsx hotel block deleted; admin labels — reset hotel pending
- [x] 13 rental: interlude photo-first scrim option (dark bottom gradient + light text)
     → code: interlude `scrim: theme|photo` (photo: bottom-aligned copy, dark bottom gradient, white text, CTA shadow); hotel.ts interlude → align center + scrim photo; admin labels — reset hotel pending
- [x] 14 rental+events+platform: Thai loanword splitting in @rentweb/ui/motion/split (glue combining-mark / ์ fragments; spaces mode; U+2060)
     → code: split.ts THAI_GLUE_WORDS + thaiWordSegments() (glue list pre-split; merge fragments starting with a combining mark / ะ า ำ, a ์ cluster, a consonant-only final cluster "กต์" or a lone consonant (not ณ); honour U+2060); splitWords/tokenize `segment: "spaces"`; SplitReveal `segment` prop; new kit ThaiWrap (server) used by RevealHeading fx=off + DisplayText. Test qa/redesign/_shared1-split.ts: บีชฟรอนต์ / โฟล์ก / เวิร์กช็อป / ไอเดีย / สตูดิโอ whole
- [x] 15 events: contact map blend on dark presets
     → code: contact.tsx map → .rw-map-frame/.rw-map-tint; _styles: light grayscale + colour wash, :root.dark inverted night map + screen wash
- [x] 16 events: reduced-motion giant marquee stacks into ~2 viewports
     → code: motion-kit.css static giant marquee → step-5 (Latin) / step-4 (Thai)
- [x] 17 events: PageBody `flush` opt-out for full-bleed pages
     → code: PageBody({flush}) + exported headerOverlays(theme); sections optional
- [x] 18 events: shared.ts contactPage({variant, interests}) + aboutPage forced line break support
     → code: contactPage({variant, interests, budgets, showForm, showMap, showHours}); aboutPage lineBreak (default) via breakAfterBrand("Brand — x" → "Brand —⏎x")
- [x] 19 common#1: Preloader only on full document loads (skip next-action / RSC: 1) → line_login-journey step Z
     → code: layout docRequest gates <Preloader>: !next-action && (Sec-Fetch-Dest === "document", or Accept has text/html when no
       fetch metadata). NB Next hides rsc/next-router-state-tree from headers() and renders an action's redirect target via an
       internal fetch WITHOUT next-action, so the suggested header check alone did not work. common-logout-probe: no errors;
       line_login-journey 27/27 green.
- [x] 20 common#2: cms-fallback.tsx renders through CmsPageView
     → code: cmsFallback → <CmsPageView runtime page/>
- [x] 21 common#4: contact chips variant — long e-mail breaks mid-word
     → code: contact.tsx <Email> (wbr after @, domain nowrap) + step-1 for long addresses (chips > 18, classic > 26 chars)
- [x] 22 common#5: project-list grid-staggered meta column squeezes title on phones
     → code: project-list grid-staggered: phones stack meta (mono line) above the title; ≥ sm meta max-w 42%
- [-] 23 common#6: re-capture showcase corporate.webp — DEFERRED to the phase-3 "showcase" step (PLAN.md: shared1 → QA → shared2 →
     showcase re-captures all 10 /showcase/<key>.webp + platform-og.ts after QA); apps/web/public is not shared1-owned
- [x] 24 platform: GiantWordmark `cap` vs wide accent fonts (Unbounded overflow)
     → code: giant-wordmark-client fit solves k from the rendered font size (cap no longer blocks the fit); deps += em
- [x] 25 platform: WordCycler onChange callback (platform hero → drop MutationObserver)
     → code: WordCycler onChange(index) (0 on mount, then each tick); platform HeroCycler uses it (MutationObserver removed)
- [x] 26 PLAN/direction: admin onboarding preselects template from /signup?next=/onboarding?template=<key>
     → code: onboarding page reads ?template= (validated vs listTemplates) → wizard initialTemplate (card aria-pressed + preset preselected + scrolled into view), requireSession keeps it in next; /signup?template=<key> shorthand → next=/onboarding?template=<key>

## log
- start 2026-10-22: no predecessor file; collected items above.

- typecheck 16/16 green after code pass 1 (before resets / visual verification)
- web :3000 restarted twice (stale definitions after a next.config reload; then config revert) via cmd Start-Process (log in scratchpad)
- demos reset: cafe, topup, hotel (+ create-admin); core tests 189/189
- visual: cafe chat testimonials ✓, topup hero orbit + 8-card static fan (reduce) ✓, hotel sticky tones (soft/accent/glow/night) ✓
  + night link pill fix (--background remapped), hotel interlude photo scrim ✓ (scrim strengthened), restaurant giant marquee reduce
  (step-4, no orphan separators), events venue dark map ✓, corporate contact e-mail ✓, corporate /work 390 ✓, corporate /services
  PageIntro via cmsFallback ✓, clinic stats 4.9 ✓, probes: pill collapses (56px after 7s) ✓, onboarding preselect ✓, platform
  HUD sync via onChange ✓, platform footer wordmark fits (1377/1377) ✓
- split rules extended after a template-wide fragment scan (qa/redesign/_shared1-frag.ts): คอนโด / คอลเลกชัน / ช้อป / สปา / เทอราพิสต์ /
  แดชบอร์ด / โปรเจกต์ / เรซูเม่ / บูทีค now whole (cafe about 390 "คอน|โด" fixed)
- admin-journey 5.6 failed twice ("draft sections differ"): it edits demo-shop's home and compares JSON exactly; demo-shop was
  provisioned before the additive schema fields (sticky-story tones/tone) and the editor save normalises them → reset demo-shop
  → admin-journey 30 PASS / 1 WARN (8: fresh demo-shop has no customers yet)
- FINAL: pnpm turbo typecheck 16/16 ✓ · core tests 189/189 ✓ (provision-neutral 10/10) · journeys: line_login 27/27 ✓ (re-run after the
  last split change), commerce 46/46 ✓ (shop + cafe, after shop reset), topup 22/22 ✓, rental 12/12 ✓, admin 30 PASS + 1 WARN ✓ ·
  console sweep 6 homes × 1440/390 normal + reduced motion: 0 errors, 0 overflow

## For other agents (phase-3 shared1 additions)
- hero: forced lines (⏎) are fitted to the column (headingFit, container query units) — booking can drop clinic's 4-line workaround.
- sticky-story: `tones: "none"|"time-of-day"` + item `tone: "auto"|"base"|"soft"|"accent"|"glow"|"night"` (class .rw-story-toned).
- interlude: `scrim: "theme"|"photo"` (photo = bottom-aligned light copy on a dark gradient; hotel uses it, align center).
- contact: theme-aware map (.rw-map-frame/.rw-map-tint; dark = inverted night map + screen wash); long e-mails break only after @.
- stats: fractional values keep their decimals (4.9); topup can move ".2M+" back to value 1.2 if wanted.
- project-list grid-staggered: meta above the title on phones.
- testimonials chat thread class is now `.rw-chat-thread` (`.rw-chat` = floating LINE button only).
- templates/shared.ts: contactPage({ variant, interests, budgets, showForm, showMap, showHours }); aboutPage breaks "Brand — x" after
  the dash (lineBreak:false opts out); demos not reset in this step (clinic, salon, restaurant, course, corporate, events) pick it up
  at the final reset-all. events can switch its inline chips contact page to contactPage({variant:"chips", interests}).
- apps/web/src/components/page-body.tsx: PageBody({ flush }) + headerOverlays(theme) — events routes can drop their copy of the rule.
- --rw-night / --rw-night-fg are global (packages/ui styles) — restaurant can drop --rr-night.
- kit: ThaiWrap (server), SplitReveal `segment="spaces"`, THAI_GLUE_WORDS (add loanwords there), WordCycler onChange,
  GiantWordmark fit no longer blocked by `cap`, CardStack3D fan scales with count, static giant marquee steps down (no separators).
- tenant layout: Preloader only when Sec-Fetch-Dest=document (or Accept text/html without fetch metadata) and no next-action.
- WONTFIX: route announcer copies the h1 after client navigations (Next 16 renders the head via useDeferredValue) — use
  getByRole("heading") in journeys.
- helper scripts: qa/redesign/shared1-shots.ts (spec shots + h1/CTA/overflow/console), shared1-probe.ts (pill, announcer,
  onboarding preselect, platform HUD + wordmark), _shared1-split.ts / _shared1-frag.ts (Thai segmentation), _shared1-db.ts,
  _shared1-props.ts, _shared1-heroes.ts, _shared1-reparse.ts.

## STATUS: DONE (2026-10-22)
