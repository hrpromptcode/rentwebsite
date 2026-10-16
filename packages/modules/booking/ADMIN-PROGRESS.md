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

- [x] (run 3) admin/clinic.ts: `openVisitFromBooking` (find/register patient from a booking → createVisit), `userNames` (access-log names);
      clinic/actions.ts `openVisitFromBookingAction`; clinic/form-values.ts (patient/package/visit form state, ageFrom, patientName)
- [x] /clinic/patients list (search HN/name/phone, pagination, ?new=1 opens dialog), create-patient-dialog.tsx (#pt-first/#pt-last/#pt-phone/#pt-allergies,
      button "สร้างประวัติผู้ป่วย"), patient-form.tsx (IdentityFields/MedicalFields/PatientEditForm)
- [x] /clinic/patients/[id] (logs view in record_access_logs before reading; allergy alert; mini KPIs; visit history; edit form;
      patient-panels.tsx: PatientPackages (ใช้ 1 ครั้ง + sell), ConsentsCard (switch + timestamp/version/by), OpenVisitButton; access log card)

- [x] /clinic/visits (date nav, status tabs, search, KPIs, visits table, "นัดหมายที่รอเข้าตรวจ" queue → openVisitFromBookingAction),
      visit-dialogs.tsx (CreateVisitDialog: patient search role=option, #vc-complaint, submit "เปิดการตรวจ"; OpenFromBookingButton)
- [x] /clinic/visits/[id] (logs view; allergy alert; payment strip) + visit-form.tsx (vitals #v-bp/#v-hr/…, #v-notes encrypted,
      #v-diagnosis, procedures from services, prescriptions, before/after PhotoList with upload, totals + discount, "บันทึกการตรวจ",
      complete dialog cash/transfer/none → completeVisitAction, cancel, use package session for this visit)
- [x] /clinic/packages (cards grid, active switch, edit/create dialog, delete with FK guard) — packages-manager.tsx
- [x] Module gate: clinic/layout.tsx shows "โมดูลคลินิกไม่ได้เปิดใช้" for tenants without the clinic module
- [x] typecheck admin + module green (run 3)

- [x] journey extended (run 3): walkIn() helper; 10b procedure+Rx → complete cash → payments row paid; 10c create package;
      10d consent toggle + sell package + ใช้ 1 ครั้ง ×2 → exhausted; 10e delete refused → close sale; 10f clinic walk-in →
      queue "ลงทะเบียน + ตรวจ" → visit linked to booking (new patient) → cancel visit. Clinic steps 7–10f PASS individually.

- [x] Full journey run 3: 18/18 PASS. Found + fixed a vacuous step 5 (it picked a requiresStaff=false service / a staff whose seed
      Monday is OFF → "0 → 0") and a destructive 5b (re-opened Monday unconditionally with shop hours → corrupted พี่แอน's seed
      schedule; repaired: Monday rule deleted again). Step 5 now picks a staff-bound service with Monday slots (17 → 0) and 5b
      restores the exact original Monday hours, verified in availability_rules.

- [x] Screenshot review run 3 → fixes: patient mini-KPIs 2-up on phone, per-patient avatar colours, patient save bar sticky
      only when dirty, visits KPI labels shortened (+hints), visit payment method label (เงินสด/โอนเงิน), calendar toolbar
      date input no longer overflows its card at 390, services table: provider column only at 2xl (was clipping the
      "เปิด" switch at 1440), deposit badge on its own line / in the subline on phone (names were squeezed to 0 at 390)

- [x] Services table phone: price/switch columns w-px + 2-line names; visits filter compact on phone; packages sorted
      active-first; journey step 13 removes QA packages ("คิวเอ คอร์ส %") that the UI can't delete once sold.
- [x] FINAL (run 3): journey 19/19 PASS end-to-end, no 5xx/pageerrors, no page-level overflow at 390;
      `pnpm --filter @rentweb/admin --filter @rentweb/module-booking typecheck` green.

## REMAINING
- nothing from the brief. Known leftovers: each journey run leaves QA patients/visits/bookings ("คิวเอ …") in demo-salon /
  demo-clinic (payments rows are real records, so they are not deleted); every router.refresh() of a patient/visit page
  logs another "view" in record_access_logs (by design: each render is a view).
- [ ] screenshots 1440/390 review + polish
- [ ] tooling/qa/booking-admin-journey.ts + screenshots 1440/390
