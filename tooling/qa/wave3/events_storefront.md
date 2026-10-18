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
