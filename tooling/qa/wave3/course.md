# Packet: course — คอร์สเรียน / สตูดิโอ (template "course", demo-course)

Started 2026-10-18. Built on the booking module. School: **"Sala Flow"** — โยคะ & พิลาทิส สตูดิโอ, อารีย์ กรุงเทพฯ.

## Design decisions (binding for successors)
- **Class = service** with `capacity > 1` + `requiresStaff = false` (seats only). New column `services.level`
  (`beginner|intermediate|advanced|all`, null = not a class level).
- **Class session (weekly timetable) = availability_rules row with `service_id` set** (new nullable FK column),
  `staff_id` = instructor, `weekday/start_time/end_time`. Rules with service_id are NOT working hours:
  `workingWindows()` ignores them, admin schedule editor / business-hours / dayHours readers filter `service_id IS NULL`.
- Slot engine: a service that has session rules yields exactly one slot per session (start = rule start, end = start+duration),
  `remaining` = capacity − enrolled seats, `Slot.staffId` = instructor (informational). Closed overrides (holiday / instructor off) drop the session.
- Enrolment = normal booking (`staffId` null because of the `bookings_no_overlap` GiST exclusion on staff_id),
  seats via `partySize`; the instructor is kept in `answers.instructorId` for display.
- Class passes = existing clinic package mechanism (`clinic_packages` / `patient_packages`), ungated by
  `moduleConfig.booking.packages: true` (`packagesEnabled(modules, moduleConfig)` in services/config.ts). Clinic unchanged.
- New theme preset: `loft` (warm plaster + terracotta + olive, Prompt/K2D display) — must pass theme-presets-contrast test.
- Admin: day grid groups enrolments of one class session into ONE chip "n/seats"; booking detail shows instructor + seats.

## DONE
- survey + design (above)
1. Schema (availability_rules.service_id, services.level) — migration 0008 generated AND applied (do not regenerate)
2. Engine (availability.ts: workingWindows ignores service rules, sessionRulesOf/hasClassSessions, one slot per session)
   + services/classes.ts (listClasses/getClassBySlug/listInstructors/getInstructorBySlug/listTimetable/upcomingSessions/weekStartOf)
   + test/classes.test.ts — booking vitest 58/58 green (2026-10-18 04:05)
3. packagesEnabled(modules, moduleConfig) + memberNumberPrefix in services/config.ts; /packages, /packages/[id]/buy,
   /account/packages(+[id]), package-list + pass-pricing sections use the gate
4. Wizard preselect date/start (+ instructor on slot chips / summary); /book reads ?date&start
5. Sections class-highlights / weekly-schedule / instructor-grid / pass-pricing registered (register.ts) + defs appended in
   packages/storefront/src/definitions/index.ts; components class-cards.tsx + week-timetable.tsx; labels.ts; ui.ts exports
7a. Preset "loft" in packages/core/src/theme/presets.ts (prompt/krub, waves hero)
- apps/web typecheck: only the known LINE-packet error (unlinkLineAction) remains — not ours

6. Routes DONE: apps/web .../{classes,classes/[slug],schedule,instructors,instructors/[slug]}/page.tsx; /account links
   "คลาสของฉัน" + "คลาสพาสของฉัน" (siteType course / packagesEnabled); /account/bookings course copy + pass sessions left;
   SessionRow weekday fixed. apps/web typecheck green.
7b. Template DONE: packages/templates/src/course.ts (Sala Flow: 3 categories, 8 classes w/ level + full prepayment,
   4 instructors, 20 weekly sessions, business hours, 3 passes, 6 sample students + enrolments incl. last week);
   registered in templates index, tooling/seed.ts + reset-demo.ts DEMO_NAMES, tooling/smoke.ts (demo-course paths)

8. DONE: demo-course provisioned (reset-demo --template course; tenant 01a14bbb-…), create-admin → admin owns demo-course.
   All storefront routes 200; timetable shows seats (reformer Mon 07:00 = เหลือ 1 ที่นั่ง).
8b. DONE: wizard/labels full prepayment copy (L.fullPay / L.fullPayNote; `fullPay` when deposit >= price)
9. Admin DONE (needs typecheck): admin/catalog.ts rule readers + saveSchedule filter service_id IS NULL, saveService level,
   saveClassSessions + re-export listClassSessionRules; admin/schemas.ts level + classSessionSchema(s) + CLASS_LEVEL_VALUES;
   admin/labels.ts CLASS_LEVEL_LABEL; admin/bookings.ts dayHours filter, CalendarBooking serviceCapacity/serviceRequiresStaff/
   instructorId (+ instructor filter), AdminBookingDetail.classSession; apps/admin: services table "คลาส N ที่นั่ง/รอบ · ระดับ"
   (data-testid class-seats), service form level select, services/[id] ClassSessionsCard (class-sessions.tsx + saveClassSessionsAction),
   calendar day grid ONE chip per class session "n/seats" (data-testid seats-chip) in the instructor's column, booking detail
   ครูผู้สอน + ที่นั่ง (booking-staff / booking-seats) + "ผู้เรียนในรอบนี้" card (class-session-card / class-session-seats)

