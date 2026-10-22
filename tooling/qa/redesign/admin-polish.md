# admin-polish progress (phase 3) — admin back-office craft pass (apps/admin/src/** minus editor internals + auth/onboarding)

## status
- 2026-10-22 started; baseline run of the 7 admin journeys → tooling/qa/redesign/_admin-polish-logs/baseline-*.log
  (runner: scratchpad run-journeys.sh = `cd tooling && pnpm exec tsx qa/<j>.ts` per journey, sequential)

## direction (decided)
- "night rail, paper desk": §4.1 identity — sidebar/drawer = night tokens scoped on the rail (#07080B family, coral dot
  wordmark RentWeb●, Unbounded), workspace = paper (#F3F1EC bg, white cards, #C2410C coral primary AA 5.2:1, violet #5B47E0
  accent), Anuphan headings, JetBrains Mono HUD labels (Latin/digits only; Thai never letter-spaced).
- no 3D anywhere in admin; motion = CSS only (indicator slide, odometer, sparkline draw, dialog/sheet/toast easing),
  all under prefers-reduced-motion: no-preference.

## journey hooks (must keep) — from reading the 7 journeys
- shell: `header button` hasText tenant name = switcher trigger (DOM-first visible one!), `[role=menu]` with
  `[role=menuitem] a[href$='/dashboard']` per tenant; button "เปิดเมนู" (mobile) → `[role=dialog] nav[aria-label='เมนูหลัก']`,
  Escape closes; at 390 the first `<aside>` must be display:none; no horizontal overflow at 390 on all admin routes
- dashboard: heading "สวัสดี, <tenant name>", `section[aria-label='ตัวเลขวันนี้']` with ≥ 2 direct children,
  text "เช็กลิสต์เริ่มต้นใช้งาน", EXACTLY ONE `[role=progressbar]` on the page, `ul.divide-y > li` ≥ 5 (checklist)
- impersonation banner role=status text "คุณกำลังดูหลังบ้านของ", button "ออกจากโหมดนี้"
- toasts: `[data-sonner-toast]` text; lists use `li:not([data-sonner-toast])`
- KpiCard values on module pages stay plain text (journeys read them) — Odometer only on the dashboard
- palette must not leave a `[role=listbox]` / `[role=option]` / `[role=dialog]` mounted while closed

## next
- shell (sidebar indicator, topbar, command palette, route progress), dashboard, page header, tables/empty/skeleton,
  dialogs/sheets/toasts/forms CSS, mobile 390, screenshots, typecheck, 7 journeys

## log
- baseline (before changes): admin-journey 31/31; commerce 42/43 (7 /shipping waitForURL 30s timeout, slow dev server);
  booking 18/19 (5b goto networkidle 90s timeout) — both env/timeouts; restaurant/topup/events/rental baseline aborted
- swap applied: shell (app-shell, nav-list, command-palette, table-enhancer), page-header, kpi-card, empty-state,
  sparkline, page-skeleton, dashboard (page, trends.ts, site-preview.tsx, queries trends), loading.tsx (t/[slug], console),
  settings-tabs underline, console KPIs; CSS inlined into app/globals.css (one file); typecheck green
- admin dev server hung on "Compiling /login" (0 CPU) → Turbopack panic "task is missing in memory or persistent storage"
  = corrupted persistent cache (9.2 GB). Fix: kill :3001, delete apps/admin/.next/dev/cache/turbopack, restart
  (Start-Process cmd /c "pnpm dev:admin > %TEMP%\rentweb-admin-dev.log"). Not caused by code.
