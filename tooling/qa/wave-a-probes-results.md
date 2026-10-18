# Wave-A edge / security probes — 2026-10-18T02:56:50.061Z

PASS 3 · NOTE 0 · FAIL 0

| ID | Status | Probe | Info |
|---|---|---|---|
| C1 | PASS | enrol in a full session: the last seats go, the next guest gets slot_taken, /schedule shows เต็ม, cancel frees the seats | Reformer Pilates Basic 2026-10-19 00:00Z filled with 1 seat(s); /schedule เต็ม; overbook + party-of-2 → slot_taken |
| C2 | PASS | class pass with 0 sessions left cannot pay for an enrolment (package_not_usable) | pass "คลาสพาส 5 ครั้ง" (1/5) set to 0 left → package_not_usable; restored |
| C3 | PASS | instructor time-off (closed override) hides that instructor's session from the timetable and /schedule | ครูมุก 2026-10-18 10:00Z hidden; other sessions that day 0; direct enrol → invalid_slot |
