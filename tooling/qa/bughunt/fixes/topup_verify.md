# Top-up shop — final verification (2026-10-19)

Verifier: final verifier for the top-up shop (owns the whole top-up area for regressions found here).
Input: packets topup_{services,storefront,admin,review}.md, payments-api.md, findings tooling/qa/bughunt/topup_{services,storefront,admin}.jsonl.
Rows are written as each item is settled (successor: skip rows already present).

Dev servers at start: web :3000 200, admin :3001 200 (orchestrator's, not restarted).

## 1. Journeys

| Run | Result | Notes |
|---|---|---|
| topup-journey.ts run 1 | 19/22 | FAIL 1b: empty-state copy changed (now "ไม่พบเกม “zzzz” ลองคำอื่นหรือเปลี่ยนหมวด" + "ดูเกมทั้งหมด" reset) → intended copy change; 1c: cascade of 1b (search box left at "zzzz"); 3b: asserted a seed `STEAM-…` code + `SW100-` serial, but the ฿100 stock is FIFO and the seed codes are sold out — the next codes are the ones topup-admin-journey imports (`QA-STEAM-<run>-000n`, no serial) → test-data dependency, not a regression. |
| topup-journey.ts edits | — | 1b asserts the new copy (`/ไม่พบเกม .zzzz./`) and the 44px "ดูเกมทั้งหมด" button; 3b accepts any delivered code: masked must equal maskCode(revealed) (first + last segment kept), serial only required for seed `STEAM-` codes, poll API must not contain the code or its middle segments. Sample UID 123456789 already matches the RoV pattern. |
| topup-journey.ts run 2 | **22/22 PASS** | TP-1117 api (SIM ref), TP-1118 stock (code QA-•••••-•••••-0002, stock 7→6), wallet ฿300 + ฿6 bonus, TP-1119 wallet instant, TP-1120 manual → processing; 0 console errors. Note 1z: the OTP gate renders no submit button at all for guests (0 found; the server refusal is covered by topup_services-verify guest phase). Log: tooling/qa/_verify-topup-journey-2.txt |
| topup-admin-journey.ts run 1 | 16/18 | FAIL 10: the เติมไม่สำเร็จ dialog copy changed (no "ต้องคืนเงินมือ" in the dialog any more; it now says "ระบบจะติดธง “ต้องคืนเงิน” ให้คุณโอนคืนลูกค้าเอง แล้วกด “บันทึกว่าคืนเงินแล้ว”") → intended (SERVICES-15 / ADMIN-12). FAIL 11: asserted the retry gets a NEW SIM ref; since SERVICES-11 / RV-02 the retry queries the supplier by the order's idempotency key first and the simulator ref is deterministic per key → the SAME ref (no second top-up) → intended. |
| topup-admin-journey.ts edits | — | 10 asserts the new dialog copy, the payment stays `paid` with `providerPayload.refundRequired`, then drives the new refund recording: บันทึกว่าคืนเงินแล้ว (+ note) → toast "บันทึกว่าคืนเงิน TP-… แล้ว", order `refunded`, payment `refunded` with refundedAmount = amount, ลองใหม่ and บันทึกว่าคืนเงินแล้ว gone. 11 asserts the same SIM ref and supplier attempts `submit:success → query:… → submit:success` (the admin process does not share the web process' simulator memory, so the query answers not_found and the deterministic re-submit returns the same ref). 13 adds the stock dedupe rule (ADMIN-06): re-pasting the 3 codes (one lower-case, one padded) → "ไม่ได้นำเข้าโค้ดใหม่ … ข้ามโค้ดซ้ำ 3", count unchanged. |
| topup-admin-journey.ts run 3 (full) | **18/18 PASS** | + `--only 13` with the dedupe assertion → PASS (available 10 → 13 → 12). No horizontal overflow warnings, no admin 5xx / page errors. Logs: tooling/qa/_verify-topup-admin-journey-3.txt, -4.txt |

## 2. Hunters' repro scripts — critical / major findings (22 = 6 critical + 16 major in the jsonl today; the commit message said 17 major — ADMIN-08 was re-graded minor by the hunter)

Probe output files: tooling/qa/bughunt/_verify-services-proof.out, _verify-storefront-svc.out, _verify-storefront-http.out, _verify-storefront-live.out, _verify-admin-probes.out.
None of these probes encode PASS/FAIL for the old behaviour as an assertion (they log RESULT / Sx lines); each line below was compared with the hunter's evidence.

| ID | Sev | Probe | Before (hunter evidence) | Now | Verdict |
|---|---|---|---|---|---|
| SERVICES-05 | critical | services-proof `failed-then-paid` | order failed, payment stayed open, slip then paid silently | failOrder on an unpaid order → order `cancelled` + payment `cancelled`; markPaid → PaymentStateError "is cancelled: cannot mark paid"; no events | FIXED, does not reproduce |
| SERVICES-06 | major | services-proof `oos-paid` | out of stock after payment: flag only on topup_orders | payment `paid` + providerPayload.refundRequired "สินค้าหมด", failureReason "ต้องคืนเงิน: สินค้าหมด", events topup.failed + payment.refund_required | FIXED |
| SERVICES-07 | major | services-proof `frozen-wallet-topup` | markPaid threw (upload 500) | markPaid does not throw; payment `paid` + refund flag "กระเป๋าเงินถูกระงับ …" | FIXED |
| SERVICES-04 | major | services-proof `blocked` | blocked customer / guest with blocked phone could order | both `customer_blocked` "ขออภัย ไม่สามารถทำรายการได้ กรุณาติดต่อร้านโดยตรง" | FIXED |
| SERVICES-08 | major | services-proof `method-disabled` | disabled methods accepted | promptpay / slip / wallet disabled → `method_disabled` | FIXED |
| SERVICES-11 | major | services-proof `api-retry` + admin journey 11 | retry re-submitted with a new ref (double top-up with a real supplier) | retry queries by idempotency key (order UUID, 32 hex) first: attempts submit:success → query:success, same ref SIM-4ZY62V; journey 11 same ref | FIXED |
| SERVICES-02 | major | outbox payloads of this run (events_outbox, last 40 min) | topup.paid had no fulfillment / gameName / packageName | topup.paid / processing / fulfilled / failed / cancelled / refunded all carry accessKey, contact, email, phone, fulfillment, gameName, packageName, number, price | FIXED |
| SERVICES-03 | major | same | fulfilled / failed omitted gameName, packageName, contact, accessKey | present (see above); integrations handlers.test.ts green (section 5) | FIXED |
| SERVICES-15 | major | admin journey 10 (updated) | no way to record a manual refund | บันทึกว่าคืนเงินแล้ว → order `refunded`, payment `refunded` (refundedAmount = amount), retry gone | FIXED |
| SERVICES-01 | critical | storefront-svc S0 / S4 | paymentHookSummary.closed had no topup / wallet_topup; sweep left order pending | closed = […, topup, wallet_topup, …]; S4 sweep → payment `expired`, order `cancelled` | FIXED |
| STOREFRONT-08 | major | storefront-svc S4 / S4b | same as SERVICES-01 | same; S4b cancelPayment on the expired payment → stays `expired`, order `cancelled` | FIXED |
| ADMIN-01 | major | storefront-svc S0 (same hook summary the hunter read via topup_admin-db.ts) | same | same | FIXED |
| STOREFRONT-05 | critical | storefront-svc S1 | guest order with an existing customer's phone attached to that customer (merge) | TP-1141 customer_id = null → "separate" | FIXED |
| STOREFRONT-06 | major | storefront-svc S2 / S2b | blocked customer could order as guest and signed-in | both refused `customer_blocked` | FIXED |
| STOREFRONT-09 | major | storefront-svc S5 | failed slip/PromptPay-paid orders: refund flag only on the order | new failures flag the payment (oos-paid above, admin journey 10). S5 still listed 6 LEGACY rows (TP-1020/1026/1032/1038/1048/1057, written by pre-fix journey / hunter runs) → one-off idempotent data fix `tooling/qa/bughunt/fixes/topup_verify-datafix.ts` (flagTopupPaymentRefund, same as the new code): 6 flagged, rerun → 0 left | FIXED (+ legacy data fixed) |
| (minor, STOREFRONT-01/02/03/04 + SERVICES-13) | — | storefront-http (all) | 58 pass / 10 fail (8 path-echo "LEAK" false positives = STOREFRONT-01, + 2 real) | run 1 after the fix wave: 60 / 8 — 7 path echoes + feed `limit=-5`. Probe updated (say which): (a) the cross-tenant LEAK check now scrubs the router-state echoes of the requested path (`\"TP-n\"`, `number=TP-n`, `TP-n?k=`) and still fails on any other occurrence (title, data); (b) `limit=-5` expectation 1 → 10, the STOREFRONT-04 rule (non-finite / ≤ 0 → default 10; it asserted the old clamp-to-1 as PASS and now FAILED it as intended). Also fixed the cosmetic STOREFRONT-01 remainder: `/topup/[number]` generateMetadata on a shop without the module titled the 404 "รายการ TP-1118 · Siam Atelier" → now no order title (`<title>Siam Atelier</title>`; demo-topup keeps "รายการ TP-1118 · GameHub"). Run 3: **68 pass / 0 fail** | FIXED |
| STOREFRONT-12 | major | storefront-live `flows` | Genshin "ทดสอบ🙂" became an order; Valorant "NoTagHere" valid; no pattern / inputmode | **Reproduced on the first rerun** (TP-1144 with UID "ทดสอบ🙂", TP-1143 with a 120-char UID): the code was fixed but the live demo-topup game rows were seeded before the template got formats (services packet: "applies once the demo reset re-seeds"). Fixed the data instead of resetting the demo: `topup_verify-datafix.ts` part 2 parses the template's own `defs` and copies pattern / inputMode / hint / minLength / maxLength / placeholder into the existing fields by key (8 games; labels, options, shop edits kept; every pattern passes safeFieldPattern; idempotent — rerun "already has the template formats"). Rerun: 121-char and Thai UIDs → form `:invalid` on pf-uid, no order; Valorant NoTagHere valid=false, pattern `[^#\s][^#]{2,15}#[A-Za-z0-9]{3,5}`; Free Fire pattern `\d{8,12}` inputmode numeric. Server-side refusal of the same values: covered by topup_services-verify `fields` + vitest (section 5). | FIXED (+ demo data) |
| STOREFRONT-13 | major | storefront-live `wallet` | 'ยกเลิก' link only navigated back; top-up + payment stayed pending | first rerun FAILED on the probe itself (the link no longer exists); probe updated to the new "ยกเลิกรายการ" server-action button (→ /wallet?cancelled=1), also closing earlier pending top-ups of the probe customer. Rerun → `{topup_status: cancelled, payment_status: cancelled}`, pendingTopupsForCustomer=0 | FIXED |

Live probe edits (tooling/qa/bughunt/topup_storefront-live.ts, all marked "verifier 2026-10-19"): new-button cancel (above); `submitAndWait` reports `{kind:"invalid", fields}` when the browser refuses the form instead of waiting 90 s; P1 (Thai UID) now records the refusal and falls back to a valid UID 812345678 + PromptPay so the tracker / polling steps still run; the polling step waited for any timeline label ("ชำระแล้ว" is always on screen → it "passed" after 76 ms with the order still pending_payment) → now waits for เติมสำเร็จแล้ว / เติมไม่สำเร็จ (rerun: fulfilled after 4.1 s, SIM-8DYFC4); `alertTexts` also ignores the route announcer's alert inside its shadow root (a false "alert TP-1148" broke the wallet-order step once). Result `flows wallet` run 3: 16/16 PASS (_verify-storefront-live.out); `flows` run 4 (after the polling fix): P1 polling PASS; the steam S1 steps were then refused by the per-customer hourly limit "สั่งซื้อได้สูงสุด 10 รายการต่อชั่วโมง" — intended (SERVICES-10), the probe customer had placed 10 orders across my reruns; S1 passed in run 3.
| ADMIN-02 | major | admin-probes `p1` (after `setup`) | SVG / HTML-as-PNG / bogus GIF accepted and served | all three refused "รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, AVIF)", no URL | FIXED |
| ADMIN-13 | major | admin journey 6 + DB | proof stored as `http://localhost:3001/uploads/…` (404 on the admin host) | TP-1133 / TP-1121 (this run's journey) store `/uploads/tenants/…/topup-proof/….png`, served 200 image/png on demo-topup.localhost:3000; 0 orders / games with the admin-host prefix | FIXED |
| ADMIN-03 | critical | admin-probes `p2` | failOrderAction on an unpaid order → failed, payment open, late slip paid silently | `{ok:false, error:"รายการยังไม่ชำระเงิน — ใช้ “ยกเลิกรายการ” แทน"}`, order stays pending_payment; the later slip pays it normally → order `processing` (topup.paid) | FIXED |
| ADMIN-04 / SERVICES-14 | minor | admin-probes `p3` | raw UPDATE, no payment.cancelled | payment `cancelled` + events payment.cancelled, topup.cancelled | FIXED |
| ADMIN-05 | minor | admin-probes `p3` | reject on a cancelled payment escaped as PaymentStateError | reject → "รายการชำระเงินนี้ปิดแล้ว"; approve → "… อนุมัติไม่ได้" | FIXED |
| ADMIN-06 | critical | admin-probes `p4` + admin journey 13 | same code imported twice → 2 available rows | 2nd import "ไม่ได้นำเข้าโค้ดใหม่ · ข้ามโค้ดซ้ำ 2 (ซ้ำในรายการที่วาง 1 · มีในสต็อกแล้ว 1)", 1 row for the code | FIXED |
| ADMIN-07 | critical | admin-probes `p4` | delete package with 2 unsold codes → codes cascaded away | refused "แพ็กเกจนี้ยังมีโค้ดที่ยังไม่ได้ขาย 2 โค้ด ลบไม่ได้ …", codes kept (probe's temp package + its 2 codes then voided and removed by hand) | FIXED |

Admin probe edits (tooling/qa/bughunt/topup_admin-probes.ts): fixture UIDs `77${RUN}0n` (base36, letters) → `77${RUN_NUM}0n` (digits) because RoV now requires `\d{5,20}`; action ids regenerated with topup_admin-actionids.mjs (206 ids). The probes only `upsert` a finding when they observe the bug: topup_admin.jsonl is byte-identical after the run (none re-detected). `setup` wrote a fresh topup_admin-fixture.json (run iz0mp, TP-1153…1156). Overall `--only setup,p1,p2,p3,p4` → PASS ×5.

All 22 critical / major findings: **none reproduces**. STOREFRONT-12 reproduced on live demo data until the field-format data fix.

Fixer verify re-run after all of the above: `topup_services-verify.ts` (hooks, expiry, guest, rate, notify, fields, tiers, neutral, http) → **ALL PASS** (26 checks; STOREFRONT-12 server side: Genshin "ทดสอบ🙂" → invalid_field "UID ไม่ถูกต้อง (ตัวเลข 9–10 หลัก)", Riot ID without #TAG refused).

## 3. Smoke / hydration

| Run | Result | Notes |
|---|---|---|
| `pnpm --filter @rentweb/tooling smoke -- demo-topup` | **14/14 ✓** | /, /games, /games/rov, /wallet, /topup/status, /how-to, /contact × desktop + mobile, all 200 |
| hydration `--path /` run 1 | **FAIL (real)** | pageerror "Hydration failed because the server rendered text didn't match the client" in `TopupFeedClient`: server "6 นาทีที่แล้ว", client "7 นาทีที่แล้ว" — the live feed computed relative times against `Date.now()` in render, so a minute boundary between SSR and hydration (seconds in dev) breaks hydration of the home page. |
| VF-01 fix | — | packages/modules/topup/src/components/topup-feed-client.tsx: new `renderedAt` prop; `now` state starts at `Date.parse(renderedAt)` (server and hydration render agree), switches to the viewer's clock in an effect after mount and on every poll tick; sections/topup-feed.tsx passes `renderedAt={new Date().toISOString()}`. Regression test packages/modules/topup/test/verify-fixes.test.ts (renderToString with the clock 61 s after renderedAt → "6 นาทีที่แล้ว", without renderedAt → "7 …"); topup vitest.config.ts gets `oxc.jsx.runtime = "automatic"` (tsconfig keeps jsx preserve for Next). |
| hydration `--path /` runs 2 + 3 | **PASS** | 0 hydration errors (only motion's "Reduced Motion enabled" warning, as on every page) |
| hydration `--path /games/rov` | **PASS** | only the Reduced Motion warning |

## 4. Screenshots (one context per app, looked at once) — `tooling/qa/bughunt/fixes/topup_verify-shots.ts [name…]`

tooling/screenshots/topup-verify-{home,games-rov,order-TP-1150,wallet,admin-orders}-{390,1440}.png (+ order-TP-1150-detail-390.png). Every shot: HTTP 200, no horizontal overflow, 0 console / page errors; /wallet signed in (fixture customer 0860432571).

| Page | Observation | Action |
|---|---|---|
| home | 1440 + 390 render; hero still said "RoV · Free Fire · Genshin · Valorant · PUBG และอีก 40+ เกม" — ADMIN-17 changed the template's demo copy to "และเกมยอดนิยมอีกมากมาย" (8 games on the demo) but demo-topup's home page row is the 2026-10-15 seed (its verify only read the template source) | `topup_verify-datafix.ts` part 3 replaces the phrase in pages.sections + published_sections of demo-topup (1 page; rerun → "no … left"); live home now "PUBG และเกมยอดนิยมอีกมากมาย" |
| /games/rov | hint "ตัวเลข 5–20 หลัก" under Open ID (field formats now live), sticky mobile summary clear of the LINE button | — |
| /topup/TP-1150?k= | code card masked + แสดงโค้ด / คัดลอก, timeline, details. At 390 the detail rows squeezed long values beside long labels ("LINE ID / อีเมลสำหรับรับโค้ด" + "qa-steam2@example.com" broke into "qa-" / "ste…") | VF-02: apps/web/src/app/(sites)/rw/[tenantId]/topup/[number]/page.tsx detail rows `flex-wrap` + value `ml-auto min-w-0 text-right [overflow-wrap:anywhere]` (sm: unchanged block layout) → value moves to its own line, right-aligned (detail shot re-taken, looked at once) |
| /wallet | balance card, presets, history; 390 showed ฿801 vs ฿802 in DB = the `<Counter>` count-up captured mid-animation (1440 ฿802) | not a bug |
| admin /topup/orders | KPI cards, tab strip (horizontal scroll at 390), filters, queue rows | — |

## 5. Final gates (after every change above)

| Gate | Result |
|---|---|
| `pnpm turbo typecheck` (whole repo) | **16/16 successful** (+ `@rentweb/tooling typecheck` again after the last journey edit: green) |
| `pnpm --filter @rentweb/module-topup test` | **8 files / 96 tests green** (incl. new test/verify-fixes.test.ts VF-01 ×2) |
| `pnpm --filter @rentweb/core test` | **17 files / 187 green** |
| `pnpm --filter @rentweb/integrations test` | **2 files / 16 green** |
| `pnpm --filter @rentweb/module-commerce test` | **7 files / 123 green** |
| topup-journey.ts (final) | **22/22 PASS** (_verify-topup-journey-3.txt) — with the live field formats; sample UIDs (RoV 123456789, Steam contact qa-steam@example.com) match the patterns |
| topup-admin-journey.ts (final) | run 5: 17/18 — step 4 failed only because the รอเติม queue (FIFO by paid_at, 20 per page) had collected > 20 older manual orders (my partial `--only` run + hunters' leftovers), so this run's orders were on page 2 → step 4 now narrows the tab with `?tab=manual&q=<run UID>` and asserts the 4 rows. Run 6: **18/18 PASS**, no overflow warnings, no admin 5xx (_verify-topup-admin-journey-6.txt) |
| smoke demo-topup (final) | **14/14 ✓** |
| hydration `/` and `/games/rov` (final) | **0 hydration errors** each |

## 6. Changes made by the verifier

Code (top-up area):
- VF-01 packages/modules/topup/src/components/topup-feed-client.tsx (`renderedAt`, clock after mount / per tick), sections/topup-feed.tsx; test/verify-fixes.test.ts; packages/modules/topup/vitest.config.ts (`oxc.jsx.runtime: "automatic"`).
- VF-02 apps/web/src/app/(sites)/rw/[tenantId]/topup/[number]/page.tsx detail rows wrap long values (390 px).
- VF-03 same file: `generateMetadata` gives no order-number title on a shop without the top-up module (STOREFRONT-01 cosmetic remainder).

Data (demo-topup, idempotent, `tooling/qa/bughunt/fixes/topup_verify-datafix.ts [--dry]`): 6 legacy paid payments of failed orders flagged ต้องคืนเงิน (STOREFRONT-09); template player-field formats copied into the 8 live games (STOREFRONT-12); demo hero "และอีก 40+ เกม" → "และเกมยอดนิยมอีกมากมาย" (ADMIN-17). Probe cleanup: the temp package "QA tmp stock iz0mp" (+2 codes) left by admin-probes p4 (delete is now refused, as intended) voided and removed.

QA scripts updated for intended rule changes: tooling/qa/topup-journey.ts (1b copy, 3b any delivered code), tooling/qa/topup-admin-journey.ts (4 queue paging, 10 refund recording, 11 idempotent retry, 13 dedupe), tooling/qa/bughunt/topup_storefront-http.ts (path-echo scrub, feed ≤0 → 10), tooling/qa/bughunt/topup_storefront-live.ts (new cancel button, invalid-form detection, P1 fallback, real polling wait, shadow-root announcer), tooling/qa/bughunt/topup_admin-probes.ts (numeric fixture UIDs). New: tooling/qa/bughunt/fixes/topup_verify-shots.ts, topup_verify-datafix.ts.

Side effects to know: probe reruns rewrote the hunter files they own — tracked tooling/qa/bughunt/topup_storefront-live.out (appended by design), topup_admin-fixture.json (new `setup` fixture, run iz0mp) and topup_admin-actionids.txt (regenerated: the old ids were stale after the admin action changes); untracked topup_storefront-http.log (rewritten). topup_admin.jsonl and the other findings files are unchanged. storefront-svc S4 ran `expireStalePayments(graceMinutes: 0)` across all tenants (26 stale pending payments expired — what the worker would do).

## 7. Still open

- Outbox: ~370 events pending — no worker / `POST /api/internal/outbox` runs in this dev session, so notifications (incl. the new topup.refunded message) are only proven by integrations tests + topup_services-verify `notify`, not by a live send.
- Simulator limitation (not a bug): `query()` answers from the process that submitted, so an admin retry (admin process) of a web-submitted api order logs `query:not_found → submit:success`; the deterministic ref keeps it to the same SIM ref. A real adapter must implement `query` against the supplier.
- STOREFRONT-16 (DEFERRED in the services packet) unchanged.
- Demo data noise: the รอเติม queue holds ~20 old QA manual orders (TP-1004 … TP-1153) from hunter / fixer / verifier runs; harmless, cleared by a demo reset.
