# storefront_booking_restaurant bughunt progress

- [done] booking-journey.ts: 24 pass / 2 fail (S4 = script strict-mode locator issue; product correctly rejected; S4b = SBR-003). Results copy: storefront_booking_restaurant-booking-journey-results.md (original tooling/qa/booking-journey-results.md restored)
- [done] restaurant-journey.ts original: broken by Node ENOTFOUND *.localhost (ctx.request) + aria-disabled click + hidden 19:00 chip; patched copy storefront_booking_restaurant-rest-journey.ts (dns patch, force click, show-more times) → log rest-journey2.log
- findings logged: SBR-001..006 (couple room oversold, abandoned deposits block slots, API date validation, group svc no staff time, stale table bill short-pay CRITICAL, sessions never expire)
- [running] 2-level crawl (crawl.ts → crawl.txt)
- [todo] booking deep-dive: reschedule unpaid deposit, ineligible staff, past slots, maxAdvance, closed days, account/bookings, packages use; restaurant: reservations overbooking (zone vs no-zone), party size vs seats, cart cookie size, sold-out, closed hours; mobile 390 checks
- [done] crawl 131 pages desktop (3 tenants, 2 levels): only /services/pico 404 → SBR-008 (proxy matcher)
- [done] booking deep-dive (book2.ts): SBR-009 resched unpaid → 'QR expired'; SBR-010 touch targets; OK: ineligible staff preselect falls back to staff step, API returns [] for ineligible staff, past/min-notice ok, maxAdvance ok (salon last 2026-11-15, calendar next disabled), closed days ok (clinic Sun, ann Mon)
- [done] restaurant deep-dive (rest2/rest3): SBR-011 cart cookie overflow, SBR-012 pickup after kitchen close, SBR-013 zone-less reservations not counted, SBR-014 party size ignored, SBR-015 no server max-advance; OK: sold-out card disabled + cart sheet flags, tracker live update ~6s, notes shown in cart
- [todo] mobile overflow sweep, /account/bookings, package booking CTA, bank-transfer method panel
- [done] mobile 390 overflow sweep: 82 pages, 0 overflow
- [done] book3: package purchase + CTA → SBR-016; /account/bookings ok; owner cancel without key ok; bank-transfer panel shows bank info ok
- [logged] SBR-017 (code review only, suspected): guest form email patched onto existing customer
- [done] FAB overlap check → SBR-018 (booking pages only; restaurant cart pages hide the FAB)
- FINAL: 18 findings (2 critical, 9 major, 7 minor) in storefront_booking_restaurant.jsonl (validated JSON)
