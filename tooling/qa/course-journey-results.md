## Course journey – 2026-10-17T21:36:23.777Z (BKK 2026-10-18, week 2026-10-19, student 0972876522)

| Step | Result | Detail |
| --- | --- | --- |
| C1 /classes catalog + level filter | PASS | 8 classes; beginner + pilates filters ok; overflow=0px |
| C2 /classes/hatha-basic: syllabus, instructor, upcoming sessions with seats, สมัครเรียน preselects a session | PASS | cta /book?service=hatha-basic&date=2026-10-19&start=2026-10-19T00%3A30%3A00.000Z |
| C3 /schedule week view, instructor + level filters, week navigation | FAIL | instructor filter leaks other instructors |
| C4 /instructors + /instructors/kru-nan | PASS | 4 instructors, profile ok |
| C5 enrol as guest from the timetable → details prefilled from the session → ค่าเรียน → PromptPay slip → confirmed | FAIL | instructor missing from the summary |
| C5b timetable seat count drops by one after the enrolment | FAIL | expected 9 seats left, timetable says 10 |
| C6 OTP login → /account shows คลาสของฉัน + คลาสพาสของฉัน; /account/bookings lists the class | FAIL | needs C5 |
| C7 /packages → buy คลาสพาส 5 ครั้ง → slip → pass active with 5 sessions | FAIL | locator.waitFor: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for getByText('ยอดชำระ') to be visible[22m |
| C8 enrol with the pass from the timetable → ใช้สิทธิ์คอร์ส → confirmed, no payment, 4 sessions left | FAIL | needs C7 |
| A1 admin calendar: one chip per class session with n/seats in the instructor's column | PASS | 3 session chips (2/12, 2/12, 5/6) |
| A2 admin booking detail: instructor, seats and the roster of the session | FAIL | needs C5 |
| A3 admin cancels the enrolment → seat freed (admin badge − 1, storefront timetable + 1) | FAIL | needs A2 |
| A4 admin services: seats + level on the list, sessions editor on the class page | PASS | 8 class rows; hatha editor 3 sessions |
| M1 mobile 390: home, /classes, /schedule (day tabs), class detail – no horizontal overflow | PASS | / ok, /classes ok, /classes/hatha-basic ok, /schedule?week=2026-10-19 ok |
| M2 desktop home screenshot + sections present (no placeholders) | PASS | overflow=0px |

**7 passed, 8 failed**

