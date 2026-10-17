## Playwright journey – 2026-10-17T03:17:14.708Z (BKK 2026-10-17)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1074 2026-10-19 13:30 → /bookings/01a147da-4bfc-731b-90b8-fe389dc9b4b0?k=90aHmxdcjMTcOfCVaUovAg |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 794 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-22 14:00 A=01a147da B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-19 13:30 → 2026-10-20 13:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 14:30 (4.3h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a147db 14:30: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-21 15:00: 01a147db holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a147dc-2a54-7219-b781-984fb35d3030: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 7 คอร์ส · เหลือรวม 35 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-19 14:30; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a147dc 14:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 16 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**26 passed, 0 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=thai-60&staff=mali net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-ba9856520582 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/bookings/01a147da-ec10-735e-b96a-b89464cd76ae?k=wH3RzuKBnKWwPAXnS-acoQ net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-d73a846a1f96&party=2 net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
Console errors [clinic-mobile]:
- requestfailed: http://demo-clinic.localhost:3000/book?service=botox net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 404 (Not Found)
