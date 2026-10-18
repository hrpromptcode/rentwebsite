# Packet: events_core (module @rentweb/module-events foundation)

Status: IN PROGRESS (agent events_core, 2026-10-18). Successor: continue from REMAINING, keep this file updated.

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

## REMAINING
- PGlite tests test/{helpers,orders.test,checkin.test}.ts
- typecheck apps/web + apps/admin
- tooling/qa/wave3/events-api.md

## Decisions
- see events-api.md once written
