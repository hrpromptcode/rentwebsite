# Packet: events_admin (back-office for @rentweb/module-events)

Status: DONE (run 3, 2026-10-18 evening). Journey 12/12 on demo-events; typecheck admin/web/module/tooling green; vitest 20/20.
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

- run 3 audit: attendees/{page,actions,attendee-actions,export/route} are COMPLETE (list, filters, search, CSV with BOM, manual check-in/undo); checkin/{page,actions}.ts(x) complete (gateCheckInAction with wrong_event pre-check, gateSnapshotAction, gateUndoAction); commerce payments.ts refHrefFor + refInfo + REF_TYPE "ticket_order" DONE (in 2e0ce3c). Admin typecheck has exactly one error: checkin/page.tsx imports ./gate which was never written.

- run 3: apps/admin events/checkin/gate.tsx written — event + session selectors (URL synced, auto-picks today's single session), 64px mono code input that auto-submits a complete 12-symbol code (140 ms) or a pasted/scanned RWT1 payload (220 ms) and on Enter, paste handler, camera via BarcodeDetector (qr_code, 280 ms poll, same-code debounce 6 s, graceful unsupported/denied copy), big tone-coloured result (green/amber/red, holder, type, session, order, time), undo-last, running count + progress + remaining, recent feed (8), 20 s polling, night-mode toggle (adds .dark on the gate root, persisted rw.gate.dark), fullscreen toggle, beep + vibrate. `pnpm --filter @rentweb/admin typecheck` GREEN (run 3).
- tooling/package.json += "@rentweb/module-events": "workspace:*" (pnpm install --offline done) so the journey can import the services.

- run 3: tooling/qa/events-admin-journey.ts written (12 steps, mirrors rental-admin-journey; tenant demo-events when present else throwaway qa-events). First runs found + fixed: (1) `eventToForm`/`EMPTY_EVENT` were exported from the "use client" event-form.tsx and called from server pages → HTTP 500 on /events/[id] and /events/new; moved to events/form-values.ts (plain module). (2) attendees CSV route 500 for events with a Thai slug: `content-disposition: filename="<thai>"` is not a ByteString → ASCII fallback in filename=, Thai kept in filename*. Journey 9/12 before these two fixes (gate, orders, approve, duplicate all green).

- run 3 (cont.): CSV route fix verified (`filename="attendees-<ascii>.csv"; filename*=UTF-8''<thai>`). Module tests no longer `import "../src/register"` (the storefront half now registers JSX sections there, which vitest cannot transform via @rentweb/storefront/render.tsx): test/helpers.ts registers the 4 "ticket_order" payment hooks directly (same as rental's tests) → `pnpm --filter @rentweb/module-events test` GREEN 20/20; module + admin typecheck GREEN. Gate: result card scrolls into view on < 768px after each scan.
- tooling/package.json gained "@rentweb/module-events": "workspace:*" (pnpm install --offline, lockfile updated).

## Results (run 3, final)
- `tooling/qa/events-admin-journey.ts` → **12/12 PASS** on tenant demo-events (nav · create event UI · session UI · 2 ticket types UI · publish · seeded slip order + /payments queue link · approve slip → 2 tickets · gate: typed auto-submit ✓, repeat → "บัตรนี้ใช้แล้ว", QR payload ✓, undo, unknown ✗ · attendees list/tabs/search/CSV/manual check-in+undo · partial refund UI → ticket refunded, order paid, payment partially_refunded, seat released · gate refuses refunded code · duplicate event). No horizontal overflow at 390/1180/1440.
- typecheck: @rentweb/admin, @rentweb/web, @rentweb/module-events, @rentweb/tooling all green. vitest module-events 20/20.
- screenshots tooling/screenshots/events-admin-{event,events,orders,order,checkin,checkin-dark,attendees}-1440.png, {events,order,checkin,attendees}-390.png, checkin-tablet-landscape.png, checkin-tablet-dark.png (1180×820).
- `tooling/smoke.ts` → ✓ all routes passed (154 lines incl. demo-events storefront routes), run after the journey.

## Left / notes for the integrator
- Throwaway tenant `qa-events` (slug) was created by journey run 1 before demo-events existed; harmless, can be deleted.
- The journey creates + deletes its own event/order on demo-events; outbox rows (ticket_order.*, ticket.checked_in) and the guest customer "คุณทดสอบ คิวเอ" remain (same as the rental journey).
- Camera scanning needs a secure context + BarcodeDetector (Chrome/Edge/Android); other browsers get the fallback copy and keep the scanner/typing path.
- Box office (admin-created orders) has a service (createTicketOrder source "admin") but no UI yet — not in this packet's build list.

## Decisions
- Client components import only from @rentweb/module-events/admin/{labels,schemas,ui}; the gate's complete-code detection uses services/ticket-codes.ts (pure, re-exported by ./admin/ui and by services/tickets.ts).
- Gate auto-submits without Enter: a 12-symbol code after 140 ms of no typing, a pasted/scanned RWT1 payload after 220 ms, Enter immediately; busyRef serialises scans; a camera hit of the same payload is ignored for 6 s. The gate refuses tickets of another event than the one selected (gateCheckInAction pre-check → reason wrong_event, GATE_EXTRA_REASON) before the idempotent service call.
- Night mode is per device (localStorage rw.gate.dark) and scoped to the gate root (`.dark` class — the admin shell has no theme switch); fullscreen uses the Fullscreen API on the gate root.
- Form value helpers (EventFormValues, EMPTY_EVENT, eventToForm) live in events/form-values.ts: anything exported from a "use client" file becomes a client reference when a server page imports it (eventToForm() crashed /events/[id] with "Attempted to call eventToForm() from the server").
- CSV content-disposition: filename= must be ASCII (Thai slugs crashed NextResponse with a ByteString TypeError); the Thai name goes in filename*.
- Module tests register the payment hooks themselves instead of importing src/register.ts (which the storefront half extended with JSX sections that vitest cannot transform).
- Refund dialog pre-selects every live ticket (full refund is the default); partial refund = clear + pick. The journey does exactly that.

## How to test
- `pnpm --filter @rentweb/admin typecheck` · `pnpm --filter @rentweb/module-events typecheck` · `pnpm --filter @rentweb/module-events test` (20 PGlite tests) · `pnpm --filter @rentweb/tooling typecheck`
- Journey (dev servers :3000/:3001 running): `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/events-admin-journey.ts [--only 1,2] [--no-shots] [--keep] [--tenant demo-events]` — uses demo-events when it has the events module, else creates/reuses qa-events; cleans up its event/order/tickets at the end. Screenshots → tooling/screenshots/events-admin-*.png.
- Manual: admin → อีเวนต์ → สร้างอีเวนต์ → add a session today + a ticket type → เผยแพร่ → buy on the storefront (or seed via createTicketOrder) → คำสั่งซื้อบัตร → อนุมัติสลิป → เช็กอินหน้างาน: type the 12-symbol code (no Enter needed) or paste the QR payload; scan again → "บัตรนี้ใช้แล้ว"; ยกเลิกเช็กอินล่าสุด; โหมดกลางคืน toggle; camera button (needs https/localhost + BarcodeDetector, Chrome/Edge/Android; Safari/Firefox show the fallback copy).
