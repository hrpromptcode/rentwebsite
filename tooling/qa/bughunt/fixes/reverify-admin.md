# Re-verify: admin (key `admin`)

Date: 2026-10-17. Scope: admin journeys + hand-scripted flows + two follow-ups (pay-at-shop chip, deposit-without-receiver warning).

## Script runs

| script | result before | what changed (script/product, files) | result after |
|---|---|---|---|
| qa/admin-journey.ts (demo-shop + new qa tenant + console) | 25 PASS / 6 FAIL: 4.2 contrast alert still shown after cancel; 4.4 restore-preset click not registered (Save disabled, dev server "Compiling"); 7 media delete toast missing; 9.3 "status badge missing" (row locator hit the toast li); 9.4 invite row not shown in 20 s (action still spinning, dev server compiling); 11.1 console table rows=25 without demo-shop | SCRIPT only (tooling/qa/admin-journey.ts): isolateHmr on the admin + signup contexts; 4.2 asserts the text/background line ("ข้อความหลักกับพื้นหลัง") appears and disappears on cancel — the alert may legitimately stay because the saved #0ea5e9 primary fails the newer primary-as-text 4.5:1 check (core/theme resolve.ts, intended); 4.4 waits for the preset card to be pressed before Save; 7 media delete is now detail → confirm dialog (usage check, ADMIN_B2 media fix) → helper deleteOpenMedia; 9.3 row locator excludes [data-sonner-toast] (toast now names the host) and DNS copy matches "เพิ่ม 2 record นี้ที่ผู้ให้บริการโดเมนของคุณ" + TXT _rentweb.<host> + CNAME + rentweb-verify=; 9.4 wait 60 s; 11.1 console list is paginated 25/page newest first → asserts the new qa tenant on page 1 and finds demo-shop via ?q= Run 2: 29 PASS / 2 FAIL (all 6 earlier failures pass) — new: 5.6 and 6 "new toast not shown (had 1)": expectToast counted matching toasts, and the previous identical toast ("เผยแพร่แล้ว" from 5.5 / first "บันทึกเมนูนำทางแล้ว" in 6) expired exactly as the new one appeared (count 1 → 1) — timing race in the script, the UI state was right (FAQ removed, publish enabled). SCRIPT: expectToast now marks on-screen toasts (data-qa-seen) and waits for an unmarked matching one; 9.3 / 9.4 first delete leftover pending qa-*.example.com domains / qa-invite-* invitations of an interrupted run. Run 3: 30 PASS / 1 FAIL — 4.4 save spinner still pending after 20 s while the shared dev server showed "Compiling" (screenshot: card selected, "มีการเปลี่ยนแปลงที่ยังไม่บันทึก", button spinning) — environment latency, not product. SCRIPT: expectToast default timeout 20 s → 45 s. | **run 4: 31/31 PASS** (demo-shop afterwards: theme preset aurora, colors {}, no qa domains / invitations — tooling/qa/bughunt/fixes/_rv-admin-check.ts) |
| qa/restaurant-admin-journey.ts (demo-restaurant) | 15/15 PASS (first run) | nothing | 15/15 PASS |
| qa/booking-admin-journey.ts --no-shots (demo-salon + demo-clinic) | 19/19 PASS (first run; ran with the new pay-at-shop / deposit-notice code already on disk) | nothing | 19/19 PASS |
| qa/commerce-admin-journey.ts --no-shots (demo-shop) | 17/17 PASS (first run) | nothing | 17/17 PASS |

## Hand-scripted flows

Script: tooling/qa/bughunt/fixes/reverify-admin-flows.ts (`--only A,B,C,D`). Run 1: 39 PASS / 2 FAIL (B4, B6 script bug below); run 2 (A,B): 16/16 PASS. Fresh tenants: qa-rv-shop-u8hf / qa-rv-salon-u8hf (owner qa-rv-u8hf@example.com), qa-rv-shop-ce4w (qa-rv-ce4w@example.com).

