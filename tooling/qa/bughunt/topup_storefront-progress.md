# topup_storefront QA progress (continuation run 2, 2026-10-19)

Predecessor (run 1): journey 22/22 PASS; http probe 58/10 (topup_storefront-http.out); 390 crawl (topup_storefront-crawl.jsonl) then Chromium crashed.

## Run 2 notes
- Dev servers were DOWN at start (ECONNREFUSED 3000/3001; only unrelated :3004). Started web only: `pnpm --filter @rentweb/web dev` (background, log in scratchpad web-dev.log). Admin (3001) not started.
- Node fetch() drops the Host header → use curl/http.request for host-based tenant routing.
- Service probes: tooling/qa/bughunt/topup_storefront-svc.ts (+ -svc.out). SQL helper: topup_storefront-sql.ts "<sql>". Residue: orders TP-1053..TP-1056 (demo-topup), customers 0868000001 (unblocked again), 0868000002/3; expireStalePayments probe also expired 8 stale payments of other modules.

## Run 2 checklist
- [x] Confirm + log the 10 http fails → STOREFRONT-01 (xtenant = path echo, not a leak), 02 (feed on foreign tenant), 03 (%00 → 500), 04 (limit=2.5 → 500)
- [x] 390 crawl flags: HEADCLIP = sr-only h1 (false positive); FIXEDOVERLAP = neon scanlines fx (false positive); MIDCOVERED real → STOREFRONT-10; THAICLIP feed timestamp → thaiclip phase; tap 37-43px footer links = AA ok
- [x] 1440 crawl (16 routes) + 390 reduce (6 routes): no HOVERFLOW/HIDDEN; contrast flags on sold-out tiles + masked code (crawl2.jsonl); reduce-mode OK; console only THREE/motion warnings
- [x] player-field validation → STOREFRONT-12 (Thai/emoji UID accepted and later fulfilled; 121 chars → generic message; select required works)
- [x] tier prices with satang → STOREFRONT-11
- [x] OTP: wrong → รหัสไม่ถูกต้อง; resend <60s → ขอรหัสบ่อยเกินไป กรุณารอ 59 วินาที; expired → รหัสหมดอายุ กรุณาขอรหัสใหม่ (OK); guest mobile dead CTA → STOREFRONT-19
- [x] rate limit: customer B 10 then refused (copy → STOREFRONT-17); guest cannot submit at all (OTP gate); IP dimension inert (ip null) → STOREFRONT-16
- [x] wallet: bonus preview ฿306 = credited 30600 (ledger topup+bonus) OK; wallet purchase OK; ยกเลิก no-op → STOREFRONT-13; custom amount parse → 14; frozen no notice → 15 (game page message OK)
- [x] LINE: settings.line is null on demo-topup → no LINE button on /account/login (by config, not a bug); /api/dev/line-mock → 404 on this tenant host
- [x] guest checkout contact rules → STOREFRONT-05 (merge, critical) + 07 (customer row created on refused order)
- [x] blocked customer → STOREFRONT-06; blacklisted contact via UI refused OK (Thai message, no order)
- [x] stock code: TP-1062 masked by default, 1 code sold, stock 11→10 stable after reload, no code in poll API / no-key / wrong-key page — OK
- [x] polling: TP-1063 slip → tracker 'เติมสำเร็จแล้ว' after 4.2s (PaymentPanel hard-navigates to successHref once); no manual reload needed
- [ ] Thai clipping game cards; tap targets >=44; contrast; console errors

## Findings logged (see topup_storefront.jsonl)

- STOREFRONT-08 no closed handler (never expires / cancel leaves order pending); STOREFRONT-09 payment not flagged refundRequired

## Run 2 summary (2026-10-19)
- 19 findings in topup_storefront.jsonl: critical 1 (05 guest merge), major 6 (06 blocked, 08 no closed handler, 09 refundRequired, 12 player-field validation, 13 wallet ยกเลิก no-op), minor 12 (01-04, 07, 10, 11, 14-19); 16 is suspected (platform IP).
- Scripts: topup_storefront-svc.ts (service probes, -svc.out), topup_storefront-live.ts phases visual|thaiclip|crawl2|flows|poll|wallet|frozen|otp|ratelimit (-live.out, -crawl2.jsonl), topup_storefront-sql.ts.
- Screenshots: bughunt-topup-genshin-390-bottom.png (footer hidden by sticky bar), bughunt-topup-feed-thaiclip-390x3.png (no clip), bughunt-topup-home-390-top.png, bughunt-topup-ratelimit-1440.png.
- Residue on demo-topup: orders TP-1053..TP-1075 (TP-1061 Thai-UID fulfilled, TP-1062 stock fulfilled, TP-1063 fulfilled, TP-1064 wallet, TP-1065..1074 customer B pending, TP-1075 pending), wallet 0899523004 balance 27100 (+1 pending ฿20 top-up), customers 0868000001/2/3 + 4 OTP test phones 0898xxxxxx; wallet frozen flag reverted; blocked_at reverted.
- Web dev server on :3000 was started by this run (background task) and stops when the run ends; admin :3001 was never started.
- Not covered: LINE login (tenant has settings.line = null), admin-side verification, real supplier adapters.
