# Top-up admin back-office — progress

Routes live under `apps/admin/src/app/t/[slug]/topup/**`, queries under `packages/modules/topup/src/admin/*.ts`
(exported as `@rentweb/module-topup/admin`, client-safe parts as `./admin/labels`, `./admin/schemas`, `./admin/ui`).
Journey script: `tooling/qa/topup-admin-journey.ts` (run from repo root: `MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-admin-journey.ts`).
DB peek (read-only): `tooling/qa/topup-admin-db.ts`.

## Plan (brief → files)

| Brief item | Status | Where |
| --- | --- | --- |
| 1 /topup/orders queue (tabs, search, pagination, batch fulfil) | written, typechecks, NOT yet browser-verified | orders/page.tsx, orders-table.tsx, actions.ts → admin/orders.ts |
| 1 /topup/orders/[id] (player fields + copy, cost/profit, slip approve/reject, risk, timeline, fulfil / fail / retry / note) | written, typechecks, NOT yet browser-verified | orders/[id]/page.tsx, order-actions.tsx |
| 2 /topup/games list + new + [id] (game form, fields editor, uploads, packages inline, stock panel) | written, typechecks, NOT yet browser-verified | games/{page,actions,form-values,game-form}.tsx, games/new, games/[id]/{page,packages-manager,stock-panel}.tsx (tabs ?tab=packages|stock|info, ?stock=<pkgId>) |
| 3 /topup/wallets list + [id] (ledger, adjust, freeze) | written, typechecks, NOT yet browser-verified | wallets/{page,actions}.tsx, wallets/[id]/{page,wallet-actions}.tsx (requestKey per dialog open → idempotency) |
| 4 /topup/suppliers CRUD + /topup/blacklist CRUD | written, typechecks, NOT yet browser-verified | suppliers/{page,actions,supplier-dialog}.tsx, blacklist/{page,actions,blacklist-form}.tsx (blacklist reached via tabs on suppliers page; no nav entry in core) |
| journey script | TODO | tooling/qa/topup-admin-journey.ts |

## DONE
- admin layer (orders, catalog, wallets, suppliers, labels, schemas, ui/*) — reviewed by successor (run 2):
  - fixed correlated subquery in getAdminGame (qualified() from admin/sql.ts — lesson b)
  - wallets list uses inArray instead of raw `in ${ids}`
  - game slug regex now accepts Thai (\p{Lo}\p{M})
  - adminRetryOrder keeps internal notes (fulfilment strategies overwrite supplier_response)
  - adminFailOrder refuses (instead of 500) when the wallet to refund is frozen
- all pages written; `pnpm --filter @rentweb/admin --filter @rentweb/module-topup typecheck` green

## REMAINING
- see table

## Notes for a successor
- demo-topup tenant id 01a1401c-b9af-71d6-8837-f2f2f33a2579; `moduleConfig.topup.otpRequiredFirstOrder=true` → storefront needs OTP login (dev code shown on page) before ordering.
- `.env` has `DEV_AUTO_APPROVE_SLIPS=true` → storefront slip uploads auto-approve (manual packages land in `processing` immediately).
- rov "120 คูปอง" / "500 คูปอง" are manual-fulfilment packages; steam-wallet packages are stock; rov 40/240/1200 are api (simulated).
- Admin uploads (proof / game images) go through `_shared.ts storeImage` → absolute admin URL (http://localhost:3001/uploads/...).
