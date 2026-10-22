# rental agent progress (phase 2 — hotel / rental module hi-end redesign) — STATUS: DONE (run 3, 2026-10-22)
Owner: packages/modules/rental/src/{components,sections}/** + labels, apps/web/src/app/(sites)/rw/[tenantId]/{rooms,stay,stays}/** + account/stays/**,
packages/templates/src/hotel.ts, tooling/qa/rental-journey.ts, tooling/qa/redesign/rental-shots.ts

## done
- (2026-10-22, run 1) read direction §1-2, §5.0, §5.9, §6-§8; kit3d.md, kitmotion.md, sections.md, shell.md; rental-journey.ts
- (run 2) re-read docs + all module/route code; baseline frames (redesign-rental-home-1440 before = old look);
  screenshot script `tooling/qa/redesign/rental-shots.ts` (--only= --w= --reduce --top --frames --dark; logs in as a seeded guest for account pages)

## run 3 (successor, 2026-10-22)
- found: predecessor's work landed in commit a2d3646 (all module components/sections, every route page, hotel.ts §5.9 composition,
  demo-hotel already reset — home renders stay-search/text/room-grid/sticky-story/image-text/gallery/testimonials/faq/interlude).
- baseline shots 1440 (home frames, rooms, room, stay*, book*, stays-*, account-stays*): 0 errors, 0 overflow, hero sea live.
- verified baseline: web+rental typecheck green; rental tests 35/35; rental-journey 12/12 PASS (no journey edits); provision-neutral (see below)
- polish (run 3): RoomName (components/room-name.tsx) keeps each space-separated chunk of a room name whole — Intl.Segmenter
  splits Thai loanwords (บีชฟ|รอน|ต์, แฟ|มิ|ลี่) and text-wrap:balance broke "บีชฟรอน / ต์" at 390; used in room cards, /rooms index,
  room hero h1 (per-chunk CSS mask rise, aria-label), /stay results, book summary, stay page.
  hotel.ts: statement "พูล⁠วิลล่า" (word joiner, no mid-word break); closing interlude align "left" (centre radial scrim
  washed the aerial photo to cream). Time-of-day sticky story = unlayered CSS in RentalStyles keyed on kit [data-active]
  (scoped body:has(.rw-stay-hero)) → request below to move it into sticky-story. demo-hotel reset 09:3x.

## (stale, run 2) in progress
- building: RentalStyles (hoisted css), OceanBand (Scene3D + ocean impl, transparent fallback), StaySearchForm bar + popover dual-month,
  stay-search hero (photo top + WebGL sea band + glass bar), room cards (drift + hover swap), room-grid editorial = panoramic HorizontalScroll

## next
- pages: /rooms (PageIntro + HoverPreview index + editorial blocks + amenity icons), /rooms/[slug] (panoramic hero + filmstrip + sticky quote),
  /stay (calm), /stay/book (stepper, numbered sections), /stays/[id] (boarding-pass confirmation + timeline), /account/stays
- hotel.ts composition per §5.9 → reset-demo hotel + create-admin; provision-neutral test
- verify: typecheck, rental tests, journey, shots 1440/390 + reduce

## journey hooks to keep (rental-journey.ts)
testids: stay-search, stay-search-from, stay-search-submit, guest-count, stay-result, result-select, stay-widget, quote-total,
stay-widget-book, extra-<id>, book-form, book-name/phone/email/note/consent/submit/error, stay-number, stay-status, stay-actions,
cancel-preview, cancel-open, cancel-confirm, #cancel-reason, stay-row; [data-date] buttons, [role=grid], button "เดือนถัดไป",
"เพิ่มจำนวนผู้เข้าพัก"; H1s "ค้นหาห้องว่าง", "ห้องพักและวิลล่า", room name, "จองห้องพัก", "การเข้าพักของฉัน"; widget add-ons in
<details> with summary "บริการเสริม"; home texts "เลือกมุมที่ใช่ของคุณ", "วันหยุดที่ไม่ต้องรีบไปไหน", "อาหารเช้าที่เสิร์ฟตามเวลาของคุณ",
"ก่อนเดินทาง", "ดีลักซ์ ซีวิว", "บีชฟรอนต์ พูลวิลล่า", /เริ่มต้น|฿\d/; /rooms "เช็กอินตั้งแต่ 14:00" "เช็กเอาต์ก่อน 12:00" + ≥5 room links;
room page "สิ่งอำนวยความสะดวก","บริการเสริม","ขั้นต่ำ 2 คืน","สูงสุด 6 ท่าน","120 ตร.ม."; journey runs reducedMotion: "reduce".

## decisions
- hero photo = IMG.beach (golden-hour shore) — sky/sun on top, WebGL sea band (bottom ~44%, CSS mask fades it in) = "photo on top,
  sea below"; band fallback is transparent (low tier / no WebGL / scene3d off → the photo only). IMG.hero moves into the gallery.
- calendar popover opens UP over the sea in the hero (desktop), DOWN on /stay, inline on phones; 2 months side by side ≥ lg (second
  month mounted after a matchMedia check → no hydration mismatch, no hidden duplicate [data-date] cells on phones).
- /stay page uses a server `StaySearchBar` (no OceanBand import → operational client graph stays free of the 3D wrapper).

- run 3 later: hotel.ts closing interlude uses the same bay mirrored (u(id,1600,"&flip=h") = IMG.aerialFlip, 200 + viewed) with
  heading "ให้ทะเลเป็น
คนปลุกคุณ"; facilities headings got 
 breaks; mobile hero bottom padding clears the floating LINE pill;
  /stay empty state = noResultsTitle + noResultsHint labels; demo-hotel reset again (tenant 01a16172-…); provision-neutral 10/10.
- journey C5: PaymentPanel reloads the stay URL 1.2 s after "ชำระเงินสำเร็จ" → the journey's goto was aborted on a busy dev server
  (net::ERR_ABORTED, 2 runs) → goto retried once on ERR_ABORTED (robustness only, no assertion changed). Journey 12/12 after that.
- verified again: web+rental+templates typecheck green, rental tests 35/35, reduced-motion frames clean.

- FINAL (run 3): typecheck web/rental/templates/tooling green; rental tests 35/35; rental-journey 12/12; provision-neutral 10/10;
  rental-shots all 20 routes × 1440/390: HTTP 200, 0 console/hydration errors, 0 px overflow, hero sea `live`, ≤ 1 canvas.
  Screenshots: tooling/screenshots/redesign-rental-<route>-<1440|390>.png (+ -reduce frames, probe-*.png). Tools: rental-shots.ts, rental-probe.ts.

## For shared owners
- sticky-story: add an optional stage tone per item (e.g. `tones: "time-of-day"` or item `tone: surface|accent|glow|night`), so the
  hotel "หนึ่งวันที่บ้านทะเล" background shift (§5.9 creative signature) lives in the section; then delete the
  `[data-section="sticky-story"]` block at the end of packages/modules/rental/src/components/rental-styles.tsx.
- interlude: the centred `rw-scrim-radial` (background 88% at the centre) turns photo scenes (water-ripple / photo poster) into a
  pale cream wash; a photo-first scrim option (dark bottom gradient + light text) would let hotel use align "center".
- kit `segmentText` (Intl.Segmenter "th") splits transliterated loanwords (บีชฟ|รอน|ต์); SplitReveal/RevealHeading on proper names
  then allows mid-word breaks under text-wrap:balance — consider gluing segments that start with a combining mark / ์ to the
  previous one, or a `keep="spaces"` mode that only splits on whitespace.
