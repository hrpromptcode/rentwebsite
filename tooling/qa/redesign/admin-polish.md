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
- run 2 (successor): 1440 shots → hydration mismatch on every table page: TableEnhancer set data-fit on containers
  streamed behind loading.tsx before their Suspense boundary hydrated. Fixed: only mark hydrated containers
  (__reactFiber$ key), retry 200 ms. Probe /console, /pages, /products → 0 errors.
- run 2 fixes: dashboard activity feed labels (all ~60 event types Thai, no raw "payment.created"; unknown → generic Thai);
  site preview finds nested `image.url`, crops 16:10 (w720 h450), real CTA label pill, ThaiWrap headline; DayBars empty
  note + gridlines; activity card sticky at lg; KPI `cta` footer for trendless linked tiles (dashboard only, aria-hidden);
  checkbox/switch 44px hit halo; dialog title line-height 1.45 (Thai marks); toast shot → LINE copy button. typecheck green.
- run 2: 390 shots → 0 errors, 0 overflow on 28 targets. Added phone filter-bar rule (from/to date pair side by side,
  CSS :has, layout only); face-aware preview crop; -my-3 py-3 hit areas on dashboard host/edit links.
- run 2: journeys launched (tag run2) → _admin-polish-logs/run2-*.log, run2-summary.txt
- run2 admin-journey 30/31: 4.4 design-preset save toast timed out while admin showed 'Compiling' (my LF re-normalisation of 7 files mid-run triggered recompiles; 4.3 same toast path passed) → rerun at end; NO edits during journey runs
- run2 commerce 37/43: steps 2–4c hit a Turbopack Build Error page from packages/templates/src/corporate.ts (another agent's transient unterminated string, since fixed) → rerun at end
- run2 restaurant 10/15: step 1 is the STOREFRONT (apps/web) dine-in submit — button stuck pending under 'Rendering' (dev server load), 2–5 cascade (order undefined) → rerun
- run2 topup 4/18: step 3 storefront waitForURL 120s timeout → cascade; 12 = wallet 404 (demo-topup data changed mid-run), 15 = save pending under 'Compiling' (shared packages being edited by other agents) → rerun
- run2 events 23/24 (9: attendees CSV export GET 30s timeout — first compile under load); rental 24/24; booking 19/19
- run 2 polish after journeys: empty-chart note on a card pill; stronger preview scrim (theme-bg 82→96% behind copy);
  phone date pair padding + 14px picker icon (no clipping); scrolling tables clipped to card radius. Reduced-motion pass
  (5 targets × 2 widths) clean: 0 errors/overflow, odometers show final values. Re-running the 5 non-green journeys (tag run3).
- run3: admin-journey 31/31, commerce 43/43; restaurant 14/15 (4: KDS item tick pending under 'Compiling'). Found: KDS sticky header (top-0) slides under the admin topbar when not fullscreen → fix after run3 (top-[var(--topbar-h)])
- run 4 (successor #2, 2026-10-22): run3 topup 16/18 — 10 = REAL BUG from my sticky headers: a page wrapper with its own
  overflow (topup orders `relative overflow-x-auto` around the shared table) became the sticky scroll container, so
  `top: var(--topbar-h)` pushed <thead> 64px down over the first row (TP link "not stable/visible"). Fix: TableEnhancer
  marks data-fit=1 only when no ancestor up to <body> has overflow other than visible/clip. 9 = journey data-dependency
  (queue held only C+D → EmptyState after batch, no "เลือกแล้ว 0"; page behaviour unchanged since 0247e33) → journey now
  also accepts "ไม่มีรายการรอเติม". KDS header sticks under the topbar when not fullscreen. events 8 = "Target crashed"
  (browser), restaurant 4 = pending under 'Compiling' → rerun.
- run4 launched (all 7, tag run4) after the sticky-trap + KDS fixes; typecheck green; topup orders table verified (no overlap, 0 errors)
- run4 (all 7): commerce 43/43, restaurant 15/15 (KDS fix ok), events 24/24, rental 24/24 GREEN; topup 14/18 — steps 9 + 10
  now pass (sticky fix confirmed); 8/11/14 = toast missed while the action sat under 'Rendering' (dev server load), 17 =
  goto 30 s timeout; admin-journey 27/31 (3 dashboard goto 120 s while Turbopack recompiled 69 s + cache compaction and
  another agent's broken packages/templates/src/clinic.ts; 4.1–4.3 design editor same window); booking 0 (login
  waitForURL 60 s while compiling "/"). All env → rerun those 3 (tag run5).
