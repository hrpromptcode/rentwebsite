# QA report — topup deliverable (round 1)

Tenant: demo-topup (neon) · http://demo-topup.localhost:3000 · tenantId 01a1401c-b9af-71d6-8837-f2f2f33a2579
Scripts: tooling/qa/topup-journey.ts (Playwright journey), tooling/qa/topup-db.ts (read-only DB snapshot)
Status: IN PROGRESS — sections are appended as work completes.

## 1. Automated checks

- `pnpm --filter @rentweb/module-topup test` → 3 files, 33 tests passed (PGlite).
- `pnpm --filter @rentweb/web typecheck` → clean (exit 0).

## 2. Static review — tenant safety (packages/modules/topup/src/services + web routes)

Rule (docs/dev/MODULE-GUIDE.md §2): every DB access via tenantTx/withTenant AND every query filters `eq(table.tenantId, tenantId)`.

All service entry points take `tenantId` and all *reads* filter it (listGames, getGameBySlug, getPackage, countAvailableStock, findBlacklisted, getOrderById, getOrderByNumber, getOrderForCustomer, listCustomerOrders, recentFeed, wallet reads, listTransactions, listWalletTopups). Every insert sets `tenantId`. Row locks (`for update`) are tenant-filtered. All web routes wrap access in `tenantTx(tenantId, …)`. RLS is the backstop, so none of the gaps below leak data today, but they break the written convention:

| # | Where | Query without `tenantId` predicate |
|---|-------|------------------------------------|
| S1 | services/orders.ts:168, :182 | `update(topupOrders).set({paymentId}).where(eq(topupOrders.id, orderId))` |
| S2 | services/orders.ts:222, :228, :256, :266 | fulfilment `update(topupOrders)…where(eq(topupOrders.id, order.id))` (api/stock/manual branches) |
| S3 | services/orders.ts:359, :412 | `leftJoin(gamePackages, eq(gamePackages.id, …))`, `leftJoin(games, eq(games.id, …))` — join without `and(eq(x.tenantId, tenantId))` (listGames:51 does it right) |
| S4 | services/wallet.ts:171, :229 | `update(walletTopups)…where(eq(walletTopups.id, …))` |
| S5 | apps/web …/topup/[number]/page.tsx:38-45 | page-level `select from gamePackages innerJoin games where eq(gamePackages.id, full.packageId)` — no tenant filter on either table |

Fix (minor): add `eq(table.tenantId, tenantId)` to each `where`/`on` above (one-line each). Everything else conforms.

## 3. Static review — logic / config findings

| # | Sev | Where | Finding | Fix |
|---|-----|-------|---------|-----|
| L1 | major | packages/templates/src/topup.ts:30 → services/orders.ts createTopupOrder, games/[slug]/actions.ts | `moduleConfig.topup.otpRequiredFirstOrder: true` is read by `topupConfig()` but **never enforced**: guests can place and pay a first order with any contact string. The template copy ("สมัคร/เข้าสู่ระบบด้วยเบอร์โทร … รับ OTP ครั้งเดียว") and the config promise OTP gating; the flag is a silent no-op. | In `createTopupOrderAction` (or `createTopupOrder`): when `cfg.otpRequiredFirstOrder && !customer` return `fail("login_required")` with a Thai label such as "ครั้งแรกต้องยืนยันเบอร์โทรด้วย OTP" and link to `/account/login?next=/games/<slug>`; or drop the option from `TopupModuleConfig` + template. |
| L2 | minor | services/orders.ts:40-50, :79 | Rate limit keys on `input.customer?.id` (signed-in only) and `input.ip` (= `x-forwarded-for`, null when not behind a proxy). Guests without the header are never rate-limited, and the guest customer resolved from the contact (line 85-93) is not counted. | Resolve/upsert the guest customer *before* `countRecentOrders` and pass its id; fall back to `x-real-ip` / request socket address in `requestMeta()`. |
| L3 | minor | packages/templates/src/topup.ts:109 vs :30 | Home CTA copy "เติมครั้งแรกวันนี้ รับโบนัสกระเป๋าเงิน 5%" but `walletBonusPercent: 2` (and /wallet shows "+2%"). | Change copy to 2% or make the first-top-up bonus real. |
| L4 | minor (platform-wide) | packages/templates/src/topup.ts:27 (`autoApproveSlips: true`, same in all 6 templates) | Any image uploaded to `POST /api/payments/:id/slip` marks the payment paid → for topup this irrevocably delivers a Steam code / fires the supplier. Acceptable for the demo tenant, but a tenant provisioned from this template inherits it. | Keep auto-approve dev-only (`DEV_AUTO_APPROVE_SLIPS`) and default `autoApproveSlips: false` in templates, or at least for the topup template. |

## 4. Visual review (tooling/screenshots, neon preset)

Captured with `pnpm --filter @rentweb/tooling screenshot -- demo-topup --path <route>` (no console errors / failed requests on either route).

| Route | Desktop 1440 | Mobile 390 | Verdict |
|-------|--------------|------------|---------|
| /games | `demo-topup_games-desktop.png` | `demo-topup_games-mobile.png` | On-preset (glow cards, tilt tiles, "แนะนำ" badge, lucide icons), 6-col → 2-col grid, no overflow, readable contrast, tabs are 44px pills, search 44px. |
| /games/rov | `demo-topup_games_rov-desktop.png` | `demo-topup_games_rov-mobile.png` | Polished: blurred banner, 4 numbered step cards, sticky summary (desktop) / floating bottom bar with CTA (mobile) that clears the LINE chat bubble. Inputs 48px, package tiles ≥ 120px tall. |

Cosmetic findings (all minor):

| # | Where | Finding | Fix |
|---|-------|---------|-----|
| V1 | game-grid-client.tsx:46 (mobile) | Category tab strip is `overflow-x-auto no-scrollbar`; at 390px the 4th tab "บัตร / โค้ด" is clipped mid-word with no visual hint that the row scrolls. | Add a right-edge fade (`mask-image: linear-gradient(to right, black 85%, transparent)`) or let the pills wrap (`flex-wrap`) on `< sm`. |
| V2 | packages/templates/src/topup.ts:187 | Tier prices are `Math.round(price * 0.98/0.95)` in satang → hints like "ตัวแทน ฿33.25", "฿94.05", "฿189.05" look unlike real Thai price lists. | Round tier prices to whole baht in the seed (`Math.round(price * 0.95 / 100) * 100`). |
| V3 | topup-form.tsx:113 vs :165-168 | Step-2 subtitle says "สมัครสมาชิก VIP เพื่อรับราคาถูกกว่า" while the per-package hint shows the cheapest tier, which is "ตัวแทน" (agent). | Show the VIP tier in the hint for guests/members (`pkg.tierPrices.vip`) or word the subtitle "ราคาสมาชิก/ตัวแทนถูกกว่า". |

## 5. Browser journey (tooling/qa/topup-journey.ts, Playwright Chromium)

Run 1 (partial, selector bug in step 2a fixed afterwards):
- 1a–1c PASS: 8 tiles, min-price chips, 0 broken images; search by name/publisher + empty state; tabs บัตร/โค้ด=2, PC=1, มือถือ=5, ทั้งหมด=8; `?cat=voucher&q=steam` deep link.
- 3a–3c PASS: Steam ฿100 shows "เหลือ 4 โค้ด" = `/api/topup/stock/<id>`; PromptPay order TP-1003 → slip → code masked `STEAM-••••-••••-K8HL`, reveal gives a well-formed code, serial SW100-002, stock 4→3 in UI + API; poll API carries no code; Roblox (empty stock) packages disabled + CTA disabled.

