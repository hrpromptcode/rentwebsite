# Wave-A edge / security probes — 2026-10-18T07:29:11.768Z

PASS 14 · NOTE 3 · FAIL 0

| ID | Status | Probe | Info |
|---|---|---|---|
| H1 | PASS | min nights: 1 night on family-villa (min 2) is refused by the API, /stay and /stay/book |  |
| H2 | PASS | max advance (365 days): beyond the horizon → too_far; calendar marks it unbookable |  |
| H3 | PASS | guests > max: deluxe-garden max 3 → too_many_guests; 0 / 51 guests → 400; /stay?guests=7 offers nothing |  |
| H4 | NOTE | same-day check-in after check-in time (14:00): booking today at 20:00 BKK | NOTE: same-day booking at 20:00 is accepted (stay ST-1023, pending 2026-10-18T13:45:00.000Z); no same-day cut-off exists in moduleConfig.rental – product decision, not a bug |
| H5 | PASS | overlapping holds expire: a pending slip stay holds the last villa, the sweep releases it after hold + grace | sweep {"expired":1,"skipped":0,"errors":0}, reason "หมดเวลาชำระเงิน" |
| H6 | PASS | late cancellation (inside 7 days) keeps the deposit; the guest page says so before and after | late: kept 87000 satang, refundDue 0; early: refundDue 87000 |
| H7 | NOTE | /stays/[id]: no key / wrong key / unknown id all render the same no-oracle card; the key or the owner opens it | NOTE: 200 + identical card for missing and unauthorised ids (same as /bookings/[id]); non-uuid → 404 |
| H8 | PASS | cross-tenant: another tenant host cannot read a demo-hotel stay, calendar or quote | demo-shop: 404; demo-course: 404; qa-hotel (rental enabled): card, calendar 404, quote unit_type_not_found |
| H9 | PASS | race: 4 guests book the last villa for the same nights at once → exactly one stay, the rest unavailable | 1 winner (ST-1027), 3 × unavailable |
| H10 | PASS | cleanup: every QA stay (source = qa) on demo-hotel is cancelled | 16 QA stays, all cancelled by their own step |
| C1 | PASS | enrol in a full session: the last seats go, the next guest gets slot_taken, /schedule shows เต็ม, cancel frees the seats | Reformer Pilates Basic 2026-10-19 00:00Z filled with 1 seat(s); /schedule เต็ม; overbook + party-of-2 → slot_taken |
| C2 | PASS | class pass with 0 sessions left cannot pay for an enrolment (package_not_usable) | pass "คลาสพาส 5 ครั้ง" (1/5) set to 0 left → package_not_usable; restored |
| C3 | PASS | instructor time-off (closed override) hides that instructor's session from the timetable and /schedule | ครูมุก 2026-10-18 10:00Z hidden; other sessions that day 0; direct enrol → invalid_slot |
| C4 | PASS | race: 4 students enrol for the last seat at once → exactly one booking, the rest slot_taken | Reformer Pilates Basic 2026-10-19: 1 winner, 3 × slot_taken, session full |
| L1 | PASS | denied consent on LINE → /account/login?error=line_denied (Thai message), ticket cleared | denied → line_denied + Thai copy |
| L2 | NOTE | replay of a used callback (code + state) is refused without the ticket; the used ticket is single-use in the browser | NOTE: a stolen ticket cookie + the same mock code logs in again (the dev mock issues stateless codes; real LINE rejects a reused code with invalid_grant, and the browser's ticket cookie is cleared on first use). No server-side used-state list – acceptable, documented. |
| L3 | PASS | unlink when LINE is the only login is refused server-side (no_other_login) and the link stays | Mock Tester: no_other_login, link intact |
