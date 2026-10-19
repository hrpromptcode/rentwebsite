## Course journey – 2026-10-19T01:24:35.657Z (BKK 2026-10-19, week 2026-10-26, student 0972984001)

| Step | Result | Detail |
| --- | --- | --- |
| C1 /classes catalog + level filter | PASS | 8 classes; beginner + pilates filters ok; overflow=0px |
| C2 /classes/hatha-basic: syllabus, instructor, upcoming sessions with seats, สมัครเรียน preselects a session | PASS | cta /book?service=hatha-basic&date=2026-10-21&start=2026-10-21T11%3A30%3A00.000Z |
| C3 /schedule week view, instructor + level filters, week navigation | PASS | 20 sessions, 20 open |
| C4 /instructors + /instructors/kru-nan | PASS | 4 instructors, profile ok |
| C5 enrol as guest from the timetable → details prefilled from the session → ค่าเรียน → PromptPay slip → confirmed | PASS | BK-1034 hatha-basic 2026-10-26 07:30 (10 seats before) |
| C5b timetable seat count drops by one after the enrolment | PASS | 10 → 9 |
| C6 OTP login → /account shows คลาสของฉัน + คลาสพาสของฉัน; /account/bookings lists the class | PASS | logged in as 0972984001 |
| C7 /packages → buy คลาสพาส 5 ครั้ง → slip → pass active with 5 sessions | PASS | /account/packages/01a151c1-d5c0-705c-8758-b694c4072b30 |
| C8 enrol with the pass from the timetable → ใช้สิทธิ์คอร์ส → confirmed, no payment, 4 sessions left | PASS | BK-1035 mat-pilates 2026-10-26 18:30 → 4 left (01a151c1) |
| A1 admin calendar: one chip per class session with n/seats in the instructor's column | PASS | 3 session chips (3/12, 1/12, 5/6) |
| A2 admin booking detail: instructor, seats and the roster of the session | PASS | 3/12 ที่นั่ง; roster ok |
| A3 admin cancels the enrolment → seat freed (admin badge − 1, storefront timetable + 1) | PASS | 3 → 2; storefront 10 |
| A4 admin services: seats + level on the list, sessions editor on the class page | PASS | 8 class rows; hatha editor 3 sessions |
| M1 mobile 390: home, /classes, /schedule (day tabs), class detail – no horizontal overflow | PASS | / ok, /classes ok, /classes/hatha-basic ok, /schedule?week=2026-10-26 ok |
| M2 desktop home screenshot + sections present (no placeholders) | PASS | overflow=0px |

**15 passed, 0 failed**

