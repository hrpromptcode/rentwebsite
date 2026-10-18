# Packet: events_admin (back-office for @rentweb/module-events)

Status: IN PROGRESS (run 2 started 2026-10-18; run 1 produced nothing beyond core placeholders).
Brief: BRIEFS.events_admin in the wave3-b workflow script; core contract tooling/qa/wave3/events-api.md.

## Plan
1. study admin conventions (rental admin routes, tenant.ts, commerce payments refHrefFor, rental-admin-journey)
2. packages/modules/events/src/admin: labels (admin copy), schemas, ui (client-safe helpers), queries (KPIs)
3. apps/admin/src/app/t/[slug]/events: list + new + [id] (event form, sessions, ticket types, publish/cancel, duplicate)
4. /events/orders (tabs, search, detail: payment card approve/reject/cash, refund full/partial, resend, void ticket)
5. /events/attendees (per event/session, search, status filter, CSV, manual check-in/undo)
6. /events/checkin (door mode, scanner input, BarcodeDetector camera, session selector, running count)
7. commerce admin payments refHrefFor "ticket_order" → /events/orders/[id]
8. tooling/qa/events-admin-journey.ts; typecheck module+admin; vitest; screenshots 390/1440

## DONE
- module admin layer packages/modules/events/src/admin: labels.ts (scopes/tabs/presets/GATE copy), schemas.ts (FormResult, fieldErrors, baht helpers, refund/holder/reason/gate schemas), config.ts (loadEventsModuleConfig from tenant_modules), stats.ts (listEventsAdmin + aggregates, eventScopeCounts, eventsKpis, eventLiveSummary, orderTabCounts, listEventOptions, listGateEvents), mutations.ts (approve/reject/cash payment, voidTicket, manualCheckIn, resendTickets → outbox ticket_order.resend, duplicateEvent), ui/{inputs,nav,index} (MoneyInput, NativeSelect, BkkDateTimeInput, SlipPreview, GalleryField, StatusPill, ReasonPicker, FilterTabs, Pagination, qs)
- services/ticket-codes.ts: pure code helpers extracted from tickets.ts (re-exported there, API unchanged) so the gate client can detect complete codes

- apps/admin events routes written (typecheck pending at time of writing): _lib.ts, actions.ts (event CRUD/status/duplicate/upload/sessions/ticket types), page.tsx (list + KPIs + scopes), event-form.tsx, new/page.tsx, [id]/{page,event-actions,sessions-editor,ticket-types-editor}.tsx, orders/{page,actions}.ts(x), orders/[id]/{page,order-panels}.tsx (payment card approve/reject/cash, refund dialog per ticket, tickets card with QR + void + holder edit, notes, resend)

## REMAINING
- attendees (page, actions, row actions, CSV export route), checkin (page, actions, gate client with scanner input + BarcodeDetector camera)
- commerce payments.ts refHrefFor + REF_TYPE label for ticket_order
- typecheck admin, vitest module, journey tooling/qa/events-admin-journey.ts, screenshots 390/1440

## Decisions
- (tbd)

## How to test
- (tbd)
