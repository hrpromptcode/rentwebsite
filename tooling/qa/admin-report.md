# Admin deliverable — independent QA report (round 1)

_Status: IN PROGRESS — written progressively; sections fill in as steps complete._

Environment: Windows 11, Next.js 16 dev servers (storefront :3000, admin :3001), Neon Postgres, Playwright Chromium 1.64.1.
Credentials used: `admin@rentweb.local` (superadmin, owner of the 7 demo tenants) plus one throw-away signup user created in step 10.

## 1. Automated browser journey (`tooling/qa/admin-journey.ts`)

Run with: `MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/admin-journey.ts`

Results: _pending_

## 2. Typecheck / tests

| Command | Result |
| --- | --- |
| `pnpm --filter @rentweb/admin typecheck` | PASS (tsc --noEmit, 0 errors) |
| `pnpm --filter @rentweb/module-commerce test` | PASS — 3 files, 23 tests, 9.96s (vitest 5.0.4 on PGlite) |

## 3. Visual review (desktop 1440 + mobile 390 screenshots)

_pending_

## 4. Tenant-safety audit of module services

Method: every `.where(` / `.insert(` / raw `sql` in `packages/modules/*/src/services/*.ts` was scanned for a `tenantId` filter within a 4-line window (`tooling/qa` awk pass), each hit was read in context, and RLS was verified on the live Neon database with `tooling/qa/rls-check.ts`.

**Transaction scoping.** All admin reads/writes of tenant content go through `tenantTx()` → `withTenant(getDb(), tenantId, …)` (`apps/admin/src/lib/tenant.ts:75`), which runs `set_config('app.tenant_id', …, true)` + `SET LOCAL ROLE app_user`. Live DB: 81 tables, 73 with `tenant_id`, **63 of those have RLS enabled + a policy**; role `app_user` has `rolbypassrls=false, rolsuper=false`. The 10 tenant-scoped tables without RLS (`audit_logs, events_outbox, invoices, notifications, subscriptions, tenant_domains, tenant_invitations, tenant_members, tenant_modules, tenant_usage`) are platform tables that the admin app only touches via `getAdminDb()` with an explicit `eq(table.tenantId, ctx.tenant.id)` (checked: `dashboard/queries.ts:217-220`, `settings/actions.ts` addDomain/removeDomain/revokeInvitation/loadMember/countOwners, `settings/domains/page.tsx`, `settings/team/page.tsx`).

**Module services — every primary lookup filters by tenantId** (listServices/listStaff/listClinicPackages/listProducts/getProductBySlug/findActiveCart/listCustomerBookings all build `conds = [eq(t.tenantId, tenantId), …]`). The scan flagged 20 `.where()` clauses without a visible tenantId; all are *secondary* writes keyed by the primary key of a row that was fetched under a tenant filter in the same transaction, so they are safe under RLS but deviate from the MODULE-GUIDE rule "every query still filters eq(table.tenantId)":

| File:line | Statement | Why it is currently safe |
| --- | --- | --- |
| `commerce/src/services/cart.ts:144` | `update(carts)…where(eq(carts.id, existing.id))` | `existing` from `findActiveCart(tx, tenantId, …)` |
| `commerce/src/services/cart.ts:209,226,235` | `update/delete(cartItems)…where(eq(cartItems.id, existing.id))` | `existing` fetched with `eq(cartItems.tenantId, tenantId)` |
| `commerce/src/services/orders.ts:193-195,363-365` | stock `update(productVariants/products)…where(eq(id, line.variantId/productId))` | ids come from tenant-scoped cart lines / order items; RLS blocks foreign rows |
| `commerce/src/services/orders.ts:221-224` | `update(orders)…where(eq(orders.id, orderId))` | `orderId` was just inserted with `tenantId` |
| `booking/src/services/clinic.ts:56,198,207,210,228` | `update(patients/patientPackages)`, `select(clinicPackages)` by id | rows (`byPhone`, `pp`) fetched with tenantId |
| `restaurant/src/services/orders.ts:150`, `reservations.ts:136` | `update(...).set({ paymentId })…where(eq(id, order!.id))` | row inserted with tenantId moments before |
| `topup/src/services/orders.ts:222,227` | `update(topupOrders)…where(eq(topupOrders.id, order.id))` | `getOrderById(tx, tenantId, …)` guarded |

Raw SQL: `topup/orders.ts:236` (`code_stock … where tenant_id = ${tenantId} … for update skip locked`) and `booking/bookings.ts:115` (`select … for update` on a tenant-fetched service) are scoped. No `getAdminDb()` usage inside module services. No insert without `tenantId`.

Verdict: **no cross-tenant data path found**; the items above are Minor convention deviations (defense-in-depth only).

## 5. Findings

_pending_
