# QA report — restaurant deliverable (round 1)

Tenant: `demo-restaurant` (preset **ember**), tenant id `01a14020-1268-741c-8c59-82ec1eb9fae2`.
Scope: `packages/modules/restaurant/**`, `apps/web/src/app/(sites)/rw/[tenantId]/{menu,t,order,orders/r,reserve,reservations,api/restaurant}/**`, `packages/templates/src/restaurant.ts`.
Scripts: `tooling/qa/restaurant-journey.ts` (Playwright, 390px), `tooling/qa/restaurant-tables.ts` (lists QR tokens).

_Status: in progress — sections are appended as they complete._

## 1. Automated checks

| Check | Result |
|---|---|
| `pnpm --filter @rentweb/module-restaurant test` | **PASS** — 3 files, 20 tests (cart, orders, reservations on PGlite), 6.8s |
| `pnpm --filter @rentweb/web typecheck` | **PASS** — `tsc --noEmit` exit 0 |

## 2. Tenant-safety audit (static read of `packages/modules/restaurant/src/services/*.ts`)

Every page / route handler / server action wraps DB work in `tenantTx(tenantId, …)` (= `withTenant`, which sets `app.tenant_id` + `SET LOCAL ROLE app_user`, so RLS is the hard floor). Inside the services:

- **Selects**: all filtered by `eq(table.tenantId, tenantId)` — `menu.ts`, `cart.ts`, `tables.ts`, `orders.ts`, `reservations.ts` (checked each `select`).
- **Inserts**: all set `tenantId` (orders, order items, sessions, reservations, payments via `createPayment`).
- **Payment handlers** (`onRestaurantOrderPaid`, `onReservationPaid`) take `tenantId` from the payment row and filter by it.
- **Minor deviations from the "every query still filters tenantId" rule** (safe today because the row id was just fetched/inserted inside the same tenant-scoped tx and RLS applies; still worth tightening):
  - `services/orders.ts:150` `update(restaurantOrders).set({paymentId}).where(eq(id))`, `:180`, `:192` (`tableSessions`), `:210`
  - `services/reservations.ts:136`, `:154`, `:163` (`update(reservations).where(eq(id))`)
  - `services/tables.ts:53` token-clash check `where(eq(tableSessions.token, token))` has no tenant filter **by design** (global unique index) — but under `app_user` RLS it can only see the current tenant's rows, so a cross-tenant 6-char collision would surface as a unique-index exception instead of a retry. Low probability; note only.
- Runtime isolation is verified in journey step 5.3 (another tenant host → 404 for order / session / table / availability).

## 3. Browser journey (Playwright, demo-restaurant, 390×844)

_pending_

## 4. Visual review (desktop 1440 + mobile 390 screenshots)

_pending_

## 5. Findings

_pending_
