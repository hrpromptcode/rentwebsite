# Restaurant admin back-office — progress

Routes live under `apps/admin/src/app/t/[slug]/restaurant/**`, queries under `packages/modules/restaurant/src/admin/*.ts` (exported as `@rentweb/module-restaurant/admin`).
Journey script: `tooling/qa/restaurant-admin-journey.ts` (run: `MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/restaurant-admin-journey.ts`).
Helper: `tooling/qa/restaurant-admin-ids.ts` prints tenant id, table QR tokens, menu item ids.

## Inventory vs brief (2026-10-16)

| Brief item | Status | Where |
| --- | --- | --- |
| 1 Orders board (5s poll via feed route, 4 columns, cards w/ type, items+modifiers+notes, elapsed, payment badge) | DONE (code) | orders/page.tsx, board.tsx, feed/route.ts, _components/elapsed.tsx, payment-badge.tsx |
| 1 advance / cancel / approve slip / cash paid / emit rest_order.ready | DONE (code) | orders/actions.ts → admin/orders.ts advanceOrder/approveOrderPayment |
| 1 table-sessions panel + ปิดโต๊ะ/รับชำระ (cash / approve) | DONE (code) | board.tsx aside, _components/close-session-dialog.tsx, settleSession |
| 1 history tab (date filter + search) | DONE (code) | orders/history.tsx (?tab=history) |
| 2 KDS dark full-screen, station tabs, per-item done, เสร็จทั้งใบ, elapsed thresholds, new highlight + beep (muted default), 4s poll | DONE (code) | kitchen/kds.tsx, kitchen/feed/route.ts, kitchen/actions.ts |
| 3 Menus + categories CRUD w/ sort, item CRUD (all fields), soldOut/available/featured quick toggles | DONE (code) | menu/page.tsx, menu-managers.tsx, item-toggles.tsx, items/[id]/item-form.tsx |
| 3 modifier groups + modifiers CRUD | DONE (code) | menu/modifiers/* |
| 4 Tables CRUD, regenerate QR, open sessions + ปิดโต๊ะ | DONE (code) | tables/page.tsx, table-dialogs.tsx, actions.ts |
| 4 /tables/print A4 QR cards (promptpayQrDataUrl) | DONE (code) | tables/print/page.tsx |
| 5 Reservations day list, date nav, status actions, deposit approve, manual create, weekly counts | DONE (code) | reservations/* |
| Journey script tooling/qa/restaurant-admin-journey.ts | DONE — full run: 1, 1b, 2, 3, 4, 4b, 5, 6, 6b, 7, 7b, 8, 9 PASS (run 2, tooling/qa/_rest-journey2.txt); 9b (deposit-pending booking → ยืนยัน) rewritten and PASS in tooling/qa/_rest-journey4.txt. Results: tooling/qa/restaurant-admin-journey-results.json | `--only 9b` reruns a single step |
| Browser verification (screenshots 1440/390, kitchen 820) | DONE | tooling/screenshots/admin_t_demo-restaurant_restaurant_*-{desktop,mobile}.png |

## Typecheck
- `pnpm --filter @rentweb/admin --filter @rentweb/module-restaurant typecheck` → green before and after this run's changes (tooling/qa/_rest-typecheck3.log).

## Notes for a successor
- Reservations are `confirmed` immediately from both the admin dialog and the storefront form because demo-restaurant has no deposit configured; `pending` only exists while a deposit is outstanding. Step 9b inserts such a booking (depositAmount 200 THB, no payment) and confirms it through the admin (ยืนยันโดยไม่รอมัดจำ).
- `.env` has `DEV_AUTO_APPROVE_SLIPS=true`, so storefront slip uploads auto-approve; the journey emulates a production slip by setting the pickup payment to `pending_verification` + slipUrl before pressing อนุมัติสลิป.
- KDS intentionally shows no success toast (only errors); tests should wait on `aria-pressed` / the ready rail.
- Screenshots: tooling/screenshots/admin_t_demo_restaurant_restaurant_*-{desktop,mobile}.png (static pages) and tooling/screenshots/restaurant-admin-*.png (live journey: orders 1440/390, kitchen 1440/820/390, reservations 1440/390).

## FIXED (this run)
- Client components imported runtime values (STATION_LABEL, PAYMENT_*_LABEL, reservationTransitions) from `@rentweb/module-restaurant/admin`, whose index re-exports the drizzle/postgres services → every page bundling them failed with "Module not found: Can't resolve 'fs'" (orders, kitchen, item form, tables, reservations; the dev overlay then masked menu/modifiers/print too). Fix: new subpath export `@rentweb/module-restaurant/admin/labels` (pure labels + `reservationTransitions` moved into labels.ts), client files import values from it and only `import type` from `/admin`.
- reservations/page.tsx + orders/history.tsx called `todayYmd()`/`fmtTime()` from the "use client" module `_components/elapsed.tsx` → server runtime error. Pure time helpers moved to `_components/time.ts` (elapsed.tsx re-exports them).
- Menu page overflowed horizontally at 390px (category sidebar not constrained): `min-w-0` on the aside + `max-w-[100vw]` on the scrolling category nav.
- KPI grids (orders board, history, tables, reservations, menu) now 2 columns on phones instead of a full-width stack.

## REMAINING
- Nothing blocking. Nice-to-have: KpiCard labels on 390px are truncated when long (shared component) — restaurant pages now use short labels.
