## Playwright journey – 2026-10-21T22:39:11.813Z (BKK 2026-10-22)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1008 2026-10-24 10:30 → /bookings/01a1609c-ecdd-7604-9adf-29fef217e109?k=Se_Qdej95aMqSf0gF18ZqA |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-25 16:30 A=01a1609d B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-24 10:30 → 2026-10-25 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 10:00 (4.4h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a1609d 12:00: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-25 16:30: 01a1609d holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a1609d-db0b-752c-a6c7-597e2731af23: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 2 คอร์ส · เหลือรวม 10 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-24 11:30; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a1609e 13:00: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 4 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**26 passed, 0 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16073-1acf-74ac-b737-d7cd1baee666&staff=01a16073-1b23-77a6-a2ca-752ce485da3a net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16073-1acf-74ac-b737-d7cd1baee666&staff=01a16073-1b23-77a6-a2ca-7072c0315eec net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16073-1acf-74ac-b737-f2fe46ae3fe7&party=2 net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a16073-1acf-74ac-b737-d7cd1baee666&staff=01a16073-1b23-77a6-a2ca-752ce485da3a net::ERR_ABORTED
Console errors [clinic-mobile]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
