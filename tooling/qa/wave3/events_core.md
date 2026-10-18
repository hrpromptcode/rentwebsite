# Packet: events_core (module @rentweb/module-events foundation)

Status: DONE (agent events_core, 2026-10-18). Storefront / admin agents build on tooling/qa/wave3/events-api.md.

## Plan
1. schema packages/db/src/schema/events.ts + index export + migration (lock tooling/qa/wave3/.migrate-lock)
2. package packages/modules/events scaffold (exports mirror rental) with placeholder index files
3. services: time, config, catalog, orders, tickets, checkin, refunds (+ lib/sanitize copied from commerce)
4. register.ts: payment hooks paid/closed/target/access for refType "ticket_order"; registry.ts refType union
5. module entry packages/core/src/modules/index.ts (adminNav /events, /events/orders, /events/checkin, /events/attendees)
6. apps/web + apps/admin deps + transpilePackages + modules.ts import; pnpm install once
7. PGlite tests (races, sales window, min/max, paid issues tickets, check-in idempotency, refund, expiry)
8. typecheck module + web + admin; tooling/qa/wave3/events-api.md

## DONE
- schema packages/db/src/schema/events.ts (events, event_sessions, ticket_types, event_promo_codes, ticket_orders, tickets) + export in schema/index.ts; migration packages/db/drizzle/0009_same_madame_hydra.sql generated + applied (lock taken/released)
- packages/modules/events scaffold (package.json exports mirror rental + "./time"; placeholder client/actions/sections/components/admin files; lib/sanitize.ts copied from commerce)
- services: time, config, catalog-schemas (zod), catalog (reads + admin CRUD + promo codes), tickets (codes, HMAC QR payload, issue/void, attendee list), orders (quote, createTicketOrder with session+type advisory locks + re-quote, renew, cancelUnpaid, releaseLapsedHolds, payment hooks, customer/admin reads), checkin (idempotent checkInByCode with reasons, stats, undo), refunds (refundTicketOrder full/partial by ticket)
- register.ts payment hooks for refType "ticket_order"; packages/core/src/payments/registry.ts PaymentRefType += "ticket_order"
- packages/core/src/modules/index.ts events entry: adminNav /events, /events/orders, /events/checkin, /events/attendees; storefrontRoutes ["/events", "/tickets"]; permissions events.manage/write/orders.write/checkin/refund/settings.write
- apps/web + apps/admin: package.json dep, next.config transpilePackages, src/modules.ts import; pnpm install done (module linked, qrcode dep)
- typecheck @rentweb/module-events green

- test files test/{helpers,orders.test,checkin.test}.ts written (committed in aa9a1b0): races, sales window, min/max, paid issues unique signed codes, capacity, cancel, expiry sweep + revive, late-pay refundRequired, free orders, guest-off, renew + releaseLapsedHolds, lists/stats; check-in idempotency + every reason, stats/feed/attendees, partial + full refund, free refund
- typecheck apps/web + apps/admin green (previous run)

- vitest GREEN 2026-10-18: 2 files, 20 tests (`pnpm --filter @rentweb/module-events test`, ~2 s with PGlite). Fixes made while greening: catalog.buildDetail session.soldOut (capacity reached now counts as sold out even when some types are closed/not started); two test expectations (S1 session counters include the Early Bird winner's hold; expired-event count scoped to the order because expireStalePayments sweeps every due payment)

- tooling/qa/wave3/events-api.md written: every exported service function/type, events emitted, registry entry, flows, gotchas
- final typecheck 2026-10-18: `pnpm turbo run typecheck --filter=@rentweb/module-events --filter=@rentweb/web --filter=@rentweb/admin` → 15/15 successful (module-events, web, admin re-executed after the catalog fix)

## REMAINING
- nothing in this packet. Not covered here (other packets): storefront routes/sections/components/actions, admin pages under apps/admin/src/app/t/[slug]/events/**, template + demo seed, journeys, smoke, screenshots. Uncommitted in the working tree: src/services/catalog.ts (soldOut fix), test/orders.test.ts (2 expectations), tooling/qa/wave3/{events_core,events-api}.md.

## How to test
- `pnpm --filter @rentweb/module-events test` (PGlite, ~2 s, 20 tests) · `pnpm --filter @rentweb/module-events typecheck`
- seed for route tests: `seedEvents()` in packages/modules/events/test/helpers.ts ("Jazz Night": S1 7 Nov uncapped, S2 8 Nov cap 3; 8 ticket types; promo JAZZ10)

## Decisions
- see tooling/qa/wave3/events-api.md §14 (capacity on top of type quantities, lock order session→types, soldOut semantics, sweep + late-payment revive, hidden types orderable by id, per-ticket price includes promo share)
