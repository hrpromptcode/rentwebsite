# Commerce admin back-office — progress

Successor notes: previous builder was cut off before any browser verification. This file tracks DONE / FIXED / REMAINING.

## Inventory (routes on disk vs brief)

| Brief item | Route(s) | State |
|---|---|---|
| 1. /orders list (filters, tabs, pagination 20) | orders/page.tsx | verified (browser + journey) |
| 1. /orders/[id] detail + actions (confirm/ship/complete/cancel/refund/notes/slip verify) | orders/[id]/page.tsx, order-actions.tsx, actions.ts | verified (browser + journey) |
| 1. /orders/[id]/print | orders/[id]/print/* | verified (browser + journey) |
| 1. /orders/new manual order | orders/new/* | verified (browser + journey) |
| 2. /products list (thumb, SKU, stock, bulk publish/hide) | products/page.tsx, products-table.tsx | verified (browser + journey) |
| 2. /products/new + /products/[id] form (options → variants, images, SEO) | product-form.tsx | verified (browser + journey) |
| 2. categories CRUD | products/categories/* | verified (browser + journey) |
| 3. /discounts CRUD + usage | discounts/* | verified (browser + journey) |
| 4. /shipping CRUD type-specific config | shipping/* | verified (browser + journey) |
| 5. /reviews moderation + reply + rating recompute | reviews/* | verified (browser + journey) |
| 6. /payments verification queue | payments/* | verified (browser + journey) |
| module admin services | packages/modules/commerce/src/admin/*.ts | exists |
| journey script | tooling/qa/commerce-admin-journey.ts | 43/43 PASS |

## DONE
- Typecheck green (admin + module-commerce) at start of this pass.
- Journey run #1 (tooling/qa/commerce-admin-journey.ts demo-shop): 36/41 PASS. Orders list/filters, manual order (cash+paid), detail, internal note, ship+tracking (+order.shipped event with trackingUrl/accessKey), complete, print, categories inline create, discount create, shipping create, slip queue approve (verifiedBy = user) → order paid, payments paid tab, reviews page all PASS.
- Screenshots reviewed at 1440 + 390: orders, order detail, order new, products, product new, discounts, shipping, reviews, payments. Thai copy + empty states OK.

## FIXED
- 390px horizontal overflow on /orders/[id] (418px) and /orders/new (558px): outer grid used implicit `auto` column → `grid-cols-1` (minmax(0,1fr)); product-picker rows wrap (`flex-wrap` + `basis-40`). Verified scrollWidth=390 with tooling/qa/commerce-admin-overflow.ts.
- /discounts + /shipping tables at 390px pushed status + actions off-screen: status column hidden <md (badge shown under code/name instead), shipping ลำดับ hidden <sm.
- Journey: step 5 failed only because a Next dev "Build Error" overlay from the restaurant module (client component importing @rentweb/db via @rentweb/module-restaurant/admin) covered the page at that moment — not a commerce bug; cleared later in the same run.
- Journey now also screenshots /products/[id].

- BUG orders list "0 ชิ้น" on every row: Drizzle rewrites column chunks inside sql`` *select fields* of a single-table (no join) query to bare identifiers, so the correlated subquery rendered `where "order_id" = "id"` (= order_items.id). Added `src/admin/sql.ts` → `qualified(col)` (sql.raw `"table"."col"`) and used it for the outer reference in itemCountSub, pendingSlipSub (verifyPending flag + รอตรวจสลิป tab count), products vstock/vcount/vmin/vmax and categories productCount. Verified via tooling/qa/commerce-admin-dbcheck.ts (itemCount 0 → 1).
- Product form: client-side validation failure now scrolls/focuses the first `aria-invalid` field (save bar is at the bottom, errors were out of view).
- BUG slugField regex rejected every Thai slug (vowel/tone marks are \p{M}, not \p{L}) → `^[\p{L}\p{M}\p{N}-]+$`. This blocked creating any product/category whose auto-slug contains Thai vowels.
- Journey: fills the option-set name (schema requires it, as a real user would type it).

- BUG /products/[id] crashed server-side ("Attempted to call toFormValues() from the server but toFormValues is on the client"): `toFormValues`, `EMPTY_PRODUCT`, the form VM types and slug helpers moved to `products/form-values.ts` (no "use client"); pages import from there; the form re-exports the types only.
- Storefront 404 on Thai slugs: apps/web `/products/[slug]` matches the raw (percent-encoded) path segment and every seeded slug is ASCII, so Unicode slugs are unreachable on the storefront (NOT fixable from commerce admin — storefront route is out of scope; report it). Admin `autoSlug()` is now ASCII-first (Thai-only names keep a Unicode slug; field stays editable; `normalizeSlug()` on blur keeps what the user typed).
- /discounts + /shipping at 390px: row actions stack vertically (toggle over delete) below sm, จัดการ header width only from sm, discounts ใช้แล้ว column hidden below sm (shown inline under the code), shipping name/ค่าส่ง cells allowed to wrap (shadcn TableCell is whitespace-nowrap).
- /products/[id] at 390px overflowed to 678px: form outer grid → `grid-cols-1` so the variants table scrolls inside its `overflow-x-auto` wrapper instead of widening the column.
- Journey run #4: all 18 functional steps PASS (42/43; the one FAIL was the product-detail mobile overflow fixed above).

- /products/[id] 390px overflow root cause (after grid-cols-1 did not help): Radix Switch in the variants table renders an absolutely-positioned hidden <input>; with no positioned ancestor it escaped the `overflow-x-auto` wrapper and widened the document to 678px → wrapper is now `relative`. Verified scrollWidth=390.
- /orders/new: picker defaulted to the first variant even when it was sold out, and the form still submitted (server rejected → no redirect, journey run #5 steps 2/8 failed on a QA product whose S stock hit 0). Fix: default to the first in-stock variant; submit disabled while any line exceeds stock. Journey now searches a seeded product (ปลอกหมอน, env QA_ORDER_PRODUCT) instead of "first in list".

- FINAL: journey run #6 → 43/43 PASS (18 functional steps + 25 screenshot/overflow checks at 1440 and 390). Typecheck green (admin + module-commerce).

## REMAINING / out of scope
- Storefront (apps/web) `/products/[slug]` does not decode the path segment → Unicode (Thai) product slugs 404 on the storefront. Admin works around it with ASCII-first auto slugs; a Thai-only name still produces a Thai slug that the storefront cannot serve until that route is fixed.
- Dashboard "สลิปรอตรวจ" KPI link to /payments is not allowed from this module (dashboard is shared) — /payments exists at /t/<slug>/payments.
- Each journey run adds QA rows to demo-shop (orders, a product, a coupon, a shipping method, a category); harmless but visible.

## How to test
- `pnpm --filter @rentweb/admin --filter @rentweb/module-commerce typecheck`
- `cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/commerce-admin-journey.ts demo-shop` (screenshots → tooling/screenshots/admin-commerce-*.png, results → tooling/qa/commerce-admin-journey-results.json)
- `tsx qa/commerce-admin-overflow.ts /orders/:latestOrder /orders/new /products/:latestProduct /shipping /discounts` lists elements wider than 390px.
