## Events customer journey – 2026-10-19T01:28:26.854Z (guest 0973220783, order TK-1091)

| Step | Result | Detail |
| --- | --- | --- |
| E1 home: featured-event hero with countdown + ซื้อบัตร, upcoming grid, highlights, organizer, FAQ | PASS | overflow=0px |
| E2 /events: upcoming/past tabs, category chips, search | PASS | tabs, search, empty state and category filter ok |
| E3 /events/riverside-live: cover, when/where + map, ticket states (closed early bird, not-yet-open door, VIP remaining), JSON-LD | PASS | overflow=0px |
| E4 quote API: 2 regular + 1 VIP priced, promo RIVER10 -10 %, closed → sales_closed, not open → sales_not_started, VIP overflow → sold_out, 11 tickets → max_per_order | PASS | total ฿4,270, promo −฿178, closed/not_started/sold_out/max_per_order refused |
| E5 buy widget: 2 Regular + 1 VIP → attendee names → guest contact → summary → ชำระเงิน → /tickets/[id]?k= pending with hold countdown | PASS | TK-1091 01a151c5-626e-71ae-9bb4-79922f2cbea3 pending ฿4,270 |
| E6 slip → paid (DEV_AUTO_APPROVE_SLIPS) → 3 e-tickets with QR, holder names, codes, add-to-calendar / share / print | PASS | TK-1091 paid, 3 tickets 2FZE-2WAG-ZJLT 92NX-XPL5-NTHZ KM82-EWV9-NXZR |
| E7 .ics download route returns a calendar with the event, venue and holder count | PASS | 1009 bytes, 1 VEVENT |
| E8 public single-ticket view /tickets/t/[code]: QR + first name only, no phone / e-mail / other holders | PASS | first name 'สมหญิง', code KM82-EWV9-NXZR, unknown code 404 |
| E9 access rules: order page without the key is refused for anonymous visitors; wrong key refused; key works | PASS | anonymous / wrong key refused, key ok |
| E10 second buyer cannot exceed the remaining VIP quantity (counters, quote API, widget cap) | PASS | remaining 5 → 4; 5 refused by API, widget capped at 4 |
| E11 unpaid order holds 1 VIP (quote for the rest is refused) → customer cancel releases it (counters + quote) | PASS | 01a151c5-cf4c-72d7-921c-1006a4315dfb held then released; VIP remaining back to 4 |
| E12 OTP login as the buyer → /account links บัตรของฉัน → /account/tickets lists the paid order → owner opens it without a key → history tab | PASS | TK-1091 listed and opened as the owner |
| M1 mobile home: hero, countdown, cards, no horizontal overflow | PASS | overflow=0px |
| M2 mobile /events | PASS | overflow=0px |
| M3 mobile /events/[slug]: sticky buy bar scrolls to the picker; picker usable at 390 | PASS | overflow=0px |
| M4 mobile /tickets/[id] paid: tickets stack, QR readable | PASS | overflow=0px |
| M5 mobile public ticket + cancelled order views | PASS | overflow=0px |

**17 passed, 0 failed**

Console errors [desktop]:
- Failed to load resource: the server responded with a status of 404 (Not Found)
