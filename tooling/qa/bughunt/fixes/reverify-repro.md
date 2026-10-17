# Re-verification: repro (key `repro`)

Started 2026-10-17. Scope: (1) all fix verify scripts in tooling/qa/bughunt/fixes/, (2) hunters' repro scripts for every CRITICAL/MAJOR finding (non topup-deferred), (3) package test suites db, core, integrations, module-commerce, module-booking, module-restaurant.

## (1) Fix verify scripts

| script | result before | what changed (script/product, files) | result after |
|---|---|---|---|
| AC-01-verify.ts | 1 PASS / 0 FAIL | none | 1/0 |
| AC-02-verify.ts | 18 PASS / 0 FAIL | none | 18/0 |
| ADMIN_B2-01-02-03-verify.ts | 17 PASS / 0 FAIL | none | 17/0 |
| ADMIN_B2-02-verify.ts | 23 PASS / 0 FAIL | none | 23/0 |
| ADMIN_B2-05-payments-verify.ts | 27 PASS / 0 FAIL | none | 27/0 |
| ADMIN_B2-06-verify.mjs | 7 PASS / 0 FAIL | none | 7/0 |
| ADMIN_B2-08-verify.mjs | 16 PASS / 0 FAIL | none | 16/0 |
| ADMIN_B2-10-verify.ts | 25 PASS / 0 FAIL | none | 25/0 |
| ADMIN_B2-11-12-18-verify.ts | 20 PASS / 0 FAIL | none | 20/0 |
| ADMIN_B2-14-15-16-17-verify.ts | 17 PASS / 0 FAIL | none | 17/0 |
| ADMIN_B2-18-verify.ts | 37 PASS / 0 FAIL | none | 37/0 |
| ADMIN_B2-19-verify.ts | 3 PASS / 0 FAIL | none | 3/0 |
| ADMIN_CORE_B4-unit-verify.ts | 59 PASS / 0 FAIL | none | 59/0 |
| AM-03-verify.ts | 3 PASS / 0 FAIL | none | 3/0 |
| COR-04-05-06-verify.ts | 4 PASS / 0 FAIL | none | 4/0 |
| COR-27-verify.ts | 7 PASS / 0 FAIL | none | 7/0 |
| COR-29-verify.ts | 11 PASS / 0 FAIL | none | 11/0 |
| MODULES_FINISH-followups-verify.ts | 8 PASS / 0 FAIL | none | 8/0 |
| COR-33-verify.ts | 2 PASS / 0 FAIL | none | 2/0 |
| PF-4-verify.ts | 2 PASS / 0 FAIL | none | 2/0 |
| PF-6-verify.ts | 5 PASS / 0 FAIL | none | 5/0 |
| PF-7-verify.ts | 7 PASS / 0 FAIL | none | 7/0 |
| PF-1-verify.ts | 16 PASS / 0 FAIL | none | 16/0 |
| PF-2-verify.ts | 12 PASS / 0 FAIL | none | 12/0 |
| RA-01-verify.ts | 7 PASS / 0 FAIL | none | 7/0 |
| RA-02-03-verify.ts | 67 PASS / 0 FAIL | none | 67/0 |
| RA-04-verify.ts | 1 PASS / 0 FAIL (prints only failures, exit 0) | none | 1/0 |
| RESPONSIVE_B2-01-verify.ts | 25 PASS / 0 FAIL | none | 25/0 |
| RESPONSIVE_B2-06-verify.ts | 28 PASS / 0 FAIL | none | 28/0 |
| RESPONSIVE_B2-08-09-13-15-verify.ts | 14 PASS / 0 FAIL | none | 14/0 |
| RESPONSIVE_B2-10-verify.ts | 37 PASS / 0 FAIL | none | 37/0 |
| RESPONSIVE_B2-14-verify.ts | 15 PASS / 0 FAIL | none | 15/0 |
| RESPONSIVE_WEB-followups-verify.ts | 65 PASS / 0 FAIL | none | 65/0 |
| SBR-008-verify.ts | 23 PASS / 0 FAIL | none | 23/0 |
| SBR-011-RA-05-verify.ts | 6 PASS / 0 FAIL | none | 6/0 |
| SEC-002-verify.ts | 22 PASS / 0 FAIL | none | 22/0 |
| SEC-003-verify.ts | 28 PASS / 0 FAIL | none | 28/0 |
| SEC-009-verify.mjs | 17 PASS / 0 FAIL | none | 17/0 |
| SEC-012-verify.ts | 6 PASS / 0 FAIL | none | 6/0 |
| SS-01-verify.ts | 16 PASS / 0 FAIL | none | 16/0 |
| SS-04-verify.ts | 12 PASS / 0 FAIL | none | 12/0 |
| SS-05-ui-verify.ts | 8 PASS / 0 FAIL | none | 8/0 |
| SS-06-verify.ts | 5 PASS / 0 FAIL | none | 5/0 |
| SS-07-08-10-verify.ts | 19 PASS / 0 FAIL | none | 19/0 |
| UI_DIALOG-verify.ts | 22 PASS / 0 FAIL | none | 22/0 |
| admin_core-ui-verify.ts | 51 PASS / 0 FAIL | none | 51/0 |
| modules_finish-http-verify.ts | 38 PASS / 0 FAIL | none | 38/0 |

