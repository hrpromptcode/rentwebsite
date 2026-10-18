## Playwright journey – 2026-10-18T07:48:48.810Z (BKK 2026-10-18)

| Step | Result | Detail |
| --- | --- | --- |
| S1a salon /services lists services | PASS | 8 services, overflow=0px |
| S1b salon /services/[slug] detail + category filter | PASS |  |
| S1c salon /staff lists therapists | PASS |  |
| S2 salon /book wizard: thai-60 → ใครก็ได้ที่ว่าง → date → slot → details → confirmed | PASS | BK-1019 2026-10-20 10:30 → /bookings/01a14dfa-c037-77de-a8bc-58b009cc83b6?k=841YEGuRXWX1hS_LkAQyQQ |
| S2x booking page is private: no key / wrong key / ics without key | PASS |  |
| S7a salon .ics download with key | PASS | 793 bytes |
| S4 double booking same staff+slot via server action → slot_taken | PASS | 2026-10-21 21:00 A=01a14dfa B rejected |
| S4b /api/booking/slots + /days validation and cross-tenant isolation | PASS | days=31, cross-tenant 404 ok |
| S5a reschedule from booking page (policy allows) → new booking, old cancelled | PASS | 2026-10-20 10:30 → 2026-10-21 10:00 |
| S5b cancel from booking page (policy allows) | PASS |  |
| S5c policy: booking inside cancelHours shows too_late and hides actions | PASS | today 16:00 (1.2h ahead) → too_late shown |
| S3 salon deposit booking (aroma-90) → PaymentPanel → slip → confirmed / deposit paid | PASS | 01a14dfb 16:30: slip uploaded, PaymentPanel says ชำระเงินสำเร็จ |
| S3b salon: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after the deposit is paid | PASS |  |
| S6 couple package (capacity 2, 2 seats per booking): staff step skipped, one booking fills the slot, next customer blocked | PASS | 2026-10-22 16:30: 01a14dfb holds both seats; next customer sees the slot disabled |
| C1 clinic /services + /staff (mobile) | PASS | overflow ok; small targets: none |
| C6a clinic /packages lists packages; buy requires login | PASS | 3 packages, redirected to login |
| C6b OTP login (dev code shown inline) → back to buy page | PASS | logged in as 0899001122 |
| C6c buy package → payment → slip → package active | PASS | /account/packages/01a14dfb-980a-7430-9ad0-f2313b2759f5: slip uploaded, panel says ชำระเงินสำเร็จ |
| C6c2 clinic: patient package flips to ใช้งานได้ after payment | PASS |  |
| C6e /account/packages lists the purchased package (mobile) | PASS | ใช้งานได้ 4 คอร์ส · เหลือรวม 20 ครั้ง |
| C2 clinic logged-in booking: consult (free) → details prefilled → confirmed (mobile) | PASS | 2026-10-20 12:00; small gridcells: 0; small chips: 0 |
| C3 clinic deposit booking (botox ฿500) → PaymentPanel → slip (mobile) | PASS | 01a14dfb 14:30: slip uploaded, panel says ชำระเงินสำเร็จ |
| C3b clinic: booking flips to ยืนยันแล้ว / ชำระมัดจำแล้ว after deposit (mobile) | PASS |  |
| C6d /account/bookings lists the logged-in customer's bookings | PASS | 8 upcoming |
| C7 clinic .ics as owner (no key) | PASS |  |
| C8 tenant isolation: salon key cannot open booking via clinic host; clinic customer cannot see salon booking | PASS |  |

**26 passed, 0 failed**

Console errors [salon-desktop]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a14831-6e13-754b-8160-d763d27a0a12&staff=01a14831-6e6c-7125-8434-1fd0b8418b9e net::ERR_ABORTED
- Failed to load resource: the server responded with a status of 400 (Bad Request)
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a14831-6e13-754b-8160-d763d27a0a12&staff=01a14831-6e6c-7125-8434-1933136d5bb8 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a14831-6e13-754b-8160-f243dd58ee79&party=2 net::ERR_ABORTED
- requestfailed: http://demo-salon.localhost:3000/book?service=couple net::ERR_ABORTED
Console errors [salon-anon]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
Console errors [salon-B]:
- requestfailed: http://demo-salon.localhost:3000/api/booking/days?month=2026-10&service=01a14831-6e13-754b-8160-d763d27a0a12&staff=01a14831-6e6c-7125-8434-1fd0b8418b9e net::ERR_ABORTED
Console errors [clinic-mobile]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
