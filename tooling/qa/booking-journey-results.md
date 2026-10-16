## Playwright journey – 2026-10-15T20:28:09.899Z (BKK 2026-10-16)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1002 2026-10-18 10:30 → /bookings/01a1413d-a047-744a-aa74-918a89fb57f8?k=myqNq293Fd4r2XZx73eKyA |
| S2x booking page is private: no key / wrong key / ics without key | FAIL | apiRequestContext.get: getaddrinfo ENOTFOUND demo-salon.localhost \| Call log: \| [2m  - → GET http://demo-salon.localhost:3000/bookings/01a1413d-a047-744a-aa74-918a89fb57f8/ics[22m |
| S7a salon .ics download with key | FAIL | apiRequestContext.get: getaddrinfo ENOTFOUND demo-salon.localhost \| Call log: \| [2m  - → GET http://demo-salon.localhost:3000/bookings/01a1413d-a047-744a-aa74-918a89fb57f8/ics?k=myqNq293Fd4r2XZx73eKyA[22m |
| S4 double booking same staff+slot via server action → slot_taken | FAIL | expected slot_taken message, got:  |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | FAIL | needs S4 |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-18 10:30 → 2026-10-20 10:00 |
| S5b cancel from booking page (policy allows) | FAIL | apiRequestContext.get: getaddrinfo ENOTFOUND demo-salon.localhost \| Call log: \| [2m  - → GET http://demo-salon.localhost:3000/bookings/01a1413d-d605-774c-a23b-71c43739e852/ics?k=ajR3p3a4WGWAzmdzXcuFqw[22m |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 10:00 (6.6h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | FAIL | page.waitForFunction: Timeout 30000ms exceeded. |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: พญ.ณิชา วรรณกุล 139x28; จองกับพญ.ณิชา วรรณกุล 200x36; นพ.กันต์ ศิริวัฒน์ 125x28; จองกับนพ.กันต์ ศิริวัฒน์ 189x36; ทพญ.พิมพ์ชนก ตั้งใจ 157x28; จองกับทพญ.พิมพ์ชนก ตั้งใ 215x36; จองคิว 38x20 |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | FAIL | page.waitForFunction: Timeout 30000ms exceeded. |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-19 11:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → slip → confirmed / deposit paid (mobile) | FAIL | page.waitForFunction: Timeout 30000ms exceeded. |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 2 upcoming |
| C7 clinic .ics as owner (no key) | FAIL | apiRequestContext.get: getaddrinfo ENOTFOUND demo-clinic.localhost \| Call log: \| [2m  - → GET http://demo-clinic.localhost:3000/bookings/01a1413f-6957-7599-bb2b-e4b1f6714fba/ics[22m |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | FAIL | needs S4 |

**11 passed, 10 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/book net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-ad3925d2bf73 net::ERR_ABORTED
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a1401b-ad12-7546-8f7f-bb020e71d441&staff=01a1401b-ad75-764e-84ca-b1c32c9d9800 net::ERR_ABORTED
