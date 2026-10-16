# Top-up admin back-office — progress

Routes live under `apps/admin/src/app/t/[slug]/topup/**`, queries under `packages/modules/topup/src/admin/*.ts`
(exported as `@rentweb/module-topup/admin`, client-safe parts as `./admin/labels`, `./admin/schemas`, `./admin/ui`).
Journey script: `tooling/qa/topup-admin-journey.ts` (run from repo root: `MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-admin-journey.ts`).
DB peek (read-only): `tooling/qa/topup-admin-db.ts`.

## Plan (brief → files)

| Brief item | Status | Where |
| --- | --- | --- |
| 1 /topup/orders queue (tabs, search, pagination, batch fulfil) | DONE — browser-verified (journey + 1440/390 shots) | orders/page.tsx, orders-table.tsx, actions.ts → admin/orders.ts |
| 1 /topup/orders/[id] (player fields + copy, cost/profit, slip approve/reject, risk, timeline, fulfil / fail / retry / note) | DONE — browser-verified (journey + 1440/390 shots) | orders/[id]/page.tsx, order-actions.tsx |
| 2 /topup/games list + new + [id] (game form, fields editor, uploads, packages inline, stock panel) | DONE — browser-verified (journey + 1440/390 shots) | games/{page,actions,form-values,game-form}.tsx, games/new, games/[id]/{page,packages-manager,stock-panel}.tsx (tabs ?tab=packages|stock|info, ?stock=<pkgId>) |
| 3 /topup/wallets list + [id] (ledger, adjust, freeze) | DONE — browser-verified (journey + 1440/390 shots) | wallets/{page,actions}.tsx, wallets/[id]/{page,wallet-actions}.tsx (requestKey per dialog open → idempotency) |
| 4 /topup/suppliers CRUD + /topup/blacklist CRUD | DONE — browser-verified (journey + 1440/390 shots) | suppliers/{page,actions,supplier-dialog}.tsx, blacklist/{page,actions,blacklist-form}.tsx (blacklist reached via tabs on suppliers page; no nav entry in core) |
| journey script | DONE — 18/18 PASS (run 3, final run 19:00) | tooling/qa/topup-admin-journey.ts |

## DONE
- admin layer (orders, catalog, wallets, suppliers, labels, schemas, ui/*) — reviewed by successor (run 2):
  - fixed correlated subquery in getAdminGame (qualified() from admin/sql.ts — lesson b)
  - wallets list uses inArray instead of raw `in ${ids}`
  - game slug regex now accepts Thai (\p{Lo}\p{M})
  - adminRetryOrder keeps internal notes (fulfilment strategies overwrite supplier_response)
  - adminFailOrder refuses (instead of 500) when the wallet to refund is frozen
- all pages written; `pnpm --filter @rentweb/admin --filter @rentweb/module-topup typecheck` green

## STATUS: COMPLETE (run 3)
Nothing required by the brief is left. Optional polish ideas: blacklist has no nav entry of its own (reached via tabs on /topup/suppliers — core nav not ours to edit).

## Run 3 log
- run 3 (successor #3): full journey ran 17/18 PASS on first try (all actions work in the browser, no 5xx/page errors).
- DONE run 3: game info tab overflow at 390 fixed (field-row + package-row grids were auto tracks → truncate text widened them; now grid-cols-1); order detail wait copy fixed; journey shot() scrolls to top, step 9 waits via CSS locator (aria-hidden while dialog open made getByRole pass early), step 10 asserts payment paid
- DONE run 3: journey 18/18 PASS after fixes
- DONE run 3: reviewed all 1440/390 screenshots. Fixes: orders table at 390 (price + payment method folded into game cell, game cell wraps; price column sm+), status badge shows รอเติม for manual+processing (TopupStatusBadge fulfillment prop, matches tabs), KPI cards tighter on phone + shorter labels, form grids items-start (hint no longer misaligns neighbours), "~N นาที" → "ประมาณ N นาที"
- DONE run 3: orders table relative times now formatted on the server (placedRel/paidRel) — Date.now() in the client table caused an intermittent hydration mismatch at minute boundaries; journey logs the path with page errors
- DONE run 3: `pnpm --filter @rentweb/admin --filter @rentweb/module-topup typecheck` green; final journey 18/18 PASS, 10 phone pages without overflow, no 5xx/page errors; journey now also shoots wallets-1440, games-new-1440, game-info-1440 and asserts slip approve → payment paid

## Notes for a successor
- demo-topup tenant id 01a1401c-b9af-71d6-8837-f2f2f33a2579; `moduleConfig.topup.otpRequiredFirstOrder=true` → storefront needs OTP login (dev code shown on page) before ordering.
- `.env` has `DEV_AUTO_APPROVE_SLIPS=true` → storefront slip uploads auto-approve (manual packages land in `processing` immediately).
- rov "120 คูปอง" / "500 คูปอง" are manual-fulfilment packages; steam-wallet packages are stock; rov 40/240/1200 are api (simulated).
- Admin uploads (proof / game images) go through `_shared.ts storeImage` → absolute admin URL (http://localhost:3001/uploads/...).
