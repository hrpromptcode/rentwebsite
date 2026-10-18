# Packet: rental (hotel template + rental module)

Status: STOREFRONT HALF DONE (agent 3, 2026-10-18): template hotel + demo-hotel + customer journey 12/12 + smoke green + typecheck green. The ADMIN half (packages/modules/rental/src/admin/**, apps/admin/**, tooling/qa/rental-admin-journey.ts) is owned by the admin agent.

## Plan
1. schema packages/db/src/schema/rental.ts (+ index export + migration 0007)      ✅
2. package packages/modules/rental services + tests                               ✅ (tests: 2 nested-tx bugs fixed, see below)
3. core modules registry (rental adminNav/routes/permissions) + preset "riviera"   ⏳
4. storefront section definitions (stay-search, room-grid) + module sections/components/register.ts
5. storefront routes apps/web rw/[tenantId]/{rooms,rooms/[slug],stay,stay/book,stays/[id],account/stays,api/rental}
6. admin routes apps/admin t/[slug]/rental/{bookings,bookings/[id],calendar,units,units/[id],rates,settings}
7. template packages/templates/src/hotel.ts + registrations (templates index, seed/reset-demo DEMO_NAMES, smoke ROUTES)
8. provision demo-hotel (reset-demo --template hotel + create-admin); journey tooling/qa/rental-journey.ts; screenshots; smoke

## DONE
- 2026-10-18 agent 3: package.json exports "./client" + "./actions" added (apps/web typecheck was failing on '@rentweb/module-rental/client'); typecheck green for @rentweb/module-rental, @rentweb/storefront, @rentweb/web
- 2026-10-18 agent 3: packages/templates/src/hotel.ts written (บ้านทะเล เขาหลัก / Baan Talay Khao Lak, Khuk Khak beach, Khao Lak: 5 unit types, 4 rate rules, blocked dates, 5 extras, 7 sample stays; pages home/facilities/location/about/contact/legal; preset riviera; neutralText pairs for every location string) + registered in templates index, tooling/seed.ts + reset-demo.ts DEMO_NAMES, tooling/smoke.ts ROUTES demo-hotel; @rentweb/templates typecheck green; demo-hotel provisioned (reset-demo --template hotel + create-admin)
- 2026-10-18 agent 3: every demo-hotel storefront route renders 200 (/, /rooms, /rooms/[slug], /stay, /stay?from&to&guests, /stay/book, /facilities, /location, /about, /contact, /privacy; /account/stays 307 → login); packages/core/test/provision-neutral.test.ts 9/9 green with hotel; rental vitest 35/35 green (6 s now)
- 2026-10-18 agent 3: tooling/qa/rental-journey.ts written + 12/12 PASS (C0 free-date discovery via calendar API, C1 home, C2 hero search → /stay, C3 /rooms, C4 room calendar + breakfast re-quote → /stay/book, C5 book → pending → slip → confirmed, C6 second guest refused on the last unit (API remaining 0, /stay unavailable, /stay/book guard, widget sold out; back-to-back from the check-out day still free), C7 blocked date (API blocked/bookable=false, /stay, calendar cell ปิดจอง), C8 access key rules, C9 OTP login → /account/stays → owner access, M1 390 shots + no overflow + 48px calendar targets, C10 free cancel → unit released → history tab); results in tooling/qa/rental-journey-results.md, screenshots tooling/screenshots/rental-*.png
- 2026-10-18 agent 3 (after screenshot/smoke review): apps/web/src/components/page-body.tsx treats "stay-search" as a hero (HERO_TYPES) so the transparent riviera header sits on the photo instead of a cream band; stay-widget.tsx loads calendar months through shared in-flight promises (no AbortController → no `requestfailed` under React's dev double-effect; smoke was red on /rooms/[slug]); hotel template contact.mapUrl is an embeddable Google Maps URL (…&output=embed, same as restaurant) so /location + /contact iframes load; demo-hotel re-provisioned (tenant id changes on every reset-demo) + create-admin re-run; journey 12/12 again; `pnpm --filter @rentweb/tooling smoke -- demo-hotel` all 18 checks green; typecheck green: @rentweb/module-rental, @rentweb/storefront, @rentweb/templates, @rentweb/web
- verified present + wired: register.ts (sections stay-search/room-grid + payment hooks paid/closed/target/access), components (book-form, extras-picker, guest-stepper, quote-breakdown, range-calendar, room-card, stay-search-form, stay-widget), routes rooms, rooms/[slug], stay, stay/book, stays/[id] (+cancel/renew actions), account/stays (complete; /account links to it when the rental module is on), api/rental/{calendar,quote}; core modules registry has "rental"; preset "riviera" exists
- packages/db/src/schema/rental.ts (rental_unit_types, rental_rate_rules, rental_blocked_dates, rental_extras, rental_stays), schema/index.ts export, migration 0007 applied
- packages/core/src/payments/registry.ts: PaymentRefType += "stay"
- packages/modules/rental: package.json (exports ".", "./register", "./services", "./sections", "./components", "./ui", "./labels", "./time", "./admin", "./admin/labels", "./admin/schemas", "./admin/ui"), src/labels.ts, src/services/{time,config,catalog,pricing,availability,stays}.ts, test/{helpers,pricing.test,availability.test,stays.test}.ts
- apps/web + apps/admin package.json dependency lines (pnpm install already ran: node_modules/@rentweb/module-rental linked)
- typecheck @rentweb/module-rental green

## REMAINING
- storefront half: nothing (see "Not done / nice-to-have" below)
- admin half: whatever the admin agent lists (apps/admin/**, src/admin/**, rental-admin-journey.ts)

## Not done / nice-to-have (storefront)
- notification handlers for stay.* events (packages/integrations is not ours) – events are emitted and ignored
- tooling/qa/_rental-peek.ts is a throw-away DB peek script (safe to delete)
- the hotel template's seasonal rules are anchored to the provisioning year (Nov 1 → Feb 28 of the current/next season, New Year, green season of the following year); re-provision yearly for demo freshness

## For admin agent
- no service signature changed. Only small storefront-side edits: packages/modules/rental/package.json (exports "./client", "./actions"), src/components/stay-widget.tsx (calendar fetch), apps/web/src/components/page-body.tsx.
- demo-hotel was re-provisioned twice today (reset-demo --template hotel); its tenant id is now 01a14cdb-70b8-7069-b793-8902aa6f307f – read by slug, not by id. Sample stays: ST-1001 checked_in (pool villa V1), ST-1002 checked_out, ST-1003 confirmed arriving today (family villa), ST-1004/1005/1006 confirmed upcoming, ST-1007 cancelled; the journey leaves one cancelled ST-10xx per run.
- the customer journey books the family villa (quantity 1) for today+30 → +32 and cancels it at the end; blocked dates: family villa today+21..+23, deluxe-garden today+45.

## Decisions
- refType for payments: "stay"; number ST-1001…; accessKey (?k=) for guest pages
- check-out exclusive; dates stored as YYYY-MM-DD (date column, mode string); all civil-date math in services/time.ts (UTC-based)
- availability = quantity − overlapping holding stays (pending only while holdUntil > now) − blocked; pg_advisory_xact_lock per (tenant, unitType) + re-check inside createStay
- moduleConfig.rental: checkInTime, checkOutTime, freeCancelDays, depositPercent, allowFullPayment, allowPayAtProperty, maxAdvanceDays, maxNights, holdMinutes (services/config.ts, every field defaulted)
- preset key "riviera" (cream/sand/gold; heading trirong, body sarabun, display taviraj)
- section types: "stay-search" (hero + date-range search form), "room-grid" (unit types with from-price); amenities/gallery/testimonials/cta reuse core sections
- notification handlers for stay.* events are NOT added (packages/integrations is not ours); events are emitted and ignored by the outbox until a handler exists

## Known issues / notes for the successor
- test/stays.test.ts had two nested-transaction deadlocks (paymentRow()/stayRow() called INSIDE s.tx on single-connection PGlite) → tests timed out at 60 s and wedged the rest; fixed by reading the row before entering the tx.
- vitest for this module is slow (~5 min, PGlite import ~2 min); run it in the background.

## How to test
- pnpm --filter @rentweb/tooling reset-demo -- --template hotel && pnpm --filter @rentweb/tooling create-admin   (http://demo-hotel.localhost:3000)
- MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/rental-journey.ts   (12 steps, ~70 s, screenshots tooling/screenshots/rental-*.png, results tooling/qa/rental-journey-results.md)
- pnpm --filter @rentweb/tooling smoke -- demo-hotel
- pnpm --filter @rentweb/core exec vitest run test/provision-neutral.test.ts   (hotel copy is brand/location-neutral for non-demo tenants)
- pnpm --filter @rentweb/module-rental test
- pnpm --filter @rentweb/module-rental --filter @rentweb/web --filter @rentweb/admin typecheck
- MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/rental-journey.ts
- pnpm --filter @rentweb/tooling smoke -- demo-hotel

## ADMIN half (agent 3, 2026-10-18 — owns packages/modules/rental/src/admin/**, apps/admin t/[slug]/rental/**, tooling/qa/rental-admin-journey.ts)
DONE
- All admin pages exist and typecheck: /rental/bookings (tabs วันนี้เช็กอิน/เข้าพักอยู่/จองล่วงหน้า/เช็กเอาต์วันนี้/ยกเลิก/ทั้งหมด, search number/name/phone/email/unit no., pagination, KPIs), /rental/bookings/[id] (status actions confirm/check-in/check-out/no-show/cancel with reason, payment card approve slip / reject slip / refund / cash deposit / cash balance via the shared payment layer, unit number + internal note, guest link, timeline, history), /rental/calendar (month grid per unit type, heat colours, click → block/unblock range dialog, stays of the month), /rental/units (+ /new, /[id]: full CRUD with GalleryField upload via uploadRentalImageAction/sniffImage, amenities chips, prices, min nights, active/featured toggles, extras manager), /rental/rates (rule CRUD dialog + "ทดลองคำนวณราคา" preview box), /rental/settings (moduleConfig.rental: check-in/out times, free-cancel days, deposit %, full payment, pay at property, max advance, max nights, hold minutes; invalidates the storefront runtime cache).
- Shared /payments queue: refType "stay" already handled in packages/modules/commerce/src/admin/payments.ts (refHrefFor → /rental/bookings/<id>, number lookup) and REF_TYPE label "จองห้องพัก" — no edit needed.
- Roles: pages are readable by staff; transitions/notes/cash by staff (same as the booking module), slip approve/reject/refund + unit/rate/block writes by manager, settings by admin (same as tenant settings).
- Fixes found by the journey: recordCashStayPayment pre-set stay.paymentId before markPaid so onStayPaid treated the balance payment as a duplicate and never added it (stay stayed "ชำระมัดจำแล้ว"); adminCancelStay now refuses while a slip is pending_verification (admin must approve → refund, or reject first) and the cancel dialog copy says so.
- tooling/package.json: added "@rentweb/module-rental" workspace dep (pnpm install ran) so journeys can seed stays through createStay.
- tooling/qa/rental-admin-journey.ts (12 steps): uses demo-hotel when it exists with the rental module, otherwise creates/reuses throwaway tenant qa-hotel (corporate template + rental module + a bank account so slips work). Creates a unit type + rate rule in the UI, seeds slip stays through services, checks /payments → list → detail approve → check-in → cash balance → check-out → notes/search → cancel flow → calendar block/unblock verified through GET /api/rental/calendar on 127.0.0.1:3000 (Host header) → settings save/restore; deletes everything it created (--keep to inspect). Screenshots tooling/screenshots/rental-admin-*.png.
KNOWN / NOT MINE
- Admin shell header overflows 390px by 10px on EVERY admin page (div.ml-auto … avatar button right=400) — also on /customers, so it is the shared layout, not the rental pages.
- No demo-hotel yet (storefront agent provisions it); re-run the journey against it once it exists: `MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/rental-admin-journey.ts` (add `--tenant demo-hotel` to force).
RESULTS (agent 3, final)
- typecheck: @rentweb/module-rental ✓, @rentweb/admin ✓, @rentweb/tooling ✓; vitest @rentweb/module-rental 35/35 ✓ (3 files, ~5 s).
- Journey tooling/qa/rental-admin-journey.ts: 12/12 PASS on demo-hotel (also 11/12 earlier on qa-hotel before the preview assertion was made tenant-agnostic). Screenshots tooling/screenshots/rental-admin-{units,bookings,detail,calendar}-{1440,390}.png + rates/settings-1440 — reviewed, no horizontal overflow on demo-hotel (the 10px overflow seen on qa-hotel came from the superadmin impersonation banner in the shared shell).
- Stay detail: slip thumbnails now go through assetUrl() (relative /uploads/… resolved against the storefront host) like the /payments queue.
- Smoke `pnpm --filter @rentweb/tooling smoke -- demo-hotel`: 6 ✗, all storefront-side (not admin): /rooms/deluxe-seaview requestfailed on its own /api/rental/calendar fetch (desktop + mobile — looks like an aborted client fetch; storefront agent to check), /location + /contact embed https://www.google.com/maps?q=… in an iframe → X-Frame-Options sameorigin (needs the /maps/embed URL or a link instead).
- Throwaway tenant qa-hotel (corporate template + rental module, bank account 0123456789) still exists from the first run; safe to delete or keep for admin QA.
