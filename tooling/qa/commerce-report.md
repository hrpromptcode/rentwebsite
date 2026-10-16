# Commerce QA — round 1 (independent QA)

Date: 2026-10-16 · Tenants: demo-shop (aurora), demo-cafe (candy) · Servers: web :3000, admin :3001 (already running)

## Status (progressive — updated as work completes)

| Check | Result |
|---|---|
| `pnpm --filter @rentweb/module-commerce test` | PASS — 3 files, 23 tests (PGlite) |
| `pnpm --filter @rentweb/web typecheck` | PASS — tsc --noEmit clean |
| curl smoke `/products` (shop + cafe) | 200 |
| curl smoke `/products/linen-shirt-sand`, `/products/croissant` | 200 |
| curl `/products?q=ลินิน` | 200, "1 รายการ" (search works; SQL ilike on name/shortDescription/sku) |
| curl `/products?category=bags` | "2 รายการ" |
| curl `/products?min=1000&max=2000` | "4 รายการ" (baht → satang conversion OK) |
| curl `/api/commerce/products/search?q=ลินิน` | JSON with 1 item, no-store |
| Browser journey (Playwright) | pending |
| Screenshots desktop/mobile | pending |
| Stock decrement (DB) | pending |
| Tenant-safety code review | pending |

## Findings

(filled in below as discovered)

### CRITICAL-1 — Slip auto-approve marks the *payment* paid but the *order* stays pending/unpaid (demo-shop #1001, reproduced in browser)

- where: `apps/web/src/app/(sites)/rw/[tenantId]/api/payments/[paymentId]/slip/route.ts` (and any route handler / server action that calls `markPaid`), registration in `apps/web/src/modules.ts` imported only from `apps/web/src/app/(sites)/rw/[tenantId]/layout.tsx`
- evidence: journey step 5b. After uploading a PNG slip the PaymentPanel showed "ชำระเงินสำเร็จ" (the API returned `status: paid`), but after the panel's redirect the server-rendered order page shows status "รอชำระเงิน", timeline step 0, no PaymentPanel and no paid banner (screenshot `tooling/screenshots/qa-fail-demo-shop-5b-upload-png-slip-paid-order-confirmed.png`). DB (`tooling/qa/order-state.ts demo-shop "#1001"`): `payments.status = paid, verifiedBy = auto, slipUrl set` while `orders.status = pending, paymentStatus = unpaid, paidAt = null`; `products.soldCount` unchanged (+0) → `onOrderPaid` never ran.
- root cause: `registerPaymentHandler("order", onOrderPaid)` lives in `@rentweb/module-commerce/register`, which is imported via `import "@/modules"` **only in the tenant layout**. Next.js route handlers are a separate module graph that never evaluates the layout, so inside the slip route `paidHandlers` is empty and `markPaid()` silently skips the module handler (`packages/core/src/payments/index.ts:116-130`).
- impact: every PromptPay/slip order is a dead end for the customer (paid money, order never confirmed, stock never released to soldCount, `order.paid` event never emitted, customer stats never updated) and the admin sees a paid payment on an unpaid order. The same gap applies to `/api/payments/[paymentId]` polling and to any admin "verify slip" action that runs outside the layout graph.
- fix: import `@/modules` (side-effect) at the top of every code path that can call `markPaid`/`attachSlip`: the slip route, `apps/web/src/lib/tenant.ts` (cheapest single place since every route imports it), or register modules in `apps/web/src/instrumentation.ts` `register()` so the registry is populated for the whole server. Add a regression test that POSTs a slip through the route handler (or calls `attachSlip` with `autoApprove`) and asserts `orders.paymentStatus === "paid"`.
- also: when `payment.status === "paid"` but `order.paymentStatus !== "paid"`, the order page renders neither the panel nor a banner — consider showing "ได้รับการชำระเงินแล้ว กำลังอัปเดตคำสั่งซื้อ" rather than a silent "รอชำระ" (defensive UI).

