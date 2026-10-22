## Playwright journey – 2026-10-22T05:26:53.303Z (BKK 2026-10-22)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1001 2026-10-24 10:30 → /bookings/01a1620d-57da-752f-82e1-93c951fe57c5?k=rY3mpHvCzv3KvjWvUztGCg |
| S2x booking page is private: no key / wrong key / ics without key | FAIL | page.goto: Timeout 90000ms exceeded. \| Call log: \| [2m  - navigating to "http://demo-salon.localhost:3000/bookings/01a1620d-57da-752f-82e1-93c951fe57c5?k=wrongkey", waiting until "load"[22m |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-25 14:00 A=01a16210 B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-24 10:30 → 2026-10-25 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 13:30 (1.1h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a16211 10:00: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-25 12:00: 01a16211 holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a16212-4735-73bd-8842-f9953345376c: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 1 คอร์ส · เหลือรวม 5 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-24 11:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a16213 11:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 2 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**25 passed, 1 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16205-2484-76a2-869e-86afbdf7cba4&staff=01a16205-24d3-73f5-a768-7a5fb706afae net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16205-2484-76a2-869e-86afbdf7cba4&staff=01a16205-24d3-73f5-a768-7669d5c24702 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=foot-60 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16205-2484-76a2-869e-a3337b0f9fce&party=2 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=couple&_rsc=mmx9apGodgHTlX5- net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=couple net::ERR_ABORTED
Console errors [salon-anon]:
- requestfailed: http://demo-salon.localhost:3000/bookings/01a1620d-57da-752f-82e1-93c951fe57c5?k=wrongkey net::ERR_ABORTED
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16205-2484-76a2-869e-86afbdf7cba4&staff=01a16205-24d3-73f5-a768-7a5fb706afae net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=thai-60&staff=mali net::ERR_ABORTED
Console errors [clinic-mobile]:
- requestfailed: http://demo-clinic.localhost:3000/account/login?next=%2Fpackages%2F01a16205-0050-75ef-9865-b934fc0add65%2Fbuy net::ERR_ABORTED
- requestfailed: http://demo-clinic.localhost:3000/account/login?next=%2Fpackages%2F01a16205-0050-75ef-9865-b934fc0add65%2Fbuy&_rsc=t2GVpq0KdlDbBHze net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 404 (Not Found)
