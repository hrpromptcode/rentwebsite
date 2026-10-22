## Playwright journey – 2026-10-22T08:13:12.638Z (BKK 2026-10-22)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1001 2026-10-24 10:30 → /bookings/01a162a5-0f1d-7387-9547-9ed7292b85a2?k=1LiEVkevOBjT5mkSwen5gQ |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-25 14:00 A=01a162a5 B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-24 10:30 → 2026-10-25 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 16:30 (1.4h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a162a6 10:00: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-25 12:00: 01a162a7 holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | FAIL | locator.waitFor: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for getByText('ชำระเงินสำเร็จ') to be visible[22m |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | FAIL | page.goto: Navigation to "http://demo-clinic.localhost:3000/account/packages/01a162a8-83d5-72d8-970d-989d20634f30" is interrupted by another navigation to "http://demo-clinic.localhost:3000/account/packages/01a162a8-83d5-72d8-970d-989d20634f30" \| Call log: \| [2m  - navigating to "http://demo-clinic.localhost:3000/account/packages/01a162a8-83d5-72d8-970d-989d20634f30", waiting until "load"[22m |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 1 คอร์ส · เหลือรวม 5 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-24 11:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a162aa 11:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 2 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**24 passed, 2 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a162a2-2ee4-75f0-86db-0c82b340f222&staff=01a162a2-2f39-74ec-8401-f79a1d6e4e35 net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a162a2-2ee4-75f0-86db-0c82b340f222&staff=01a162a2-2f39-74ec-8401-f3e252804174 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=aroma-90 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a162a2-2ee4-75f0-86db-2b1d93471a00&party=2 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=couple net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a162a2-2ee4-75f0-86db-0c82b340f222&staff=01a162a2-2f39-74ec-8401-f79a1d6e4e35 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=thai-60&staff=mali net::ERR_ABORTED
Console errors [clinic-mobile]:
- requestfailed: http://demo-clinic.localhost:3000/account/login?next=%2Fpackages%2F01a162a1-df85-736b-9bbe-f094e0cad98c%2Fbuy net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 404 (Not Found)
