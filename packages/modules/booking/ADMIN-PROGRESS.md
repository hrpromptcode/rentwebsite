# Booking + clinic back-office — progress

Successor notes: all admin queries live in `packages/modules/booking/src/admin/*.ts` (server only, exported as
`@rentweb/module-booking/admin`). Client components may import ONLY `…/admin/labels`, `…/admin/schemas`, `…/admin/ui`
(no drizzle). Pages live under `apps/admin/src/app/t/[slug]/{bookings,services,staff,clinic}`.

## DONE
- [x] Module admin layer: `labels.ts`, `schemas.ts` (zod + FormResult), `config.ts` (loadModuleConfig via admin db),
      `catalog.ts` (services/categories/staff CRUD, weekly schedule, time-off), `bookings.ts` (calendar queries,
      detail, transitions, cancel, deposit approve/reject/refund/cash, admin slots, walk-in + reschedule),
      `clinic.ts` (patients, consents, access log, packages use/sell, visits CRUD + complete/payment, package CRUD),
      `ui/inputs.tsx` (MoneyInput, NativeSelect, SlipPreview, ImageField, StatusPill, Avatar). Module typecheck green.

## REMAINING
- [ ] /services pages
- [ ] /staff pages (form, schedule editor, time-off, business hours)
- [ ] /bookings calendar, /bookings/new walk-in, /bookings/[id]
- [ ] /clinic/patients, /clinic/visits, /clinic/packages
- [ ] tooling/qa/booking-admin-journey.ts + screenshots 1440/390
