## Playwright journey – 2026-10-19T01:17:39.538Z (BKK 2026-10-19)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1002 2026-10-21 10:30 → /bookings/01a151ba-eb26-74fd-86fb-da6c3332ee36?k=uI1CEmkiUgDcGLLrhb4o5w |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-22 14:00 A=01a151bb B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-21 10:30 → 2026-10-22 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 12:30 (4.2h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a151bb 10:00: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-22 14:00: 01a151bb holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a151bb-cfca-73f1-99d2-16e94dc591c9: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 1 คอร์ส · เหลือรวม 5 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-21 11:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a151bc 11:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 2 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**26 passed, 0 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a151ac-d46a-7693-b980-0315895c2d01&staff=01a151ac-d4b8-7737-88ff-6c3947374d37 net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a151ac-d46a-7693-b980-0315895c2d01&staff=01a151ac-d4b8-7737-88ff-6a65fe89e2ce net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a151ac-d46a-7693-b980-1f7eae93cd3c&party=2 net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a151ac-d46a-7693-b980-0315895c2d01&staff=01a151ac-d4b8-7737-88ff-6c3947374d37 net::ERR_ABORTED
Console errors [clinic-mobile]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
