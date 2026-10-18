# Packet: rental (hotel template + rental module)

Status: IN PROGRESS (continuation agent 2, 2026-10-18). Services/tests/schema done by agent 1; UI/routes/template/admin being built now.

## Plan
1. schema packages/db/src/schema/rental.ts (+ index export + migration 0007)      ✅
2. package packages/modules/rental services + tests                               ✅ (tests: 2 nested-tx bugs fixed, see below)
3. core modules registry (rental adminNav/routes/permissions) + preset "riviera"   ⏳
4. storefront section definitions (stay-search, room-grid) + module sections/components/register.ts
5. storefront routes apps/web rw/[tenantId]/{rooms,rooms/[slug],stay,stay/book,stays/[id],account/stays,api/rental}
6. admin routes apps/admin t/[slug]/rental/{bookings,bookings/[id],calendar,units,units/[id],rates,settings}
7. template packages/templates/src/hotel.ts + registrations (templates index, seed/reset-demo DEMO_NAMES, smoke ROUTES)
8. provision demo-hotel (reset-demo --template hotel + create-admin); journey tooling/qa/rental-journey.ts; screenshots; smoke

## DONE
- packages/db/src/schema/rental.ts (rental_unit_types, rental_rate_rules, rental_blocked_dates, rental_extras, rental_stays), schema/index.ts export, migration 0007 applied
- packages/core/src/payments/registry.ts: PaymentRefType += "stay"
- packages/modules/rental: package.json (exports ".", "./register", "./services", "./sections", "./components", "./ui", "./labels", "./time", "./admin", "./admin/labels", "./admin/schemas", "./admin/ui"), src/labels.ts, src/services/{time,config,catalog,pricing,availability,stays}.ts, test/{helpers,pricing.test,availability.test,stays.test}.ts
- apps/web + apps/admin package.json dependency lines (pnpm install already ran: node_modules/@rentweb/module-rental linked)
- typecheck @rentweb/module-rental green

## REMAINING
- everything in plan steps 3-8 (files listed there); update this list per milestone

## Decisions
- refType for payments: "stay"; number ST-1001…; accessKey (?k=) for guest pages
- check-out exclusive; dates stored as YYYY-MM-DD (date column, mode string); all civil-date math in services/time.ts (UTC-based)
- availability = quantity − overlapping holding stays (pending only while holdUntil > now) − blocked; pg_advisory_xact_lock per (tenant, unitType) + re-check inside createStay
- moduleConfig.rental: checkInTime, checkOutTime, freeCancelDays, depositPercent, allowFullPayment, allowPayAtProperty, maxAdvanceDays, maxNights, holdMinutes (services/config.ts, every field defaulted)
- preset key "riviera" (cream/sand/gold; heading trirong, body sarabun, display taviraj)
- section types: "stay-search" (hero + date-range search form), "room-grid" (unit types with from-price); amenities/gallery/testimonials/cta reuse core sections
- notification handlers for stay.* events are NOT added (packages/integrations is not ours); events are emitted and ignored by the outbox until a handler exists

## Known issues / notes for the successor
- test/stays.test.ts had two nested-transaction deadlocks (paymentRow()/stayRow() called INSIDE s.tx on single-connection PGlite) → tests timed out at 60 s and wedged the rest; fixed by reading the row before entering the tx.
- vitest for this module is slow (~5 min, PGlite import ~2 min); run it in the background.

## How to test
- pnpm --filter @rentweb/module-rental test
- pnpm --filter @rentweb/module-rental --filter @rentweb/web --filter @rentweb/admin typecheck
- MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/rental-journey.ts
- pnpm --filter @rentweb/tooling smoke -- demo-hotel
