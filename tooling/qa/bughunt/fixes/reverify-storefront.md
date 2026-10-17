# Re-verify: storefront (key: storefront)

**Final: all green.** commerce-journey 46/46 (was 38/46), booking-journey 26/26 (was 23/26), restaurant-journey 34/34 (was 12/34),
smoke 76/76 (6 demo tenants x desktop/mobile; was 76/76), hydration.ts clean on all 6 demo homes + restaurant /t, /reserve, /menu, /order,
human-eye pass done (24 full-page shots, motion ON) — 6 product fixes (below), the rest were script updates for intended rule changes
or demo-data drift.

Date: 2026-10-17. Dev servers: storefront :3000, admin :3001 (not restarted by me).
Scope: commerce-journey (demo-shop, demo-cafe), booking-journey (demo-salon, demo-clinic), restaurant-journey (demo-restaurant),
smoke.ts, hydration.ts (6 demo homes), human-eye pass (home + one module page per tenant, 390 & 1440, motion ON).

## Results

| script / step group | result before | what changed (script or product, files) | result after |
|---|---|---|---|
| smoke.ts (6 demo tenants, demo-topup excluded = out of scope; 38 routes x desktop/mobile) | 76/76 PASS | none | 76/76 PASS |
| hydration.ts on / of demo-shop, demo-cafe, demo-salon, demo-clinic, demo-restaurant, demo-corporate | 6/6 clean: no errors, no hydration mismatch; only motion.dev's dev-only "Reduced Motion enabled" warning (the script forces reducedMotion) | none | 6/6 clean |
| commerce-journey 1c sort price_asc (demo-shop) | FAIL: first card is a leftover QA product ("หมดQA correctness stock2 …฿100"), not the seeded cheapest | SCRIPT tooling/qa/commerce-journey.ts: assert every card price is non-decreasing + seeded cheapest still listed (demo data accumulates QA products) | PASS (both tenants) |
| commerce-journey 2b / 7a header badge (demo-shop) | FAIL: badge "" within 15 s | none in product: probe _rv-badge-probe.ts shows add -> router.refresh() RSC carries the badge; dev RSC refresh took ~8 s alone, >15 s with 3 journeys running. SCRIPT: badge poll 15 s -> 45 s | PASS (badge 2 / 1) |
| commerce-journey 7b / 8 (demo-shop) | FAIL (cascade of 7a aborting before checkout) | none (follows 7a) | PASS |
| commerce-journey M mobile (demo-cafe) | FAIL: toast waitFor 10 s after awaiting the POST (toast opens optimistically on click and auto-hides ~4 s; slow dev POST outlived it; badge = 1 in screenshot, so the add worked) | SCRIPT: start watching for the toast before the click | PASS (both tenants) |
| commerce-journey console errors (shop + cafe) | FAIL: "Failed to load resource 400" = the deliberate invalid / unseeded coupon steps (POST /api/cart -> 400 {ok:false}); same in older runs (_journey-run2/3) | SCRIPT: ignore 400s whose console location is /api/cart; other errors now also print their URL | PASS (0 console errors both tenants) |
| commerce-journey all other steps | 38/46 PASS overall before | — | — |
| commerce-journey rerun 2 (after the script changes above) | 44/46: 7a FAIL (COD label never appears: DB shows seeded "เก็บเงินปลายทาง (COD)" + pickup set inactive at 2026-10-16T22:40Z by an admin QA run; 11 "QA ส่งด่วน …" methods added), 7b cascade (order placed with PromptPay) | SCRIPT: before 7a switch the seeded COD method on if inactive and restore its previous flag after 7b; restock the journey variants if < 4 / < 2 | PASS (7a/7b/8 green, COD order shows fee row; COD flag restored) |
| booking-journey S4 double booking (salon) | FAIL: strict-mode, getByText("เลือกเวลา") matches the step heading AND the slot_taken alert "…กรุณาเลือกเวลาอื่น" (B was correctly rejected) | SCRIPT: wait for h3[data-step="time"] (2 places) | PASS |
| booking-journey S6 couple (salon) | FAIL: expected "เหลือ 2 ที่" chips + 2 unrelated bookings in one slot | SCRIPT (intended rule: couple = one 2-seat booking): assert แพ็กเกจสำหรับ 2 ท่าน, no per-seat count, booking shows 2 ท่าน, next customer sees the slot disabled | PASS |
| booking-journey C1 clinic /services (mobile) | FAIL: "8 รายการ" missing — page says 7; DB: service `filler` inactive since 2026-10-16T22:42Z (admin QA run) | SCRIPT: expected count = active services in DB (S1a too) | PASS (7 รายการ = DB) |
| booking-journey other steps | 23/26 PASS before | — | — |
| restaurant-journey (all API steps 2.0, 2.10, 2.11, 4.3, 4.5, 5.0-5.3) | FAIL: `ctx.request` runs in Node → getaddrinfo ENOTFOUND demo-restaurant.localhost (Windows) — 2.4-2.9 cascade (no table token) | SCRIPT: `api(ctx)` helper sends to 127.0.0.1 with the tenant Host header + the context's cookies for that URL | PASS |
| restaurant-journey 1.3-1.6 modifier sheet | FAIL: add button is `aria-disabled` (still tappable, flags the required group); Playwright treats aria-disabled as not actionable → click timeout; 1.4-1.6 cascade | SCRIPT: assert aria-disabled=true, tap with force, expect the destructive highlight (same intent) | PASS |
| restaurant-journey 3.2 pickup slip | FAIL: expected ชำระเงินสำเร็จ | SCRIPT (intended rule: ?p= phone-only proof never auto-approves): expect "ได้รับสลิปแล้ว รอตรวจสอบ", no QR, API payment pending_verification, paymentStatus≠paid, survives reload | PASS |
| restaurant-journey 4.0 reserve 19:00 | FAIL: radio 19:00 not rendered — only first 12 chips shown, rest behind "แสดงเวลาอื่น (n)" (intended) | SCRIPT: open "แสดงเวลาอื่น" when needed. PRODUCT: a deep-linked `/reserve?time=19:00` (past chip 12) hid the selected chip → reserve-form.tsx starts expanded when the preselected time is beyond the first 12; script 4.1 now asserts the deep-linked chip is aria-checked | PASS |
| restaurant-journey 4.2 / 4.4 | FAIL (cascade of 4.0: no reservations made; 4.4 opened /reservations/undefined) | — | PASS |
| restaurant-journey console | Hydration failed on /t/<qr> (and table-counter) for reduced-motion visitors | PRODUCT: table-panel.tsx (see Product regressions 1) | no hydration errors (rerun 5) |
| restaurant-journey overall | 12/34 PASS | — | — |
| restaurant-journey rerun 2 | 31/34: 1.6 FAIL (rw_rcart cookie is now a cart id — SBR-011 intended: lines in localStorage), 4.2 FAIL (strict mode: Next's route announcer is a 2nd role=alert), 4.4 FAIL (the phone prompt "…เพื่อเปิดดูรายละเอียดการจอง" matched the substring check — false positive); console: one reserve hydration error = my reserve-form edit landing mid-run (old client chunk vs new server HTML; `_rv-hyd-mobile.ts` on the same URL afterwards: no errors) | SCRIPT: 1.6 asserts cookie = cart id + localStorage {id, 2 lines}; 4.2 targets `p[role=alert]`; 4.4 checks the details heading + guest name | PASS (34/34 from rerun 3) |
| booking-journey rerun 2 | 23/26: S6 + C1 now PASS; S4 FAIL (A's `pickSlot(s, 2)`: the picked day had < 3 free พี่มะลิ slots after earlier runs) → S4b, C8 "needs S4" | SCRIPT: pickSlot falls back to the last free chip when fewer remain | PASS (26/26 from rerun 3) |
| restaurant-journey rerun 3 | **34/34 PASS**; console: 1 hydration error on /reservations/RS-…?p= right after booking + 1 React key warning (OrderTracker, pickup) | PRODUCT: SuccessBurst (see Product regressions 5). Key warning: not reproducible (`_rv-key-probe.ts` replays pickup PromptPay+slip, cash, wrong phone, lookup — no warning) → noted, dev-only | 34/34 PASS (rerun 5); only the key warning left |
| booking-journey rerun 3 | **26/26 PASS** | — | 26/26 |
| commerce-journey final (shop + cafe) | 44/46 (rerun 2) | (script changes above; log: COD was inactive → switched on for step 7 and restored) | **46/46 PASS**, 0 console errors |
| booking-journey final (salon desktop + clinic mobile) | 23/26 (baseline) | (script changes above) | **26/26 PASS** |
| restaurant-journey final | 12/34 (baseline) | (script + product changes above) | **34/34 PASS**; console still showed (a) "A tree hydrated but some attributes … didn't match" on /reservations/<n> (SuccessBurst circle `initial` depended on useReducedMotion) → PRODUCT fix, see Product regressions 5; `_rv-hyd-reserve.ts` (now also captures console.error) → clean; (b) the OrderTracker key warning (dev-only, not reproduced outside the journey) |

## Product regressions found

1. **Restaurant table page hydration mismatch for reduced-motion visitors** (found by restaurant-journey console log + `hydration.ts demo-restaurant --path /t/<qr>`):
   `table-panel.tsx` rendered the pulsing status dot only when `!useReducedMotion()`; the hook is null on the server and true on a
   reduced-motion client's first render, so React threw "Hydration failed … server rendered HTML didn't match" and re-rendered the
   whole table tree client-side. Fix: always render the dot and gate the pulse in CSS (`motion-safe:animate-pulse`)
   — packages/modules/restaurant/src/components/table-panel.tsx. Verify: `hydration.ts demo-restaurant --path /t/01a14020-a1-w9ntoj` → clean (was 1 pageerror).

2. **/reserve deep link hid the preselected time** (`/reserve?date&time=19:00&size&zone`, used by "จองอีกครั้ง"-style links and the journey):
   only the first 12 time chips render until "แสดงเวลาอื่น" is tapped, so a preselected 19:00 had no visible checked chip.
   Fix: packages/modules/restaurant/src/components/reserve-form.tsx — `showAllSlots` starts true when the preselected time is past chip 12.
   Verify: restaurant-journey 4.1 asserts the deep-linked chip is visible + aria-checked.

3. **Fullscreen hero photo covered only the top third on phones** (human-eye pass, demo-restaurant home @390, motion ON and OFF):
   `Parallax`'s inner motion wrapper had no height, so the hero `<Img className="size-full">` took its natural aspect height
   (~260 px of a ~775 px hero); the white h1 "รสชาติบ้าน ที่คิดถึง" sat half on a light-grey gradient. Fix:
   packages/ui/src/motion/parallax.tsx — inner `motion.div` gets `h-full` (auto-height Parallax uses are unaffected).
4. **Transparent header was dark-on-dark over the fullscreen hero** (same pass): HeaderShell switches to white text when a
   `[data-hero-dark]` element exists, but no section ever set it, so the logo "บ้านริม" and the menu icon were dark brown on the
   dark photo. Fix: packages/storefront/src/sections/hero.tsx — the fullscreen variant marks itself `data-hero-dark` when it is
   the first section; packages/storefront/src/shell/header-shell.tsx re-detects on every client navigation (usePathname), since the
   header persists across pages. Verify: `_rv-top.ts demo-restaurant / 390` → header color rgb(255,255,255), photo fills the hero
   (screenshots/rvtop-demo-restaurant-_-390-0.png).

5. **Reservation confirmation page hydration failure for reduced-motion visitors** (restaurant-journey 4.x console; reproduced with
   `_rv-hyd-reserve.ts`: book → /reservations/RS-…?p= → "Hydration failed", diff = SuccessBurst `<span>` dots vs none):
   SuccessBurst rendered its burst dots from `!useReducedMotion()` (null on the server, true on the client). Fix:
   packages/modules/restaurant/src/components/order-confirmation.tsx — dots mount only after hydration (mounted && !reduce), and the
   check circle/path use the same `initial` on server and client (no useReducedMotion branch; MotionRoot's reducedMotion="user" already
   skips the scale for those visitors), which removes the follow-up "attributes didn't match" warning.
6. **Thai repetition mark ๆ could start a line in animated headings** (human-eye pass: demo-salon hero @390 wrapped
   "หายใจเข้าช้า / ๆ แล้วปล่อย / ให้เราดูแล"): TextReveal renders each segment as an inline-block, so the space before ๆ was a
   break point. Fix: packages/ui/src/motion/text-reveal.tsx — `glueMaiYamok()` joins "word ๆ" into one part with a no-break space
   (words granularity only, segmentation still server-side). Regression check: tooling/qa/bughunt/fixes/_rv-yamok-unit.ts → PASS.

## For other owners

- **Admin QA suites leave demo data dirty (owner: admin re-verify / tooling reset-demo).** Seen today on the storefront:
  demo-shop seeded shipping "เก็บเงินปลายทาง (COD)" and "รับที่ร้าน (เชียงใหม่)" switched off (2026-10-16T22:40Z) and 11
  "QA ส่งด่วน XXXXX" methods added (checkout lists 13 options); image-less "QA เสื้อยืดทดสอบ …" / "QA correctness …" products
  fill the home "คอลเลกชันล่าสุด" strip and the top of /products; demo-clinic service `filler` deactivated (22:42Z);
  demo-salon lists "คิวเอ ทรีตเมนต์ 945". The storefront journeys now tolerate this (DB-derived counts, COD switched on/restored,
  sort asserted by order), but the public demo homes look like a test shop. Suites should delete what they create or reset-demo
  should run after them.
- (info, no bug) The cart badge in the header is server-rendered and refreshed by `router.refresh()` after add-to-cart; on the dev
  server that RSC refresh takes ~8 s (up to >15 s with parallel suites). An optimistic client badge would make it instant; not
  needed for production latency.

## Notes

- Smoke excludes demo-topup (out of scope): `smoke.ts demo-shop demo-cafe demo-clinic demo-salon demo-restaurant demo-corporate`.
- Final smoke after all product edits: 76/76 PASS. Final hydration after all product edits: clean (only motion.dev's dev-only
  "Reduced Motion enabled" warning, caused by the scripts forcing reducedMotion).
- Human-eye pass: `_rv-eye-shots.ts` (home + /products | /products/croissant | /book | /services | /menu | /services at 1440 and 390,
  reducedMotion no-preference, scroll-through so reveals play) → automatic checks: 0 headings left invisible, 0 horizontal overflow,
  0 console errors on all 24; contact sheets (`_rv-sheets.ts` → screenshots/rvsheet-*.png) looked at once: Thai intact, no overlaps
  besides the fixed LINE/dev "N" buttons; found fixes 3, 4 and 6. Re-shot after the fixes (restaurant + salon) → OK.
  `_rv-header-nav.ts`: header white over the restaurant hero, dark after client navigation to /menu, white again on back (390 + 1440) → PASS.
- Unresolved, dev-only: restaurant-journey's pickup context logs once per run "Each child in a list should have a unique key prop —
  Check the render method of `OrderTracker`. It was passed a child from RestaurantOrderPage." The keyed lists in OrderTracker look
  correct and `_rv-key-probe.ts` (pickup PromptPay order + slip + reload, cash order, wrong phone, lookup) does not reproduce it;
  no user-visible effect (React dev warning only).
- Helper/probe scripts added (tooling/qa/bughunt/fixes/): `_rv-badge-probe.ts`, `_rv-cod-probe.ts`, `_rv-ship.ts`, `_rv-svc.ts`,
  `_rv-host-probe.ts`, `_rv-eye-shots.ts`, `_rv-sheets.ts`, `_rv-crop.ts`, `_rv-top.ts`, `_rv-hyd-mobile.ts`, `_rv-hyd-reserve.ts`
  (books + cancels 2 reservations), `_rv-key-probe.ts` (creates 2 pickup orders), `_rv-header-nav.ts`, `_rv-yamok-unit.ts`.
- Demo data touched by the scripts: commerce-journey restocks LINEN-SHIRT-SAND-M/-L or the croissant only when below 4/2 (did not
  trigger today) and switches demo-shop's seeded COD method on for step 7 and back off afterwards (it was off).
- No git writes; dev servers not restarted.
