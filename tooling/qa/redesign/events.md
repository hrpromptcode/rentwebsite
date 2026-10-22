# events agent progress (module events + routes events/tickets/account/tickets + template events.ts)
Owner: packages/modules/events/src/{components,sections}/** + labels, apps/web/src/app/(sites)/rw/[tenantId]/{events,tickets}/** + account/tickets/**,
packages/templates/src/events.ts, journey tooling/qa/events-journey.ts

## status
- 2026-10-22 run 3 (successor): predecessors only read docs (no progress file, no diff). Started fresh.

## done
- read direction §0-2, §5.0, §5.10, §6-9, kit3d.md, kitmotion.md, sections.md, shell.md, booking/topup notes, journey, all owned files
- verification script tooling/qa/redesign/events-shots.ts (orders picked from the seeded demo DB; contact sheets of viewport
  frames + "-top" first viewport; reports overflow / errors / canvases per viewport) — before shots *-before.png

## in progress
- building the events hi kit (styles, poster card, odometer countdown, stage+ticket single-canvas scene)

## plan
1. components: ev-styles (hoisted CSS), poster (PosterCard/DateStamp), tilt (pointer→CSS vars), countdown odometer, stage-ticket scene
   (StageLights + Ticket3D impls in ONE Scene3D via @rentweb/ui/three/impl/* + core/scene-3d), velocity skew, filter pills
2. sections: event-hero (stage lights + 3D ticket, giant poster type, odometer countdown, corner labels), event-grid (poster wall
   with tilt/beam glow; list = HoverPreview rows, cursor "ซื้อบัตร"), event-highlights (HorizontalScroll + velocity skew, mono captions)
3. pages: /events (PageIntro + sliding pills + poster grid), /events/[slug] (parallax poster hero, ticket strip, odometer,
   ticket tiers as CSS tickets, calm picker, sticky buy bar), /tickets/[id] + /tickets/t/[code] (CSS tilt + holo sheen, flat QR),
   /account/tickets (ticket-stub rows, sliding tabs)
4. template events.ts §5.10 composition (+ marquee, cta glow, fix KFC photo in highlights) → reset-demo + create-admin + provision-neutral
5. screenshots 1440/390 + reduced motion, journey, typecheck, module tests

## journey hooks to KEEP (tooling/qa/events-journey.ts)
- home: testid event-hero, countdown (≥1), hero-cta (≥1), event-card (≥4); text "Riverside Live", "งานที่กำลังจะมาถึง",
  "บรรยากาศงานที่ผ่านมา", "Maker Yard", "ก่อนซื้อบัตร", "Design Talk 2026", "Khlong San Night Run", /เริ่มต้น|฿\d/; no "ยังไม่มีคอมโพเนนต์"
- /events: testid events-scope, events-categories (exactly 1); upcoming lists 4 titles, NOT "Maker Market ครั้งที่ 7" (no marquee of
  all titles!); "บัตรหมด"|"เริ่มต้น"; ?scope=past has Maker Market, not Night Run; ?q=Night only the run; ?q=zzzz → "ไม่พบอีเวนต์";
  ?category=ดนตรี only the concert (so the page must not mention other events' titles anywhere)
- /events/riverside-live: testid ticket-picker (data-state / data-step), countdown, ticket-type-list, qty-inc-<id> (disabled states),
  qty-<id>, picker-total, picker-next, picker-buyer, picker-same-as-buyer, holder-<i>, picker-name, picker-phone, picker-email,
  picker-terms, picker-submit, buy-bar (visible <lg, first a/button scrolls to #buy); text "ประตูเปิด" "เส้นทาง" "ปิดการจำหน่ายแล้ว"
  "ยังไม่เปิดจำหน่าย" "เหลือ N ใบ" "Early Bird" "VIP" "Regular" "เงื่อนไขบัตร"; JSON-LD Event
- /tickets/[id]: testid order-number (/TK-\d+/), order-status ("รอชำระเงิน"/"ชำระแล้ว"/"ยกเลิก"), hold-countdown, order-payment (=1),
  cancel-open, cancel-confirm, ticket-card (=3, img[src^="data:image"] each), ticket-code (/^[A-Z2-9]{4}-…$/), ticket-holder (exact
  names), ticket-tools, ics-link (href /tickets/<id>/ics…), a[href^="/tickets/t/"] inside ticket-card; texts "แนบสลิปโอนเงิน",
  "ชำระเงินสำเร็จ", total ฿; no-key → 404 or "ไม่สามารถเปิดคำสั่งซื้อนี้ได้"; order number in HTML
- /tickets/t/[code]: ticket-card (1, QR img), ticket-holder = first name only, public-ticket-note; no PII; unknown code → 404
- /account/tickets: h1 "บัตรของฉัน" (role heading level 1), order-row (click → /tickets/<id>), tickets-empty, "ชำระแล้ว"; /account text "บัตรของฉัน"
- mobile: no horizontal overflow on home, /events, event, tickets

## decisions

## For shared owners
