# Top-up admin back-office — progress

Routes live under `apps/admin/src/app/t/[slug]/topup/**`, queries under `packages/modules/topup/src/admin/*.ts`
(exported as `@rentweb/module-topup/admin`, client-safe parts as `./admin/labels`, `./admin/schemas`, `./admin/ui`).
Journey script: `tooling/qa/topup-admin-journey.ts` (run: `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/topup-admin-journey.ts`).

## Plan (brief → files)

| Brief item | Status | Where |
| --- | --- | --- |
| 1 /topup/orders queue (tabs, search, pagination, batch fulfil) | TODO | orders/page.tsx, orders-table.tsx, actions.ts → admin/orders.ts |
| 1 /topup/orders/[id] (player fields + copy, cost/profit, slip approve/reject, risk, timeline, fulfil / fail / retry / note) | TODO | orders/[id]/page.tsx, order-actions.tsx |
| 2 /topup/games list + new + [id] (game form, fields editor, uploads, packages inline, stock panel) | TODO | games/** → admin/catalog.ts |
| 3 /topup/wallets list + [id] (ledger, adjust, freeze) | TODO | wallets/** → admin/wallets.ts |
| 4 /topup/suppliers CRUD + /topup/blacklist CRUD | TODO | suppliers/**, blacklist/** → admin/suppliers.ts |
| journey script | TODO | tooling/qa/topup-admin-journey.ts |

## DONE
- (nothing yet — context read: MODULE-GUIDE, admin lib/tenant, customers CRUD pattern, commerce/restaurant admin patterns, topup services)

## REMAINING
- everything above

## Notes for a successor
- demo-topup tenant id 01a1401c-b9af-71d6-8837-f2f2f33a2579; `moduleConfig.topup.otpRequiredFirstOrder=true` → storefront needs OTP login (dev code shown on page) before ordering.
- `.env` has `DEV_AUTO_APPROVE_SLIPS=true` → storefront slip uploads auto-approve (manual packages land in `processing` immediately).
- rov "120 คูปอง" / "500 คูปอง" are manual-fulfilment packages; steam-wallet packages are stock; rov 40/240/1200 are api (simulated).
