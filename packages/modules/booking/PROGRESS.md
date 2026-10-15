# Booking module + Clinic add-on – progress

## DONE
- packages/modules/booking: services (config, time, catalog, availability slot engine, bookings, clinic), labels, actions (createBookingAction), components (booking-wizard, month-calendar, slot-picker, reschedule-panel, cards), sections (booking-widget, service-list, staff-grid, package-list), register.ts (sections + payment handlers "booking"/"patient_package").
- Tests: test/availability.test.ts, bookings.test.ts, clinic.test.ts (21 passing). Typecheck green.
- Templates salon.ts/clinic.ts: settings.payments added; reset-demo salon + clinic re-run.
- apps/web routes written: api/booking/{slots,days}, /book, /services, /services/[slug], /staff, /staff/[slug], /bookings/[id] (page, actions.ts, booking-actions.tsx, ics/route.ts), /account/bookings, /packages, /packages/[id]/buy (page, actions.ts, buy-form.tsx), /account/packages, /account/packages/[id] (page, actions.ts).

## REMAINING
1. DONE: typecheck web green; screenshots salon /book /services + clinic /packages /book taken and reviewed (no overflow).
2. curl checks of each route on demo-salon / demo-clinic; screenshots (demo-salon /book /services /bookings/<id>; demo-clinic /packages /book) desktop+mobile; fix visual issues.
3. Browser E2E: book → pay deposit (slip auto-approve) → /bookings/[id] confirmed → /account/bookings; clinic: buy package → /account/packages.