## (2) Hunter repro scripts (CRITICAL / MAJOR)

| script | findings | result before | what changed | result after |
|---|---|---|---|---|
| security-sanitize.ts | SEC-001, SEC-001b | sanitizeCss: `</sty</style>le><script>` -> `\3c script>...` (no </style>, no tag), `@im@import` -> '' | none | bug no longer reproduces (CSS). Side finding: sanitizeHtml unterminated-tag XSS, see For other owners |
| correctness-payload-peek.ts | COR-15, COR-17 | order.paid/order.created now carry accessKey, email, phone, customerName; rest_order.paid/table.bill_requested carry amount, total, tableId, paymentId | none | COR-15 fixed in payload; COR-17 handler check below |
| correctness-reminder-peek.ts + correctness-reminder-run.ts | COR-14 | peek: 8 pending booking.reminder events for cancelled bookings (BK-1011/1002/1013/1004, created before the fix, still queued); run: handler executed for BK-1011 (cancelled) -> notification rows written: [] | none | FIXED: handler drops reminders for cancelled/moved bookings (handlers.ts booking.reminder COR-14 guard); queued old events become no-ops |
| correctness-payload-peek.ts (handler read) | COR-17 | handlers.ts table.call_staff/table.bill_requested look up tableName(tableId), amount = p.amount ?? p.total, rest_order.paid same | none | FIXED (code + payload keys match) |
| fixes/_repro-cor15.ts (new; replaces correctness-outbox-run.ts, which drains the whole shared outbox) | COR-15 | n/a | new script: runs the order.paid handler for the latest demo-cafe order.paid event in a rolled-back tx and opens the written link | PASS: link /orders/<id>?k=<key> -> 200, order shown |
| fixes/_repro-sanitizehtml.ts (new) | side finding | FAIL (XSS executes) | new script (proof only) | reported under For other owners |
| correctness-expiry2.ts | COR-33, SBR-002 | before the sweep ran: 5 pending bookings (demo-salon BK-1001/1015/1016/1026, qa-b2-salon BK-1001) and 8 pending demo-shop/cafe orders with expired unpaid QRs | none (sweep executed by COR-33-verify via POST /api/internal/outbox) | after: [] and []; BK-1001/1015/1016/1026 cancelled_by=system, payments expired; #1030/#1036 cancelled, payment expired. FIXED (needs the cron/worker to run in prod) |
| correctness-commerce2.ts | COR-04, COR-05, COR-06 | (assertion lines added, logic unchanged) D: ['fail coupon','ok #1071'] used 1/1; E: ['ok #1072','fail empty'] stock 13->11; F: 1x200 + 2x400 'ครบตามสต็อก', one line q=2, checkout stock 2->0 | added PASS/FAIL verdict lines only | 3 PASS / 0 FAIL: bugs no longer reproduce |
| correctness-rest1.ts | COR-07, SBR-005 | original sends no proof: anonymous slip is refused 403 by the SEC-009 rule, so it no longer exercises the stale-bill path (see original-run row below) | script: slip POST now carries the table-session cookie rw_table=<session.token> (how the guest at the table proves access) + PASS/FAIL verdict | PASS: round1 R-1043 bill QR 16000, round2 R-1044 voids it; slip -> 409 'cancelled'; both rounds unpaid, session open due 32000 |
| correctness-commerce1.ts | COR-01, COR-02, COR-03, COR-24 | original: every slip POST anonymous -> 403 'ไม่มีสิทธิ์แนบสลิป' (SEC-009 intended rule) so A/B never reach the payment state machine (A #1077 cancelled, B #1078 never paid); C not reached in that run | script: uploadSlip sends the order access key (?k=, like the guest order page); placeOrder error carries the result code; C treats a checkout refused with code 'coupon' as the intended outcome; PASS/FAIL verdicts (+ COR-24 restock check) | 4 PASS / 0 FAIL: A slip on cancelled -> 409, order cancelled/unpaid; B slip 1 paid, full refund restocked (refunded, restocked 1), slip 2 -> 409 'refunded'; C second WELCOME10 order refused 'คุณใช้โค้ดนี้ครบจำนวนแล้ว' |
| correctness-book1.ts | COR-08, COR-09 | original: anonymous slips -> 403 (SEC-009), state machine not exercised (bookings/payments already voided correctly: BK-1060 cancelled + payment cancelled; BK-1061 -> BK-1062 old QR cancelled, new pending) | script: slip POST sends the booking access key (?k=); PASS/FAIL verdicts | 2 PASS: A BK-1057 cancel voids deposit, slip 409; B BK-1058 -> BK-1059: old QR cancelled + slip 409, fresh pending 300 THB payment for the new booking |
| correctness-rest2.ts | COR-10 | ['ok RS-1077','fail full','fail full'], availability remaining 0 | verdict line only | PASS |
| correctness-rest3.ts | COR-26 | 8 parallel scans -> created [false,true,false x6], one open session | verdict line only | PASS |
| correctness-outbox-race.ts | COR-13 | original logic: FAIL verdict but INVALID - the 40 probe events (1 h old) sort behind the 675-event dev backlog, so drainers A/B (limit 100 each) claimed 200 distinct real events (82 handled, 118 no-handler) and never touched the probe (40 still pending, attempts 0). Side effect: that run processed ~200 queued dev events (all providers 'skipped') | script rewritten: 80 probe events dated 3 days back (claimed first), A limit 40, B limit 40 after 400 ms, payment sweep off -> no real events touched | PASS: A 40 + B 40 claimed, 80 done, attempts sum 80 (each once) |
| correctness-guest.ts | COR-28 | ok #1074, ok #1075 (second order new phone + same e-mail) | verdict line only | PASS |
| correctness-otp.ts | COR-31 | 40 parallel wrong guesses -> {invalid:5, too_many:35}, stored attempts 5 | verdict line only | PASS |
| correctness-stock-edit.ts | COR-32 | order took 3 -> stock 7; price-only save keeps 7, price 19900, 1 movement | verdict line only | PASS |
| (code read, no hunter script) packages/core/src/crypto.ts, storage.ts | SEC-006 | randomOtp = crypto.randomInt(100000, 1000000); objectKey random part = randomBytes(12) base64url (SEC-009-verify asserts 16 chars). Remaining Math.random uses are non-secret (section ids, slug suffix, cache-cleanup sampling) | none | FIXED |
| responsive_a11y-kbd2.ts + responsive_a11y-kbd3.ts | RA-01 | demo-salon 1440: inline nav บริการ/ทีมเทอราพิสต์/บรรยากาศ + 'เปิดเมนู' button now in the header tab order (was missing at md+); 768 + 1440 header include 'เปิดเมนู'; 390 menu sheet lists all 5 items (incl. /about, /contact) | none (probe scripts print state, no verdict lines) | FIXED: items 4-5 reachable via the menu sheet at every width |
| responsive_a11y-reveal.ts | RA-02 | exit 1: TimeoutError waiting for '[class*="motion-safe:translate-x-7"]' - the RA-02 fix removed those Tailwind start classes (data-reveal / data-reveal-item now), 390 query returned [] | script: probes [data-reveal],[data-reveal-item] after a full scroll, ignores elements whose own classes carry an intentional static transform (pricing card lg:-translate-y-3 lg:scale-[1.02], same under reduced motion), PASS/FAIL verdict | PASS 390 + 1440: 44 revealed blocks at identity transform, opacity 1, scrollWidth = viewport |
| responsive_a11y-textreveal.ts + responsive_a11y-textreveal2.ts | RA-03 | textreveal: 'no TextReveal' on demo-shop / and /products (old motion-safe:translate-y-[110%] selector no longer exists after the fix), then page.goto networkidle timeout on demo-cafe (dev HMR churn) -> exit 1; textreveal2 (demo-cafe 390): no-preference 9/9 words visible, reduce 9/9 | textreveal.ts: probes [data-reveal-word] inside its mask, isolateHmr + load wait, PASS/FAIL verdict | PASS 7/7 pages (shop /, /products, cafe, restaurant, salon, clinic, corporate): all words visible with motion enabled |
| responsive_b2-h1zoom.ts demo-shop / 390 no-preference | RESPONSIVE_B2-01 | h1 data-reveal-thai, every word's mask [128.4,224.7] extends 24.6px above / 15.7px below the glyph box [153,209] (overflow hidden) -> tone marks / upper vowels (ที่, ใส่, ไม่) no longer clipped | none | FIXED |
| responsive_b2-resdlg.ts | RESPONSIVE_B2-02 | 390x844 dialog [16,828] max-h 812; 390x667 dialog [16,651] max-h 635, content 810 > 633 so the body scrolls inside while the dialog box stays in the viewport; submit 'บันทึกการจอง' at [538,582] and close X at 21 visible at 667 (was 960px tall, unreachable) | none (probe reads dialog.scrollTop which stays 0 by design: only the body region scrolls) | FIXED |
| responsive_b2-adminshot.ts + responsive_b2-adminshot2.ts | RESPONSIVE_B2-03 | adminshot: table present but 0px wide at 390 (hidden md:block); adminshot2: every scroller metric 0 (probes the hidden table) | adminshot2.ts: probes the phone card list ul[aria-label=รายการเมนู] (visible, cards, every toggle inside the viewport, no sideways scroll) + verdict; original probe kept in a comment | PASS: 14 cards, table hidden, 3 toggles per card inside 390px, scrollWidth 390 |
| admin_modules-x1.ts | AM-01 (+ AC-06 restaurant KPIs) | demo-restaurant payments tab=paid: 17 rows, every restaurant row links /restaurant/orders?tab=history&from=..&to=..[&q=R-xxxx]; following it -> 200 h1 'ออเดอร์ร้าน' (history list), no 'กำลังพัฒนาในเฟสถัดไป' placeholder; clinic booking rows -> /bookings/<id>. Restaurant dashboard KPIs: ออเดอร์วันนี้ 28, โต๊ะกำลังใช้งาน 16, ยอดขายวันนี้ ฿2,020, จองโต๊ะวันนี้ 7; errors [] | none | FIXED (AM-01, AC-06) |
| admin_modules-print.ts | AM-04 | sheetHeader 'missing', orderNo undefined (sender visible, shell hidden): the fix made the sheet head a <div data-print-sheet-head>, the probe only looked for <header> | script: sheet head = [data-print-sheet-head] or header; PASS/FAIL verdict | PASS 1440 + 390: sender block + order number #1044 + date visible, app header/aside/buttons hidden |
| admin_b2-onboard.ts (fresh run, ADMIN_B2_CREDS/ADMIN_B2_STATE_OWNER -> scratch files so the hunt's creds stay intact) | ADMIN_B2-04/05/09 setup, AC-02, AC-03 | owner qa-b2-kfcz@example.com, 6 new tenants qa-b2-{shop,cafe,salon,clinic,rest,corp}-kfcz: settings.contact = hours only, payments = enabled flags only (no PromptPay ID / bank account), home + /contact sampleHits [] and no LINE button on all 6; checklist 0% with payments item open | script: creds/owner-state paths overridable via env (admin_b2-lib.ts CREDS/OWNER_STATE, onboard + settings use them); admin_b2-lib newCtx uses isolateHmr instead of aborting the HMR socket | AC-02/AC-03 FIXED for new tenants |
| admin_b2-newbook.ts (fresh salon qa-b2-salon-kfcz) | ADMIN_B2-04 | review: 'ราคา ฿1,290 ไม่ต้องมัดจำ ชำระที่ร้าน — ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงินออนไลน์ จึงไม่ต้องชำระมัดจำตอนนี้'; BK-1001 'ยืนยันแล้ว', 'ชำระที่ร้าน ฿1,290', no transfer/slip demand; errors [] | none | FIXED (pay-at-shop, intended) |
| admin_b2-checkout.ts + admin_b2-checkout2.ts (fresh qa-b2-shop-kfcz before payments were set, + fresh cafe) | ADMIN_B2-05 | shop: COD is now preselected ('วิธีจัดส่งนี้ชำระแบบเก็บเงินปลายทางเท่านั้น'), payment radios ['cod'], submit enabled -> order #1001 COD ยืนยันแล้ว ฿1,980 (was: Flash preselected, no radios, disabled submit, message blaming shipping); cafe (no COD/pickup): 'ร้านค้ายังไม่ได้ตั้งค่าช่องทางรับชำระเงิน (พร้อมเพย์หรือบัญชีธนาคาร) จึงยังสั่งซื้อออนไลน์ไม่ได้...' | checkout2.ts: also reads the payment area after choosing Flash Express; verdict PASS / FAIL, or SKIP once the shop has a receiver (admin_b2-settings.ts adds one later in the same run, which is why a shop re-run after it shows PromptPay/bank and SKIPs) | PASS on fresh cafe; shop evidence from the pre-settings run; no 'pick another shipping' message anywhere |
| admin_b2-newpay.ts (fresh tenants) | ADMIN_B2-05 / -04 | cafe checkout: no-receiver notice, radios []; salon /book renders; clinic package buy -> OTP login gate; restaurant /order renders pickup flow; errors [] | none | FIXED |
| admin_b2-settings.ts + admin_b2-co4.ts (fresh shop) | ADMIN_B2-09 | contact phone 02-123-4567 only -> checkout radios ['cod'], latest payment method cod qr null (was promptpay_qr to +6621234567); mobile 089-999-0005 -> still COD only; after saving PromptPay 0899990006 + KBank account -> radios promptpay_qr + slip, QR payload targets 0066899990006; co4: PromptPay order page shows 'QA B2 PromptPay 0899990006', slip order page shows กสิกรไทย 111-2-33333-4 | none | FIXED (contact phone never becomes the PromptPay receiver) |
| admin_b2-media.ts (demo-shop) | ADMIN_B2-15, AC-01 | jpg/png/webp uploaded ('อัปโหลด 1 ไฟล์แล้ว') and served by the storefront 200 with image/* content type; svg / HTML-as-.jpg / txt refused with Thai type message; 11 MB and 13 MB -> 'ไฟล์ใหญ่เกิน 10 MB (11.0 MB)'; 2 x 7 MB (14 MB total) -> 'อัปโหลด 2 ไฟล์แล้ว' (was 'Unexpected end of form'); errors [] | none | FIXED |
| admin_b2-dbpeek.ts | ADMIN_B2-11 | shop www.qa-b2-sppp.test failed, cafe same host pending (a second unverified claim no longer blocked: intended, only verified domains route) | none | consistent with fix |
| admin_b2-media2.ts | ADMIN_B2-15 | 2 x 4 MB -> 2 added; 3 x 4 MB (12 MB total) -> 'อัปโหลด 3 ไฟล์แล้ว' 3 added (was 'Unexpected end of form', 0 added); in-use image delete: no toast, file + page reference kept (delete goes through a confirm step; ADMIN_B2-16/17 territory, not a major) | none | ADMIN_B2-15 FIXED |
| admin_b2-jsonld.ts manager | ADMIN_B2-20 | manager saved product name with '</script><script>window.__b2=document.domain</script>'; storefront window.__b2 = null; JSON-LD contains \u003c/script\u003e (escaped); name restored afterwards | none | FIXED |
| admin_core-onboard.ts | AC-02, AC-03, AC-06 | new owner qa-ac-255a + 6 tenants (ac-shop-255a ...): settings.contact = hours only, payments = enabled flags only; corporate contact form notify = ['qa-ac-255a@example.com'] (not contact@northstar); restaurant dashboard KPIs 'ออเดอร์วันนี้ 0 · ไม่มีโต๊ะที่เปิดอยู่ · ยอดขายวันนี้ ฿0 · จองโต๊ะวันนี้ 0 · สลิปรอตรวจ 0' (no 'enable the shop module' fallback); slug validation messages all Thai | none | AC-03 + AC-06 FIXED |
| admin_core-peek1.ts | AC-02 | original peeks at ac-shop-vcre / ac-northwind-co-vcre, provisioned BEFORE the fix -> still 081-234-5678 / siamatelier / hello@siam-atelier.co / LINE links (stored data of old tenants, not new behaviour) | script: peeks at the tenants of the latest admin_core-onboard run (creds.rand, or argv), PASS/FAIL on phone/LINE/e-mail/full address + NOTE for template copy | PASS on ac-shop-255a / ac-northwind-co-255a (/, /contact): no sample phone, LINE, e-mail or contact address. NOTE: home FAQ still says 'มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00' (template copy) -> For other owners |
| security-payment.mjs | SEC-009, SEC-010 | fresh guest order on sec-u1shop: anonymous GET /api/payments/<id> -> 404; anonymous slip POST -> 403 'ไม่มีสิทธิ์แนบสลิป...'; payment pending, order unpaid | verdict line + cancels its probe order afterwards | PASS |
| security-slip2.mjs | SEC-008 | original re-used security-order.json (payment long closed -> 200 paid / 409 before any file check) and sent no proof (-> 403) | script: places a fresh guest order and uploads with the order access key (form k), as the payer page does; cancels the probe order | PASS: HTML-as-image/png, SVG, text/html -> 400 'รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP', payment untouched, slip_url null |
| security-redirect.mjs + security-redirect2.mjs | SEC-003 | signed-in admin /login?next=//evil.example/x -> 307 /; https://evil.example -> 307 /; /(backslash)evil.example/x -> 307 /; logout with //evil -> /login; (the '/\evil' literal in redirect.mjs is really '/evil.example/x', a same-origin path -> kept) | none | FIXED |
| security-otp1.mjs + security-otp2.mjs | SEC-005 (+ SEC-007 login path) | OTP login 200 -> /account, cookie HttpOnly SameSite=lax; signed-in /account/login?next=https://evil, //evil, /(backslash)evil -> 307 /account; verify with next=//evil.example/x -> /account | none | FIXED |
| security-setcss.ts + security-xss-browser.ts | SEC-001b | malicious customCss re-stored on sec-a (business plan); storefront window.__secXss = undefined | none | FIXED |
| security-reactivate.mjs + security-reactivate2.mjs | SEC-002 | platform suspended -> owner reactivate refused 'เว็บไซต์ถูกระงับโดยทีมงาน RentWeb...'; past_due -> owner self-suspend + reactivate -> back to past_due; cancelled -> refused 'เว็บไซต์นี้ถูกยกเลิกแล้ว...'; expired-trial past_due stays past_due; audit rows by platform/owner | verdict lines + restore of sec-u1shop (status via superadmin updateTenantStatus so caches are invalidated, trial_ends_at via SQL) | 5 PASS / 0 FAIL; sec-u1shop restored to active |

## (3) Package test suites

| package | result before | what changed | result after |
|---|---|---|---|
| @rentweb/db | 7/7 PASS (1 file) | none | 7/7 PASS |
| @rentweb/core | 139/139 PASS (16 files) | none | 139/139 PASS |
| @rentweb/integrations | 15/15 PASS (2 files) | none | 15/15 PASS |
| @rentweb/module-commerce | 47/47 PASS (6 files) | none | 47/47 PASS |
| @rentweb/module-booking | 49/49 PASS (6 files) | none | 49/49 PASS |
| @rentweb/module-restaurant | 39/39 PASS (5 files) | none | 39/39 PASS |

## For other owners
- **NEW (security, commerce owner): stored XSS through product description, sanitizeHtml unterminated tag.** packages/modules/commerce/src/lib/sanitize.ts only rewrites tags that end with `>`; an unterminated trailing tag passes through unchanged: `sanitizeHtml('<p>ok</p><img src=x onerror=alert(document.domain) x=')` returns the input as is (output of the hunter's tooling/qa/bughunt/security-sanitize.ts, re-run 2026-10-17). apps/web/src/app/(sites)/rw/[tenantId]/products/[slug]/page.tsx:136 SSR-renders it via dangerouslySetInnerHTML, so the HTML stream becomes `<img src=x onerror=... x=</div>` and the following `>` closes the tag; the handler runs. Proof: tooling/qa/bughunt/fixes/_repro-sanitizehtml.ts (Playwright, SSR-equivalent markup) prints `FAIL onerror handler executed in SSR context (stored XSS)`. Any tenant user who can edit products (incl. staff) can run script on the shop's customers. Suggested fix: after the tag rewrite, escape every remaining `<` that does not start one of the rewritten allowed tags (or escape `<`/`>` in text segments via a tokenizer); add a unit test with the unterminated-tag input.
- **AC-02 residual (templates owner, minor): sample location copy in template FAQ / contact text survives on new tenants.** stripSampleIdentity / sampleIdentityValues (packages/core/src/tenant/provision.ts) blank the settings and replace exact sample values; free-text sample locations are only neutralised through each template's `neutralText`. Evidence (2026-10-17, fresh tenant ac-shop-255a): GET / -> home FAQ 'มีหน้าร้านไหม? — มีค่ะ ที่ถ.นิมมานเหมินท์ เชียงใหม่ เปิดทุกวัน 10:00–20:00' (packages/templates/src/shop.ts:119); same pattern in restaurant.ts:123 FAQ 'จอดเพิ่มได้ที่ซอยอารีย์ 4 (ฟรี) หรือเดินจาก BTS อารีย์ 5 นาที' and clinic.ts:126 contact body 'คลินิกอยู่ชั้น 3 เอ็มควอเทียร์ ติด BTS พร้อมพงษ์...'. Customers of a new shop are told a location that is not theirs. Fix: add these sentences to each template's `neutralText` (e.g. -> '[ที่ตั้งร้าน / เวลาเปิด]' placeholders like restaurant 'อารีย์ · กรุงเทพฯ'). Probe: tooling/qa/bughunt/admin_core-peek1.ts prints a NOTE line while it persists.

## Final status per finding

| finding id | status | evidence |
|---|---|---|