| flow | result | notes |
|---|---|---|
| A signup → onboarding (shop template) → Settings > Payments → PromptPay → storefront checkout (script tooling/qa/bughunt/fixes/reverify-admin-flows.ts, run 1: qa-rv-shop-u8hf) | 9/9 PASS | new tenant has no receiver (payments.enabled only); status card data-ready=false "ลูกค้ายังชำระเงินออนไลน์ไม่ได้…"; checkout (real page, cart made with the commerce service + rw_cart cookie) has no PromptPay option; PromptPay 0812345678 saved via the form → core paymentSetupStatus ready, card "ลูกค้าชำระเงินออนไลน์ได้แล้ว · PromptPay QR → 081-234-5678"; checkout offers "สแกน PromptPay" after 4 s |
| B page builder (home of the new shop) | run 1: 4/6 — B4 preview + B6 live publish FAILED because the script added an FAQ with no items (FaqSection returns null without items — script bug, not product) | draft save: sections have the FAQ, published_sections untouched, pages.title unchanged (new title only in draft_meta), live storefront unchanged; publish: published_sections + title copied, draft_meta cleared. Script now adds one Q/A item (as admin-journey 5.2). Run 2 (`--only A,B`, qa-rv-shop-ce4w): A 9/9 + B 6/6 PASS — preview popup URL /preview?token=… shows the draft FAQ, live page shows it 3 s after publish |
| C Settings > Domains on the new trial tenant | 6/6 PASS | row "รอตั้งค่า DNS" + TXT _rentweb.<host> = rentweb-verify=… + CNAME; DB pending/custom/verifiedAt null; GET with Host: <custom host> → 404 while the own subdomain → 200; removed via UI |
| D salon without receiver (follow-ups, new qa-rv-salon-u8hf) | 23/23 PASS | services page notice (data-waived=true, "มี N บริการ…", link to settings/payments) at 1440 + 390 without sideways scroll; service form notice under the deposit switch; aroma-90 booking (createBooking, same as /api/booking) = confirmed, deposit 0, payAtShop, no payment; day chip + week row show "ชำระที่ร้าน", chip time not pushed out; detail header badge + deposit card "ไม่ได้เก็บมัดจำ · ชำระที่ร้าน" (1440 + 390, no sideways scroll); adminReschedule BK-1001 → BK-1002 keeps payAtShop; after PromptPay the services notice is gone and old bookings keep their label; no page errors |

## Follow-ups implemented

| item | files | verify |
|---|---|---|
| Booking admin shows "ชำระที่ร้าน" for answers.payAtShop (platform_b4 / admin_final follow-up ADMIN_B2-04) | packages/modules/booking/src/admin/bookings.ts (CalendarBooking.payAtShop from answers->>'payAtShop', AdminBookingDetail.payAtShop), packages/modules/booking/src/admin/labels.ts (PAY_AT_SHOP_LABEL / PAY_AT_SHOP_DETAIL), apps/admin/src/app/t/[slug]/bookings/{page.tsx, day-grid.tsx, week-list.tsx}, bookings/[id]/{page.tsx, booking-panels.tsx} | day chip badge (data-testid pay-at-shop-chip, in title too; time kept unshrunk), week row badge, detail header badge (pay-at-shop-badge), price line "(ชำระที่ร้าน)", DepositCard "ไม่ได้เก็บมัดจำ · ชำระที่ร้าน" + explanation (pay-at-shop) instead of the wrong "บริการนี้ไม่ต้องชำระมัดจำ". reverify-admin-flows.ts D4–D9, D11 |
| REAL REGRESSION fixed: admin reschedule dropped answers.payAtShop | packages/modules/booking/src/admin/bookings.ts createAdminBooking (copies payAtShop + depositWaivedReason from the booking it replaces, like the customer reschedule in services/bookings.ts) | before: an admin-moved pay-at-shop booking lost the flag (deposit 0 but nothing told staff to collect payment). reverify-admin-flows.ts D8/D9 |
| Services page warns when a service needs a deposit but the shop has no receiver | packages/modules/booking/src/admin/config.ts (depositSetupStatus: paymentSetupStatus().ready + bookingDepositMethods() — same rule as createBooking; waived vs cash-only), apps/admin/src/app/t/[slug]/services/{deposit-setup-notice.tsx (new), page.tsx, service-form.tsx (depositNotice prop), new/page.tsx, [id]/page.tsx} | amber role=status notice only when module deposits are on, the shop is not online-ready and ≥1 active service needs a deposit; copy "ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน — บริการที่ต้องมัดจำจะรับจองแบบชำระที่ร้าน" (cash-only variant says the deposit must be paid in cash at the shop) + link ตั้งค่าช่องทางรับเงิน; the service form shows it under the deposit switch while it is on. reverify-admin-flows.ts D2, D3, D10. Admin typecheck (tsc --noEmit) clean |

## Housekeeping

- My very first admin-journey launch (run ma0i) was started with `&` inside a background shell; its log was cut but the process kept running and overlapped run 1 (ghb8) on demo-shop. Effects: run 1 captured the theme mid-run (preset quartz) and restored that; ma0i/ghb8 left pending domains qa-ma0i/qa-ghb8.example.com and invitation qa-invite-ghb8 on demo-shop. Undone with tooling/qa/bughunt/fixes/_rv-admin-theme.ts (theme.preset back to the seed's "aurora", other theme keys unchanged; those two domains + the invitation deleted; invalidateTenant). Some run-1 timing failures may also come from this overlap.

## For other owners


- None. No wrong-for-a-user behaviour found outside my ownership. Observation only: a new shop tenant gets `payments.enabled.cod = true` from the template, so before any receiver is set the checkout still takes COD orders (the delivery option that can be paid is pre-selected). That matches the ADMIN_B2-05 design, so it is not filed as a bug.

## Final status

- admin-journey 31/31, commerce-admin-journey 17/17, restaurant-admin-journey 15/15, booking-admin-journey 19/19.
- Hand flows A–D all PASS (reverify-admin-flows.ts: run 1 C+D 29/29, A 9/9; run 2 A+B 16/16).
- Product changes: booking admin pay-at-shop display, admin reschedule keeps payAtShop, Services deposit-receiver notice. `tsc --noEmit` for apps/admin is clean. Nothing committed.
