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

## REMAINING (in order)
1. Schema (availability_rules.service_id, services.level) + migration (lock!)
2. Engine + services/classes.ts + tests (packages/modules/booking/test/classes.test.ts)
3. packagesEnabled flag + ungate pages/sections
4. Wizard: preselect date/start (+ instructor on chips)
5. Sections: class-highlights, weekly-schedule, instructor-grid, pass-pricing (+ defs appended)
6. Routes: /classes, /classes/[slug], /schedule, /instructors, /instructors/[slug]; /account shows passes link
7. Preset "loft" + template course.ts + registrations (templates index, seed/reset-demo DEMO_NAMES, smoke/screenshot lists)
8. reset-demo --template course + create-admin
9. Admin: rule readers filter, grouped chips, booking detail, service form level + sessions editor
10. Journey tooling/qa/course-journey.ts; typecheck; vitest; smoke; screenshots

## How to test
- (filled in as parts land)
