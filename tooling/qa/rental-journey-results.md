## Rental (hotel) customer journey – 2026-10-18T02:34:56.915Z (BKK 2026-10-18, stay 2026-11-17 → 2026-11-19, guest 0990838654)

| Step | Result | Detail |
| --- | --- | --- |
| C0 pick free dates for the single villa from /api/rental/calendar | PASS | 2026-11-17 → 2026-11-19 (blocked sample date 2026-11-08) |
| C1 home: stay-search hero, room grid, no placeholders | PASS | overflow=0px |
| C2 home search: pick check-in / check-out + 4 guests → /stay results list the villa | PASS | 2 results; villa → /rooms/family-villa?from=2026-11-17&to=2026-11-19&guests=4 |
| C3 /rooms: every type with from-price and check-in/out times | PASS | 5 room types |
| C4 /rooms/family-villa: calendar + live quote, breakfast add-on re-quotes, จองเลย → /stay/book | PASS | total ฿34,850 (room ฿31,250 + breakfast ฿3,600), deposit ฿10,455 |
| C5 /stay/book: guest details + consent → pending stay with PaymentPanel → slip → confirmed | PASS | ST-1008 01a14cdc-1fb1-746c-b537-11dc80a62754 confirmed, deposit ฿10,455 paid |
| C6 second guest cannot book the last unit for overlapping dates (API, /stay, /stay/book, widget) | PASS | remaining 0 for 2026-11-18→2026-11-20, 1 for 2026-11-19→2026-11-21 |
| C7 blocked date hides availability (calendar API, /stay results, room calendar) | PASS | 2026-11-08 blocked → remaining 0, calendar cell ปิดจอง |
| C8 guest page access: no key / wrong key refused, right key ok | PASS | anonymous → refused, key → ok |
| C9 OTP login as the guest → /account links การเข้าพักของฉัน → /account/stays lists the stay → owner opens it without a key | PASS | logged in as 0990838654; ST-1008 listed |
| M1 mobile 390: home, /rooms, /rooms/[slug], /stay/book, /stays/[id] render without horizontal overflow | PASS | / ok, /rooms ok, /rooms/family-villa ok, /stay/book ok, /stays/01a14cdc-1fb1-746c-b537-11dc80a62754 ok; calendar day 48px tall |
| C10 customer cancels within the free window → cancelled + unit released | PASS | ST-1008 cancelled, villa free again for 2026-11-17→2026-11-19 |

**12 passed, 0 failed**

