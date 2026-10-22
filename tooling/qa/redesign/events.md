# events agent progress (module events + routes events/tickets/account/tickets + template events.ts)
Owner: packages/modules/events/src/{components,sections}/** + labels, apps/web/src/app/(sites)/rw/[tenantId]/{events,tickets}/** + account/tickets/**,
packages/templates/src/events.ts, journey tooling/qa/events-journey.ts

## status
- 2026-10-22 run 3 (successor): predecessors only read docs (no progress file, no diff). Started fresh.

- 2026-10-22 run 4 (successor): run 3 work is COMMITTED in a2d3646 (wip) — kit + sections + /events + /events/[slug] + template marquee/images done, demo reset. Remaining: tickets pages, account/tickets, template "\n" heading fixes, iterate, verify.

## done
- read direction §0-2, §5.0, §5.10, §6-9, kit3d.md, kitmotion.md, sections.md, shell.md, booking/topup notes, journey, all owned files
- verification script tooling/qa/redesign/events-shots.ts (orders picked from the seeded demo DB; contact sheets of viewport
  frames + "-top" first viewport; reports overflow / errors / canvases per viewport) — before shots *-before.png

- run 4: TicketCard rebuilt (art band + holder + field row + tear-off QR stub, CSS tilt/holo, [data-tilt-flat] levels the card over the QR);
  /tickets/[id] (mono intro, accent order no., 3-step progress line, status+event card, sticky receipt w/ barcode, buttons);
  /tickets/t/[code] (static stage glow, note, ticket, tools); /account/tickets (EvPills scope, ticket-stub rows, dashed empty state);
  ThaiWrap (components/thai-wrap.tsx: glue list for loanwords + Intl.Segmenter + nowrap words + <wbr>) on titles (cards, hero tail,
  detail hero, e-ticket, order card); event detail drops PageBody padding (hero under transparent header); labels += ticketDead, steps,
  ticketsReady, emptyHint, time …; module + web typecheck green (before field-row change)

- template: forced line breaks on features / image-text / testimonials / venue hero / about headings; contact page composed inline with contact variant="chips" + interests (contactPage helper has no variant); demo reset 2026-10-22 (tenant 01a16179…) + create-admin

- /events + /events/[slug] paint under the overlay header themselves (no PageBody band); detail hero: back link + mono meta + LiveClock pinned top; dark map invert; gallery big+column layout (no orphans); buy bar data-sticky-bar="lg" (LINE button lifts); Riverside seed gallery drops the banquet photo; ThaiWrap glue += ทำมือ; typecheck web/events/templates green; demo reset again (01a16182…)

- final pass: venue hero 3-line heading, venue gallery banquet photo instead of the daytime-temple shot; hero scene reducedMotion=poster (single static WebGL frame showed a blank ticket face); order page buttons outline unless order stopped; demo reset (01a16194…), provision-neutral 10/10, typecheck green

## STATUS: DONE (2026-10-22, run 4)
- events-journey 17/17 PASS twice (after each demo reset), no journey edits; @rentweb/module-events tests 20/20; provision-neutral 10/10;
  typecheck web + module-events + templates green; 0 console/hydration errors, 0 px overflow, <=1 live canvas per viewport on all 18 routes x 1440/390;
  reduced-motion pass (home/events/event/order/ticket/account) static + complete.
- screenshots: tooling/screenshots/redesign-events-<page>-<1440|390>[-reduce].png (+ -top.png first viewport); pages = home venue about contact
  events events-past events-empty event event-talk event-past order-paid order-pending order-cancelled order-refunded order-locked ticket account account-past

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
- GOTCHA: the Bash tool mangles backslashes inside heredocs (\n → real newline) → write node fix-up scripts with the Write tool (scratchpad) when they contain escapes.
- e-ticket stays a CSS object (no WebGL on /tickets/*); QR plate is outside the holo; [data-tilt-flat] on the stub.
- ThaiWrap only in server components (segmentation once on the server).

## For shared owners
- contact section (sections agent): the map stays light on dark presets (§5.0 says dark presets use screen); venue + contact pages of stage look off.
- marquee giant (sections agent): under reduced motion the 5 giant words wrap into ~2 viewports of stacked rows.
- PageBody (apps/web/src/components/page-body.tsx): let a module page opt out of the overlay top padding when it paints its own
  full-bleed intro/hero (e.g. a `flush` prop). /events and /events/[slug] currently skip PageBody and apply the same overlay rule.
- Thai line breaking: Chromium/ICU (and Intl.Segmenter → SplitReveal word splits) break common loanwords inside the word
  ("โฟล์|กก|ลาง", "เวิร์|กช็อ|ปงาน"). packages/modules/events/src/components/thai-wrap.tsx (glue list + nowrap words + <wbr>)
  could move to @rentweb/ui/motion/split and be used by SplitReveal / DisplayText / headings site-wide.
- packages/templates/src/shared.ts contactPage(): accept `variant` / `interests` (events composes its chips contact page inline).
- globals.css [data-sticky-bar] offsets: worked as documented (buy bar uses data-sticky-bar="lg").
