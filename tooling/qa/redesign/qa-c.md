# qa-c agent progress (phase 3 — visual QA + fix: demo-topup, demo-hotel, demo-events)
Owner: packages/modules/{topup,rental,events}/src/{components,sections}/** + their routes, packages/templates/src/{topup,hotel,events}.ts.
Shared layer frozen → problems go to tooling/qa/redesign/qa_shared.md under "## qa-c".

Tool: tooling/qa/redesign/qa-c-crawl.ts (--site= --mode=normal|reduce|nogl --tag= --fps --links --noshots)
→ tooling/screenshots/redesign-qa-c-<site>-<page>-<w>[-mode][-tag]-<n>.png

## log
- 2026-10-22 start: no predecessor file. shared1 DONE (topup 8 hero cards + chat testimonials, hotel sticky tones + interlude
  photo scrim already in templates and reset).

## findings (page | issue | fix | status)
| site/page | issue | fix | status |
|---|---|---|---|
| topup/games, home grid, hero orbit | PUBG Mobile cover = a TV showing another game's "WARZONE" logo (wrong brand) | COVER["pubg-mobile"] → 1560253023-3ec5d502959f (esports players, 200 + viewed); reset topup | fixed (reset done, verified in DB/HTML) |
| topup/how-to | page ends on a bare 4-step timeline, ~half a viewport of nothing before the footer | + faq two-column (shared FAQ const with home) + cta glow (เลือกเกมที่จะเติม / ตรวจสอบสถานะ) | fixed (reset done, verified in DB/HTML) |
| topup/games/[slug] 390+1440 (guest) | "เข้าสู่ระบบ" link 59×20 px and wrapped "เข้าสู่ / ระบบ" in the flex row on phones | topup-form: text in a span, link inline-flex min-h-11 nowrap | fixed |
| topup/home 1440 | hero CardStack3D orbit reads small (cards ≈ 55×90 px, ring Ø160 in a 467×584 canvas) — weak signature moment | shared (kit fit) → qa_shared.md | logged |
| topup/* | header nav links 40 px tall, account icon 36×36, header CTA 36 px, footer socials 40×40 (< 44) | shared shell → qa_shared.md | logged |
| topup/home 390 | hero stats strip 3 items in 2 cols → "4.9/5" orphan row | shared hero → qa_shared.md | logged |
| hotel/home hero 1440 | white sub over the bright golden-hour sky ≈ 2.7:1 (median), heading p90 2.3:1 | rental-styles: copy-pool radial scrim (.82/.62/.22) + .rw-hero-sub halo, sub text-white → sub p50 5.1:1, heading p90 3.1:1 | fixed |
| hotel/home hero 390 | sub broke inside a word "และที / มงาน" (Chromium ICU) | stay-search: subheading via kit ThaiWrap (server segmentation) | fixed |
| hotel/* "พูลวิลล่า" | IMG.villaPool was a city-hotel bedroom (tufted headboard, gilt mirror): cover of บีชฟรอนต์ พูลวิลล่า, home gallery, facilities | IMG.villaPool → 1582610116397-edb318620f90 (tropical villa + private pool + sala, 200 + viewed) | fixed (reset done, verified in DB/HTML) |
| hotel/rooms + home grid | pool-access suite led with a classic city room | gallery leads with IMG.suitePool 1571003123894-1f0594d2b5d9 (cabanas on an infinity pool at dusk, 200 + viewed) | fixed (reset done, verified in DB/HTML) |
| hotel/home image-text | "อาหารเช้าริมทะเล" photo = dim city cafe with diners | IMG.breakfast → 1559339352-11d035aa65de (seaside dining terrace, golden light, 200 + viewed) | fixed (reset done, verified in DB/HTML) |
| hotel/home image-text + all templates | "สาย ๆ" → ๆ orphaned at the start of a line | templates hotel/events/topup: " ๆ" → " ๆ" (13×) | fixed (reset done, verified in DB/HTML) |
| hotel/facilities + location heroes | auto ocean scene = pale grey sea filling the frame, the real photo shrunk to an inset | facilities scene "water-ripple" (pool photo ripples), location scene "none" (turquoise bay photo leads) | fixed (reset done, verified in DB/HTML) |
| hotel/about | text only (statement + CTA card), no imagery for a resort | withAlbum(): polaroid gallery "อัลบั้มบ้านทะเล" (6 site photos) before the CTA; neutral page unchanged | fixed (reset done, verified in DB/HTML) |
| hotel/rooms/[slug] | light header text over the light top of the room photo (mirror / sky) | top scrim .66 → .38 @14% → 0 @32% | fixed |
| hotel/stay/book (dev) | summary dimmed (opacity .5) + submit disabled on load: the re-quote effect's "first render" ref is defeated by StrictMode's double mount → a quote request fires on mount | book-form: re-quote keyed on type/dates/guests/extras (skip the initial key) + aborted request no longer clears the newer flag | fixed |
| hotel/stays/[id] | "ราคาต่อคืนตามวันที่" summary 32 px tall | quote-breakdown: min-h-11 py-3.5 | fixed |
| events/about | text only (statement + CTA card) | withWall(): parallax masonry "หนึ่งปีในโกดัง" (6 site photos) before the CTA; neutral page unchanged | fixed (reset done 14:25) |
| events/home 1440 | features bento 6 items → lone "คืนเงินเต็มจำนวน" tile on a 4th row (shared bentoSpan(6) bug) | template → 5 items (calendar folded into "ชื่อผู้เข้าร่วมทุกใบ"); shared bug → qa_shared.md | fixed (reset done 14:25) |
| events/home image-text | "ผู้จัดงาน" photo = generic laptop coworking | IMG.longTable 1528605248644-14dd04022da1 (community long-table dinner, 200 + viewed) | fixed (reset done 14:25) |
| events/venue gallery "พื้นที่ในโกดัง" | ornate European hall + hotel ballroom with white banquet tables (not a warehouse) | IMG.hallTalk 1540317580384-e5d43616b9aa (dark hall talk) + IMG.shell 1565610222536-ef125c59da2e (steel-truss warehouse) | fixed (reset done 14:25) |
| events/leather-workshop gallery | laptop coworking photo + circular-saw woodwork in a leather workshop | IMG.leatherBag 1473188588951-666fce8e7c68 (leather messenger bag) + IMG.leatherPack 1622560480605-d83c853bc5c3 (leather backpack), both 200 + viewed | fixed (reset done 14:25) |
| events/leather-workshop h1 1440 | "เวิร์กช็อปเครื่อง ⏎ หนังทำมือ" (compound เครื่องหนัง split; ICU sees two words) | thai-wrap GLUE + เครื่องหนัง, เครื่องดื่ม, การกุศล, เจ้าพระยา, คลองสาน, กลางแจ้ง, ริมน้ำ, ตลาดนัด … | fixed |
| events/events 1440 | 4 events in 3 columns → night-run poster alone on row 2 | events page: 4 columns when n%4==0 or n%3==1, offset every other column | fixed |
| events/event (Riverside) | console: Google Maps place card 503 (PLACES_GET_PLACE UNAVAILABLE) | external Google outage inside the map embed — not ours | n/a |
| events/about statement 390 | scrub statement wraps inside compounds "นัก⏎ดนตรี", "นัก⏎ออกแบบ" | events.ts glueTh(): listed compounds joined with U+2060 (kit splitter + Chromium honour WJ) | fixed (reset done 14:25) |
| events/event 390 picker + types | "VIP (ที่นั่งแถวหน้า + เครื่อง⏎ดื่ม 2 แก้ว)"; venue "โกดังริม⏎น้ำ" in the location card | ticket names: client-safe GlueWords (glue list only, no Intl → no hydration diff) in picker + order lines; server ThaiWrap for type list + venue name | fixed |
| events/* 390 | LINE FAB "แชตผ่าน LINE" pill covers copy right after load | shared → qa_shared.md | logged |
| events/venue 390 hero sub | "เวิร์⏎กช็อป" in plain `<p>` subheading (shared section) | shared (ThaiWrap for body/sub) → qa_shared.md (added to the existing entry) | logged |
| events/event 390 | LINE FAB stacked above the buy bar sits on ticket prices / qty steppers while scrolling the picker + type list | shell FloatingChatOptOut (query width < 64rem) around the picker and the ticket-type list | fixed |
| events/past card + ThaiWrap | "Maker Market ครั้งที่ ⏎ 7" | ThaiWrap keeps "Thai word + space + number" in one nowrap span (text unchanged) | fixed |
| events/home testimonials spotlight 1440 | giant quote wraps "บนมือ⏎ถือ" | QUOTE_GLUE via glueTh on the 3 quotes (เที่ยงคืน, มือถือ, ของที่ระลึก, ข้าวต้ม …) | fixed (reset 2 done 14:25) |
| topup/games/rov 1440 | h1 "RoV (Arena ⏎ of Valor)" — the bracket breaks mid-name at step-5 | games/[slug]: "Short (Long name)" → short name as the poster title + bracketed name as a quieter 2nd line; h1 aria-label keeps "RoV (Arena of Valor)" (topup-journey) | fixed |
| events/home 390 hero | expanded LINE pill sits on the hero CTA "ซื้อบัตร · เริ่มต้น ฿890" at load (…-events-home-390-after-1.png f0) | event-hero fullscreen: phone bottom padding 5.5rem + safe-area so the CTA row ends above the FAB zone | fixed |
| events/event-run 390 | "VIP Runner (เสื้อรุ่นพิเศษ ⏎ + ที่จอดรถ)" (lone + starts a line), "ชุดนัก⏎วิ่งครบ" in type descriptions | ThaiWrap/GlueWords keep "+ word" together; glue นักวิ่ง/ที่จอดรถ/เสื้อรุ่น/ที่นั่ง/แถวหน้า; descriptions on the event page (ThaiWrap) and in the picker (GlueWords) | fixed |
| hotel/rooms + room pages | pool-access suite 2nd photo, family villa cover and the shared "bedroom" shot were city-hotel rooms (tufted headboards, TV fireplace, gilt mirror) | IMG.suite → 1584132967334 (teak deck on an infinity pool), IMG.family → 1578683010236 (open villa suite, stone + glass), IMG.bedroom → 1602002418082 (thatched sea-view room); all 200 + viewed | fixed (reset 15:00) |
| hotel/stays/[id] 390 | check-in / check-out dates wrap ("พฤ. 22 ⏎ ต.ค. 69", "อา. ⏎ ต.ค. 69") in 112 px columns beside the nights pill; the LINE button sits on the check-out date | phones: dates in two columns (nowrap, 1.2rem), nights pill on its own row with hairlines; ≥ 640 px unchanged | fixed |
| hotel/stay/book 390 | LINE button covers the summary card's check-out date at load and floats over form fields | FloatingChatOptOut (phones) around StayBookForm — same pattern as the booking widget / restaurant reserve | fixed |
| topup/wallet 390 | LINE button floats over the ฿300 amount tile / form | FloatingChatOptOut (phones) around WalletTopupForm | fixed |
| topup/about | text only (statement + contact card) — same gap as hotel/events about | withHud(): outline VelocityMarquee of the games + HUD stat odometers before the CTA; neutral page unchanged | fixed (reset 14:57, 01a1629b…) |
| topup/topup/status miss 390 | not-found note laid out as 3 flex columns ("ไม่พบ/รายการ" · "TP-/999999" · rest) | icon + one <p> text flow, order number nowrap | fixed |
| hotel/rooms/[slug] 390 "ห้องพักอื่น" cards | audit: title links 39 px tall | stretched link (after:absolute inset-0) — the whole card is the hit area; false positive | n/a |
| events/leather-workshop 390 gallery | 2 photos → big image + one lone thumbnail with an empty half row | + IMG.leatherSatchel 1605733513597-a8f8341084e6 (leather satchel, 200 + viewed) → big + 2 thumbs | fixed (reset 19:04) |
| hotel/home hero 390 (nogl pass) | sub "…และทีม ⏎ งานที่จำชื่อคุณ…" — ICU splits the compound ทีมงาน; story/breakfast copy "ห้องอาหารริม ⏎ หาด", "หรือริม ⏎ สระวิลล่า" | hotel.ts: U+2060 inside ทีมงาน, พูลวิลล่าริมหาด, ห้องอาหารริมหาด, ริมสระส่วนตัว/วิลล่า (marketing copy only; extras/room names untouched) | fixed (reset 19:4x, verified …-hotel-home-390-after2-1.png f0/f8) |
| topup/home 390 features bento | "ปลอดภัย ไม่ ⏎ ต้องให้รหัสผ่าน" (negation split from its verb) | topup.ts: "ไม่ต้องให้รหัสผ่าน" joined with U+2060 → breaks only at the space | fixed (reset 19:4x, verified …-topup-home-390-after2-1.png f8) |
| hotel/home + /rooms (QA data from another agent's admin journey: "QA ดีลักซ์ 1952" without photos) | a room type without photos rendered as a flat grey-beige box under white copy — looks broken | room-card SwapMedia: no photo → tonal "horizon" plate (primary→foreground gradient + hairlines + BedDouble icon, role=img with the room name), theme tokens only | fixed (…-hotel-rooms-empty-1440.png / -390.png, simulated via _qac-emptyroom.ts) |
| hotel+events home | two h1 (sr-only page title + module hero h1) | shared render.tsx H1_SECTIONS → qa_shared.md | logged |

## log (cont.)
- crawl "before" (normal, 1440+390, all pages) done for topup + hotel; demo resets: hotel 01a16221-297a…, topup 01a16221-4ce7… + create-admin; provision-neutral 10/10
- successor run (14:10): events "before" crawl 1440 started; findings above; resets for events pending.
- 14:50 events "before" crawl 1440 + 390 finished (event-run-390 screenshot timed out during an HMR recompile → re-shot in the after pass).
  NOTE for successors: never run `npx prettier --write` here — no prettier config, it reflows whole files to 80 cols (I had to restore and
  re-apply; script kept at scratchpad reapply.py). typecheck events + templates green.
- 14:25 events reset (tenant 01a1627f-b63e…) + create-admin; provision-neutral 10/10; typecheck web/events/rental/topup/templates green;
  module tests events 20/20, rental 35/35, topup 96/96. Extra fixes: FloatingChatOptOut around ticket QR lists (/tickets/[id], /tickets/t/[code])
  so the LINE button never covers a QR on phones; ThaiWrap on venue names (order page, ticket card); about wall "โกดังของเรา" → IMG.shell.
- events "after" crawl (changed pages) running.
- 14:50 another agent's half-saved cafe.ts (syntax error) broke every page of the dev server for a few minutes → my first "after"
  crawl was garbage after venue/about/contact; stopped it. Second events reset (01a16284-d3ef…) for the quote glue; provision-neutral 10/10.
  "after" sheets so far: venue/about/home(1440 part) confirm the warehouse photos, 5-tile bento, long-table story photo, glued statement.
- after (verified): …-events-home-1440-after-1..3.png (5-tile bento, long-table photo, glued quotes), …-events-venue-1440-after-1.png
  (warehouse gallery), …-events-about-1440-after-1.png (wall + glued statement), …-events-events-1440-after-1.png (4-col wall).
- verified …-events-event-390-after-1.png: LINE button hidden while the picker / ticket list are on screen (f0–f2, f4), VIP name glued
  "เครื่องดื่ม", buy bar alone at the bottom.
- 15:00 hotel reset (01a16290-7bf2…) for the room photos; provision-neutral 10/10; templates typecheck green.
- verification passes script: tooling/qa/redesign/_qac-passes.sh <outdir> after-topup after-hotel after-ev-ws reduce nogl fps
- topup home after (…-topup-home-1440-after-1/2.png): PUBG tile now the esports player; live feed hidden because a fresh reset has no
  paid orders (by design §5.2 #4 — it reappears once orders exist, e.g. after topup-journey). Not seeding fake orders (journeys
  count orders / TP numbers).
- 14:55 after-topup pass: 16 pages, 0 errors / overflow / mid-word / broken / low-res (…-topup-*-after-*.png). after-hotel running;
  …-hotel-home-1440-after-1..3.png confirm the readable hero, resort room photos (pool suite, beachfront villa, family villa).
- remaining: after-hotel, after-ev-ws, reduce + nogl audits (3 sites), fps; then journeys topup/rental/events.
- 15:09 after-hotel pass: 18 pages, 0 console / hydration errors, 0 overflow, 0 mid-word breaks, 0 broken / low-res images
  (…-hotel-*-after-*.png). after-ev-ws, reduce, nogl, fps passes running.
- reduce pass topup (15:11–15:25): 49 page audits, 0 errors except the 10 stale journey order URLs (404 — topup was reset at 14:57;
  re-checked after topup-journey). Home under reduced motion: static fanned card stack poster, no canvas animation
  (…-topup-home-1440-reduce-1.png). Marquee static fallback is a 4-line block → qa_shared.md (low).
- 19:05 successor (after usage limit): all passes in scratchpad/passes finished 16:11 (reduce + nogl + fps for 3 sites).
  fps (home scroll, GPU): topup 55/59, hotel 56/56, events 55/60 fps (1440/390), p95 frame 17 ms, ≤ 2 long frames → no jank.
  reduce/nogl audits: 0 console / hydration errors, 0 overflow, 0 mid-word on all pages; nogl homes show posters (canvasMax 0).
  Remaining audit flags are false positives of the crawler's contrast heuristic (text over <img> photos measured against
  body bg: hotel hero/room h1 1.07; active filter-chip text over the sliding indicator span 1.00) → verified on screenshots.
  nogl-topup-audit crashed (Target crashed after page 1) → re-running. events reset for the leather satchel (19:04) + create-admin.
- 19:40 nogl-topup re-run: 0 console / hydration errors, 0 overflow / mid-word on all pages; 1440 login timed out (dev server at 10–20 s/page from other agents' load) → logged-in pages verified at 390 (wallet, account, account/topups, game-in) and in the normal/reduce passes. Resetting hotel + topup for the WJ glue.
- topup-journey 22/22 PASS (after the 19:4x topup reset)
- rental-journey: run 1 C4 timed out waiting for the widget quote (dev server busy compiling + a concurrent pnpm exec hiccup, 'tsx not found'); quote API 0.4 s afterwards → re-run 12/12 PASS
- events-journey 17/17 PASS (the one console 404 is E8's deliberate unknown-ticket-code check)
- 19:50 _qac-lost.ts demo-events: hero live → poster off-screen → live again on return; no context loss → shared entry updated (not reproducible).
- 20:00 after2 shots (390 home, hotel + topup) confirm the WJ glue; demo data now also contains other agents' QA rows ("QA เกมทดสอบ …" game,
  orders 1234****/7789****) — not design issues. Added the photo-less room plate (module typecheck green).
- 20:10 END gates green: typecheck web / module-topup / module-rental / module-events / templates = 0 errors; module tests topup 96/96,
  rental 35/35, events 20/20; provision-neutral 10/10; journeys topup 22/22, rental 12/12, events 17/17. qa-c DONE.
