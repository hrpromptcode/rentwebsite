# events_storefront — progress

Packet: storefront half of the events/ticketing module (wave B). Brief: workflows/scripts/rentweb-wave3-b-wf_0788b708-98e.js → BRIEFS.events_storefront.
Core API: tooling/qa/wave3/events-api.md (read first). Admin half is built concurrently by another agent (packages/modules/events/src/admin/**, apps/admin/.../events/**) — do not touch.

## Status (2026-10-18, run 2 — run 1 was cut before writing anything)

DONE:
- (nothing yet) — reading brief + rental module reference.

REMAINING (build list, in order):
1. labels.ts additions (storefront strings), ui.ts, client.ts (buy widget, countdown, QR, ticket page client bits), actions.ts (quote/create/cancel/renew), components/, sections/ (featured-event hero, event-grid, past-highlights, organizer-intro, FAQ, CTA) + register.ts registerSection calls + storefront definitions + page-body HERO_TYPES
2. apps/web routes: /events, /events/[slug], /tickets/[orderId], /tickets/t/[code], /account/tickets, /api/events/** (ics download, qr?)
3. preset "stage" in packages/core/src/theme/presets.ts
4. packages/templates/src/events.ts + registrations (templates index, seed/reset-demo DEMO_NAMES, smoke.ts routes); provision demo-events + create-admin
5. tooling/qa/events-journey.ts; screenshots 390/1440
6. typecheck module + web; vitest; smoke; final report

## Decisions
- (to fill)

## How to test
- (to fill)

## Milestone 1 (module storefront code) — written 2026-10-18
- labels.ts extended (storefront strings), lib/ics.ts (buildIcs), components/{event-card,ticket-card,order-summary,countdown,order-actions,ticket-tools,ticket-picker}.tsx, actions.ts (createTicketOrderAction / cancelTicketOrderAction / renewTicketPaymentAction, tenant from x-tenant-id), client.ts, ui.ts, index.ts (+ics), sections/{event-hero,event-grid,event-highlights}.tsx + register.ts registerSection calls
- shared edits: packages/storefront/src/definitions/index.ts (eventHero/eventGrid/eventHighlights + SECTION_DEFS), packages/core/src/sections/index.ts category union += "events", apps/admin/src/components/editor/section-editor.tsx CATEGORY_TH/ORDER += events, apps/web/src/components/page-body.tsx HERO_TYPES += "event-hero"
- quote endpoint contract (to build): GET /api/events/quote?event=&session=&lines=typeId:qty,…&promo= → { ok, quote:{ lines, quantity, subtotal, discount, total, promo } } | { ok:false, error }
- NEXT: typecheck module → routes in apps/web

## Milestone 2 (apps/web routes) — written 2026-10-18
- apps/web/src/app/(sites)/rw/[tenantId]/events/page.tsx (tabs upcoming/past with counts, category chips, GET search), events/[slug]/page.tsx (cover, meta, countdown, description html, sessions, ticket types, map, organizer, gallery, terms, TicketPicker sticky + mobile buy bar, JSON-LD), tickets/[orderId]/page.tsx (PaymentPanel + HoldCountdown, OrderActions renew/cancel, e-tickets with QR via ticketQrDataUrl, TicketTools ics/share/print, summary), tickets/[orderId]/ics/route.ts, tickets/t/[code]/page.tsx (signed payload or code; first name only), account/tickets/page.tsx, api/events/quote/route.ts; account/page.tsx += "บัตรของฉัน" link
- past scope uses listEvents(status ["published","ended"]) because listPublicEvents pins status=published
- NEXT: typecheck web → preset "stage" → template events + registrations → provision demo-events → journey

## Milestone 3 (template + preset + demo tenant) — written 2026-10-18 (run 3)
- labels.ts += `summary` (apps/web typecheck was red on tickets/[orderId]/page.tsx L.summary) → apps/web + module typecheck green
- packages/core/src/theme/presets.ts += preset `stage` (near-black / electric lime #C8FF3D / magenta accent, Kanit display + Anuphan body, pill buttons, noise hero, marquee, cursor glow; light + dark both pass theme-presets-contrast.test.ts — 33/33)
- packages/templates/src/events.ts — "Maker Yard Bangkok" (riverside warehouse events collective, Khlong San): settings/contact/payments, moduleConfig.events (hold 20 min, guest checkout, maxPerOrder 10, check-in opens 90 min before), nav, pages home (event-hero featured + event-grid + features bento + event-highlights filmstrip + organizer imageText + testimonials + faq + cta split) / venue / about / contact / legal. Seed: 5 events — leather-workshop (+12d, 16 seats + companions), design-talk-2026 (+20/+21d, 2 sessions cap 120, general + student), riverside-live (featured, +33d, Early Bird CLOSED window with 24 left, Regular, VIP 24 with 18 sold = 6 left, บัตรหน้างาน NOT_STARTED until event day; promo RIVER10), khlong-san-night-run (+48d, Early Bird 5K SOLD OUT 30/30, 5K, 10K, VIP), maker-market-7 (ended −20d, all tickets checked_in). ~85 orders / ~230 tickets (TK-1001…), 12 customers (พิมพ์ชนก 0814440001 has orders across events), 1 pending (holds 2 regular), 1 cancelled, 1 expired, 1 refunded. Counters sold/reserved recomputed per type + session at the end of the seed. No payment rows (same as every other template).
- registrations: templates index (`events: eventsTemplate`), tooling/seed.ts + reset-demo.ts DEMO_NAMES, tooling/smoke.ts demo-events routes
- provisioned: `pnpm --filter @rentweb/tooling reset-demo -- --template events` → http://demo-events.localhost:3000 (tenant 01a14f0a-7fa3-73ff-b464-8f123cd4e418) + create-admin (admin@rentweb.local owns demo-events)
- curl check (Host header via 127.0.0.1): every route 200 without placeholders; /account/tickets 307 → login (expected); quote API 400 on bad input
- NEXT: Playwright screenshots 390/1440 + tooling/qa/events-journey.ts + smoke demo-events

## Decisions
- Template key `events`, siteType `events`, preset `stage`; organizer brand "Maker Yard Bangkok"
- Seed inserts rows directly (templates pkg has no module dependency), ticket codes generated with the same alphabet/shape as services/tickets.ts; QR payloads are signed at read time so no secret is needed in the seed
- Journey will read VIP remaining from the quote API and request remaining+1 for the overflow check (re-runs keep buying 1 VIP; reset-demo when VIP sells out)

## How to test
- `pnpm --filter @rentweb/templates typecheck` · `pnpm --filter @rentweb/core exec vitest run test/theme-presets-contrast.test.ts`
- `pnpm --filter @rentweb/tooling reset-demo -- --template events && pnpm --filter @rentweb/tooling create-admin`
- `pnpm --filter @rentweb/tooling smoke -- demo-events` · `pnpm --filter @rentweb/tooling exec tsx qa/events-journey.ts`

## Milestone 4 (journey + shared fix) — written 2026-10-18 (run 3)
- FIX services/orders.ts listCustomerOrders: `gte/lt(coalesce(...) SQL fragment, Date)` passed a bare Date to postgres-js (ERR_INVALID_ARG_TYPE → /account/tickets 500 for every customer). Now binds `${now.toISOString()}::timestamptz`. Module typecheck + 20/20 vitest still green.
- tooling/qa/events-journey.ts written (17 steps, 17/17 PASS): E1 home hero/countdown/grid/highlights · E2 /events tabs/search/empty/category · E3 event page states (closed early bird, not-started door, VIP remaining, JSON-LD) · E4 quote API (prices, RIVER10, sales_closed, sales_not_started, sold_out, max_per_order) · E5 4-step picker as guest (2 Regular + 1 VIP, per-ticket names) → pending order with hold countdown · E6 slip → paid → 3 QR tickets with holders · E7 .ics route (200 text/calendar, refused without key) · E8 /tickets/t/[code] first-name-only, no PII, typed code works, unknown 404 · E9 key/anonymous access · E10 second buyer capped at remaining (counters, API, widget) · E11 unpaid order holds 1 VIP then customer cancel releases it · E12 OTP login → /account/tickets lists + opens as owner · M1–M5 mobile 390 (home, /events, event + buy bar + picker, paid order, cancelled order; overflow 0). Results: tooling/qa/events-journey-results.md; shots tooling/screenshots/events-*.png
- Journey notes: PaymentPanel hands off to successHref ~1.2 s after a slip is approved — wait before re-navigating; the buy bar anchor is clicked through the DOM (fixed element under the cursor-glow layer); the one console 404 in the run is the deliberate unknown-code probe.

## Milestone 5 (verification) — written 2026-10-18 (run 3) — PACKET DONE
- typecheck green: @rentweb/module-events, @rentweb/templates, @rentweb/core, @rentweb/storefront, apps/web, apps/admin · vitest module 20/20 · core theme tests 33/33 (incl. preset `stage` light + dark contrast) · `smoke -- demo-events` 22/22 route checks (11 routes × desktop/mobile, no console errors, no overflow, no placeholders) · events-journey 17/17
- screenshots reviewed (tooling/screenshots/events-*.png): home-desktop/-full, home-mobile/-full, events-desktop/-mobile, event-desktop/-full/-mobile, buy-desktop-step1/2/4, buy-mobile, order-pending-desktop, order-paid-desktop/-mobile, order-cancelled-desktop, public-ticket-desktop, account-tickets-desktop — layouts, Thai copy, states and 390-px fit are right.
- KNOWN (dev-server staleness, not a code issue): the web dev server on :3000 was started before preset `stage` existed and still resolves `getPreset("stage")` → aurora fallback (`data-preset="aurora"`, cream/serif), so every storefront screenshot shows the fallback theme. Verified it is only the running process: tenant row has `{"preset":"stage"}`, the tenant config cache stores only `themeRaw`, resolveTheme runs per request, and a fresh process gives `resolveTheme({preset:"stage"})` → key stage, mode dark, primary #C8FF3D, Kanit, no warnings. A no-op edit to presets.ts did not trigger a reload. After the next restart of :3000 (and :3001 for the admin preset picker) demo-events renders near-black/lime automatically — re-take the 5 storefront screenshots then (`pnpm --filter @rentweb/tooling exec tsx qa/events-journey.ts` regenerates them).
- Nothing left in this packet. Follow-ups outside it: admin half (other agent); optional: seed payment rows for the sample paid orders if the admin payments list should show them (no template does this today).

## Files (this packet, all runs)
- module: packages/modules/events/src/{labels.ts (+summary), ui.ts, client.ts, actions.ts, index.ts, register.ts, lib/ics.ts, components/*, sections/*}, services/orders.ts (listCustomerOrders Date-binding fix only)
- web: apps/web/src/app/(sites)/rw/[tenantId]/{events/page.tsx, events/[slug]/page.tsx, tickets/[orderId]/page.tsx, tickets/[orderId]/ics/route.ts, tickets/t/[code]/page.tsx, account/tickets/page.tsx, api/events/quote/route.ts}, account/page.tsx (+link), components/page-body.tsx (HERO_TYPES)
- shared: packages/storefront/src/definitions/index.ts (event-hero/event-grid/event-highlights), packages/core/src/sections/index.ts (category events), packages/core/src/theme/presets.ts (stage), packages/templates/src/{events.ts,index.ts}, tooling/{seed.ts,reset-demo.ts,smoke.ts}, tooling/qa/events-journey.ts (+ events-journey-results.md)