9c. DONE: services/bookings.ts BookingDetail.instructor + listCustomerBookings staffName falls back to the session instructor;
    storefront /bookings/[id] shows it
10a. Journey written: tooling/qa/course-journey.ts (C1–C8 customer, A1–A4 admin, M1–M2 mobile/screens)

9b. DONE 04:35: typecheck green for @rentweb/module-booking, @rentweb/web, @rentweb/admin, @rentweb/templates;
    vitest booking 58/58; core provision-neutral (course template passes the brand/place/time scrub — neutralText pairs
    added for อารีย์ / 07:00 / story sentences) + theme-presets contrast (loft) green

10b-i. (successor 3, 2026-10-18 ~05:30) journey run #2: C3 passes now (the 04:34 failure was a stale module graph); C5 failed
    because the preselected session's slot (instructor) was fetched client-side after hydration and the summary raced the
    click to the confirm step. FIX: BookingWidgetSection loads that day's slots server-side (getSlotsForDate) and passes
    preselect.slots → wizard seeds its slots cache, so the instructor/seats are in the summary on first paint; the slots
    effect is keyed on `wantSlots` (time step or start set) instead of `step`, so details → confirm no longer aborts the
    fetch. typecheck module-booking + web green. Journey run #3 started.

10b. DONE 05:50: journey run #3 → 15/15 PASS (C1–C8, A1–A4, M1–M2), no console errors. Results in tooling/qa/course-journey-results.md.
10c. DONE: smoke demo-course 20/20 routes (desktop+mobile) 200; hydration demo-course / clean (only the reduced-motion notice).
     Full-page home review at 1440/390 with motion on (course-home-full-desktop/mobile.png): premium – fixed three template
     nits: class-highlights limit 3 (4 cards left an orphan row), features columns 4 (4th item orphaned), stats "4.9" rendered
     as "5" by the integer counter → replaced by "92% นักเรียนกลับมาเรียนต่อ".
10d. DONE 05:58: reset-demo --template course (tenant 01a14cce-4571-75a4-bd0b-9feb48febc9a) + create-admin; journey run #4 started.

## FINAL STATE (2026-10-18 06:15) — packet complete
- Journey run #4 against the re-provisioned demo-course: 15/15 PASS, no console errors (tooling/qa/course-journey-results.md).
- Booking vitest 58/58; salon/clinic regression tooling/qa/booking-journey.ts 26/26 PASS.
- Typecheck green: @rentweb/module-booking, @rentweb/web, @rentweb/templates (admin unchanged by this step).
- Screenshots reviewed: course-home-full-desktop/mobile.png (motion on, full page), course-classes-*, course-class-detail-*,
  course-schedule-*, course-admin-*.
- Files touched this step: packages/modules/booking/src/sections/booking-widget.tsx (server-side slots for a preselected session),
  packages/modules/booking/src/components/booking-wizard.tsx (preselect.slots seed, wantSlots effect key),
  packages/templates/src/course.ts (highlights limit 3, features columns 4, stats copy).
- Not done / ideas: waitlist for full sessions (optional in the brief, skipped); hero StatsRow is a shared section
  (grid-cols-2 sm:grid-cols-3) so the third hero stat wraps on 390 — left as is to avoid touching other templates.

## How to test
- Storefront: http://demo-course.localhost:3000 → / (hero, marquee, class highlights, 7-day timetable, instructors, passes,
  testimonials, FAQ), /classes (?level=beginner|intermediate|advanced|all, ?category=yoga|pilates|breath), /classes/hatha-basic,
  /schedule (?week=YYYY-MM-DD&instructor=kru-beam&level=advanced), /instructors, /instructors/kru-nan, /packages,
  /book?service=hatha-basic&date=…&start=… (details step with instructor + seats in the summary), /account (คลาสของฉัน, คลาสพาสของฉัน).
- Admin: http://localhost:3001/t/demo-course → /bookings?date=<Mon> (one chip per class session "n/seats", data-testid seats-chip),
  /bookings/<id> (ครูผู้สอน, ที่นั่ง, ผู้เรียนในรอบนี้), /services (คลาส N ที่นั่ง/รอบ · ระดับ), /services/<id> (level select + weekly sessions editor).
- Journey: `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/course-journey.ts` (15 steps; results in qa/course-journey-results.md,
  screenshots tooling/screenshots/course-*.png). Smoke: `pnpm --filter @rentweb/tooling smoke -- demo-course`.
  Hydration: `pnpm --filter @rentweb/tooling hydration -- demo-course --path /`.
- Unit: `pnpm --filter @rentweb/module-booking test` (58). Regression: `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/booking-journey.ts`.
- Re-provision: `pnpm --filter @rentweb/tooling reset-demo -- --template course && pnpm --filter @rentweb/tooling create-admin`.
