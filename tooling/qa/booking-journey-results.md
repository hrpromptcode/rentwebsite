## Playwright journey – 2026-10-16T18:22:17.632Z (BKK 2026-10-17)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1033 2026-10-19 10:30 → /bookings/01a145f0-4865-7615-a3f9-c02a551719de?k=yVczX62a3N1wp0WePSvgZw |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | FAIL | locator.waitFor: Error: strict mode violation: getByText('เลือกเวลา') resolved to 2 elements: \|     1) <h3 class="font-heading text-xl font-semibold md:text-2xl">เลือกเวลา</h3> aka getByRole('heading', { name: 'เลือกเวลา' }) \|     2) <p role="alert" class="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-destructive/10 p-3 text-sm text-destructive">…</p> aka getByText('เวลานี้เพิ่งถูกจอง |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-19 10:30 → 2026-10-20 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 12:30 (11.2h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a145f1 10:00: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 group service (couple, capacity 2): staff step skipped, 'เหลือ n ที่' chips, seats decrement, full slot blocked | FAIL | expected 'เหลือ 2 ที่' on chip, got '12:00' |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a145f2-3f8d-71d5-90c1-d7fea6bb3510: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 2 คอร์ส · เหลือรวม 10 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-19 12:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a145f2 14:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 6 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**24 passed, 2 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b40319dc8aa8 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=foot-60 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-d73a846a1f96&party=2 net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=thai-60&staff=mali net::ERR_ABORTED
Console errors [clinic-mobile]:
- requestfailed: http://demo-clinic.localhost:3000/account/login?next=%2Fpackages%2F01a1401b-c3ae-70ed-b669-6cf28ba43a6a%2Fbuy net::ERR_ABORTED
- requestfailed: http://demo-clinic.localhost:3000/packages/01a1401b-c3ae-70ed-b669-6cf28ba43a6a/buy net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 404 (Not Found)
