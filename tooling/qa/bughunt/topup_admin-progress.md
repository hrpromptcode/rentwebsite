# topup_admin bughunt — progress

Scope: back-office /t/demo-topup/topup/** (1440 + 390), shared /payments for topup/wallet_topup, roles, dashboard KPIs, empty tenant.
Log: tooling/qa/bughunt/topup_admin.jsonl (one JSON line per finding, ids ADMIN-xx)
Scripts: topup_admin-lib.ts (helpers), topup_admin-db.ts (db probes), topup_admin-probes.ts (--only setup,p1,...), fixture topup_admin-fixture.json

## Status
- [x] read module + admin app sources (static review) — run 1
- [x] rerun tooling/qa/topup-admin-journey.ts — run 1: 17/18, step 17 (390px) crashed Chromium → redone in p8
- [x] setup fixture (customer + wallet + orders O1..O3)
- [x] p1 proof upload sniffing (SVG / HTML renamed .png)
- [x] p2 fail unpaid order → late slip auto-approve (money w/o fulfilment)
- [x] p3 cancel = raw UPDATE payments; reject/approve on terminal payment
- [x] p4 stock: duplicate import across batches; delete package/game cascades unsold codes
- [x] p5 freeze blocks storefront spending
- [x] p6 shared /payments queue filters + links (topup, wallet_topup)
- [x] p7 dashboard KPIs vs DB vs module header
- [x] p8 390px overflow + dialogs + tab strips — no page overflow on 12 pages; dialogs fulfill 555/fail 296/wallet-adjust 487/supplier 646 px fit 844; stock-import is inline (button disabled until paste, script click timed out = not a bug)
- [x] p9 fresh topup tenant empty states
- [x] p10 roles (staff) server-side
- [x] static: no closed handler for topup/wallet_topup (paymentHookSummary) → logged as services finding

## Notes
- dashboard 13 vs DB 14 rows (p7): other QA agents create orders concurrently (TP-1061..1063 appeared during the run) — not a bug; ADMIN-10 is about the status-filter mismatch only.
- 01:05–01:12 admin :3001 was NOT running (only web :3000, started 00:53; :3004 is an unrelated project). No admin process existed, so this QA run started `pnpm dev` in apps/admin itself at ~01:13 (log: scratchpad/admin-dev.log). It was not a restart of a running server.
- ADMIN-02..07 logged from code first (file:line); topup_admin-probes.ts upserts the same ids with dynamic evidence once the admin is reachable.
- admin@rentweb.local is owner member of demo-topup (not impersonating)
- payments for tenant: topup paid 41 / pending_verification 1 (expired 2026-10-16) / refunded 6; wallet_topup paid 4

## Coverage summary (run 2, 2026-10-19 01:05–01:30)
- Findings on disk: ADMIN-01..07, 09, 10, 12..17 (15 rows; ADMIN-08 and ADMIN-11 were conditional probes that did NOT fire: freeze blocks spending correctly, staff role is enforced).
- Dynamic: p1 upload sniff (3 bogus files accepted; URLs 404 on admin host), p2 fail-unpaid → late slip paid (critical), p3 cancel raw UPDATE + reject 500, p4 duplicate import + delete cascade (2→0 codes), p5 freeze (OK, storefront message correct; /wallet no notice), p6 payments queue (topup links OK; wallet_topup → list), p7 dashboard vs module KPIs, p8 390px (12 pages, 4 dialogs, no overflow), p9 fresh tenant qa-topup-empty-5huc8 (all admin pages 200 w/ empty states), p10 staff role.
- Not done / out of scope: CSV/print (no such feature exists in /topup pages — grep found no export), supplier config secrets echo (saveSupplierAction rejects secret-looking keys; edit form pre-fills the JSON it stored — by design since secrets are refused), viewer role (not exercised; same assertRole path), re-approve already-paid payment (adminApproveSlip returns 'ชำระเงินแล้ว' by code L417).
- Test data left behind: customer 0869609875 (wallet ฿802), orders TP-1057 (failed+paid!), TP-1058 (cancelled), TP-1059/1060 (processing), voided QA-DUP codes, tenant qa-topup-empty-5huc8, staff membership for qa-am-staff@rentweb.test on demo-topup.
- Admin dev server started by this run (background, pid of `pnpm dev` in apps/admin) will stop when the session ends.
