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

- [x] Fixes (run 2): slug regex allows \p{M}; optSlug is a real optional key (fixed categories-manager type errors);
      correlated subqueries use `qualified()` from `admin/sql.ts`; `getStaffAdmin` added; `ui/nav.tsx` (FilterTabs/Pagination/qs).
- [x] /services list (filters, toggles active/featured, categories manager), /services/new, /services/[id] (form + linked staff)
- [x] /staff list (cards + toggles, shop business-hours editor, shop closures), /staff/new, /staff/[id]
      (schedule-editor.tsx with inherit switch, time-off.tsx, staff-form.tsx with services multi-select)

- [x] /bookings day grid (staff columns + ไม่ระบุ, 30-min rows, lanes, now-line, click-empty-cell → walk-in) + week list,
      toolbar (prev/today/next/date/view/staff/status/search), KPIs; /bookings/new walk-in wizard (walk-in-form.tsx);
      /bookings/[id] (booking-panels.tsx: StatusActions, DepositCard, RescheduleCard, InternalNote) — journey steps 1-3 PASS
- [x] Fixed: raw sql`${col} < ${Date}` → lt()/gt() (postgres-js can't bind Date in raw sql → /staff 500);
      STATUS_ACTIONS.checked_in no longer offers no_show (transition refused it)
- [x] Tailwind in the admin app now scans packages/modules (@source in apps/admin/src/app/globals.css); the tw-safelist workaround was removed
- [x] tooling/qa/booking-admin-journey.ts (+ booking-admin-peek.ts page/overflow debugger, booking-admin-dbcheck.ts query checker)

## REMAINING
- [ ] /clinic/patients, /clinic/visits, /clinic/packages
- [ ] tooling/qa/booking-admin-journey.ts + screenshots 1440/390
