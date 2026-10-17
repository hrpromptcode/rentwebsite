# admin_final packet (2026-10-17)

Scope: apps/admin/** (except pages/actions.ts and /topup) + packages/modules/booking/src/admin/ui/inputs.tsx (one label).
Verify script: `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/bughunt/fixes/admin_final-verify.ts <mode>`
(modes: shots, kpi, labels, focus, payments, checklist). Screenshots: tooling/screenshots/admin_final*.png.

| ID | Status | Files | Verification |
|----|--------|-------|--------------|
| KPI-390 (restaurant_admin_b4 follow-up) | FIXED | apps/admin/src/components/ui/kpi-card.tsx | Labels wrap (no `truncate`), text column is a container: while it is < 10rem the label reserves 2 lines (`@max-[10rem]:min-h-10`) so values in a row share a baseline; phone chrome p-4/gap-3/size-9 icon, value text-xl (sm: 2xl) with overflow-wrap:anywhere. `admin_final-verify.ts kpi`: 11 pages x 390 + 1440 (restaurant history/board/tables/reservations/menu, clinic visits, clinic + salon bookings, 3 dashboards) ALL PASS — no clipped/ellipsis label, no card past the viewport, value tops equal per row. Screenshots admin_final-kpi_*-390/1440.png. |
