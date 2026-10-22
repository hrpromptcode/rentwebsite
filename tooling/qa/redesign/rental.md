# rental agent progress (phase 2 — hotel / rental module hi-end redesign)
Owner: packages/modules/rental/src/{components,sections}/** + labels, apps/web/src/app/(sites)/rw/[tenantId]/{rooms,stay,stays}/** + account/stays/**,
packages/templates/src/hotel.ts, tooling/qa/rental-journey.ts, tooling/qa/redesign/rental-shots.ts

## done
- (2026-10-22, run 1) read direction §1-2, §5.0, §5.9, §6-§8; kit3d.md, kitmotion.md, sections.md, shell.md; rental-journey.ts
- (run 2) re-read docs + all module/route code; baseline frames (redesign-rental-home-1440 before = old look);
  screenshot script `tooling/qa/redesign/rental-shots.ts` (--only= --w= --reduce --top --frames --dark; logs in as a seeded guest for account pages)

## in progress
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

## For shared owners
