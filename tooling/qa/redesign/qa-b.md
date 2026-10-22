# qa-b — visual QA + fix: demo-clinic, demo-salon, demo-course, demo-restaurant (phase 3)
Owner: packages/modules/booking/src/{components,sections}/** + booking routes, packages/modules/restaurant/src/{components,sections}/** +
restaurant routes, packages/templates/src/{clinic,salon,course,restaurant}.ts. Shared layer frozen → tooling/qa/redesign/qa_shared.md "## qa-b".

## tools
- crawl: `cd tooling && pnpm exec tsx qa/redesign/qa-b-shots.ts --sites=clinic --w=1440,390 --tag=before [--mode=reduce|nogl] [--login] [--fps] [--only=home]`
  → screenshots/redesign-qa-b-<tag>-<site>-<page>[-mode]-<w>[-pN].png (viewport-frame contact sheets) + per-page audit lines
  (status, overflow, scenes, live canvases per viewport, console/hydration errors, tap targets < 40 px, broken/low-res images, contrast, clipped headings)
- ids: `pnpm exec tsx qa/redesign/_qab-db.ts` (read-only: pages, bookings + access keys, packages, tables, orders, reservations)

## log
- start 2026-10-22: no predecessor file. Read direction §5.0/5.3/5.4/5.5/5.8/6.4/9, booking.md, restaurant.md, shared1.md.

- clinic crawl 1440 (all 23 routes) + 390 (15 routes) done → screenshots redesign-qa-b-before-clinic-*. 0 console/hydration errors,
  0 overflow, ≤1 live canvas per viewport, FPS home 1440 ≈ 46–48 (4–5 long frames while Lenis scrolls). Image ids: web search →
  unsplash photo pages (WebFetch) → curl -sI 200 → contact sheet (scratchpad/qab/*.png) looked at.

- ~12:10 reset-demo clinic + salon (+ create-admin); ~12:15 reset course; ~13:00 reset restaurant; provision-neutral 10/10 after each.
- before crawls: clinic (all, 1440 + 390), salon home 1440, course key pages 1440 + 390, restaurant all 1440 + 390.
- booking-journey run 1 (after the wizard/template changes): 25/26 — S2x = 90 s navigation timeout (dev server under load), rerun at the end.
- crawl script loads real ids from the DB (bookings + keys, packages, table QR, orders, reservations) — no hard-coded ids.
- after crawls running: clinic/salon 1440, course/restaurant 1440 (+ homes retaken; screenshot timeout raised to 120 s).
- 14:03 successor run: checkpoint 69f02bb holds all earlier fixes; reset-demo clinic/salon/course/restaurant + create-admin again (clears all reset pending), provision-neutral 10/10.
- 14:03 successor run: checkpoint 69f02bb holds all earlier fixes; reset-demo clinic/salon/course/restaurant + create-admin again (clears every reset pending), provision-neutral 10/10.
- 14:10 v3 home crawl (1440 + 390, fps): 0 console/hydration errors, 0 overflow, max 1 live canvas / viewport; fps 1440 clinic 35 / salon 43 / course 44 / restaurant 39 (dev server shared with qa-a/qa-c/admin crawls), 390: 60/58/51/40. Audit noise checked: BROKEN img = HoverPreview <img> before first hover (hidden), salon spa-menu name links 33 px = stretched link (row hit area >= 80 px), restaurant/clinic contrast 1.06 = text over photo / sliding pill.
- 14:40 batch 2 fixed (table) -> reset-demo all four + create-admin, provision-neutral 10/10. Helper: qa/redesign/_qab-el.ts (viewport shots at selectors).
- 14:15-14:55 v4 crawl 1440 all 4 sites (every route): 0 overflow, 0 hydration, <= 1 live canvas / viewport; transient 500s on clinic staff-nicha/packages/buy/book = another agent's half-saved cafe.ts/corporate.ts (Turbopack), course home screenshot protocol error -> retake. Looked at every sheet.
- batch 3: package tickets pinned price rows, DishName, nameLines on detail h1s (services/classes/staff/instructors), about pages with an image-text story per site (+ staff/instructor grid on clinic/course), clinic /gallery 9th photo. typecheck web + booking + restaurant + templates green.
- ~15:00 reset-demo all four again + create-admin, provision-neutral 10/10.
- 15:05 module tests: booking 58/58, restaurant 43/43. booking-journey 24/26 (C6c/C6c2: slip upload spinner while Turbopack "Compiling", screenshot qa-booking-FAIL-C6c.png; rerun later). course-journey 15/15. restaurant-journey run 1 27/34 (call-staff toast, bill sheet, reserve availability: all requests stuck while "Compiling"), run 2 31/34 (different 3: goto/API timeouts) -> every step passed in at least one run; flake = dev server shared with 3 crawling agents. Final rerun at the end.
- 15:40 v5 crawl 390 every page --login running.
- 19:05 successor run 2: checkpoint 27aa416 holds every qa-b fix so far (git diff empty for my files). v5 390 crawl had finished clinic + salon (log: Target crashed at salon account) -> resumed salon account pages + course + restaurant (--login) -> scratchpad qab-v5b-390.log.
- 19:36 v5 390 crawl done for all four sites (every page, logged in) -> fixes batch 4 (NameWrap, frames, session rows, rails, NBSP mai yamok, footers); reset-demo clinic/salon/course/restaurant + create-admin, provision-neutral 10/10. Crawl now skips admin-journey 'RS-QA…' reservations (404 by design).
- NEXT: v6 1440 crawl every page (all four) -> 390 retakes of changed pages -> reduce + nogl passes -> journeys (booking, course, restaurant) -> typecheck + module tests.
- (was) NEXT: journeys (booking running, then course, restaurant) -> v5 crawl 390 every page + 1440 retakes (about, gallery, failed pages) + --login account pages + order/reservation status, reduce + nogl passes, module tests.
- (old) NEXT: after 390 key pages, reduce + nogl passes, journeys (booking rerun, course, restaurant), typecheck, module tests.

## findings (page | issue | fix | status)
| site/page | issue | fix | status |
|---|---|---|---|
| clinic services/home/packages | wrong photos: HIFU = oil back-massage, Aqua Peel = lotion bottle + tulips, Pico = clay mask, scaling = x-ray hand, consult = laptop; packages reuse them | clinic.ts: consult 1666214277730 (doctor + client), filler 1573461160327, pico 1552693673 (device facial), hifu 1595871151608 (treatment room), aqua-peel 1616394584738, scaling 1606811841689 (dentist + patient); packages pico/aqua/bride 1552693673/1616394584738/1600428853876 | fixed (reset 14:03) |
| clinic home gallery + /gallery | "บรรยากาศคลินิก" = laptop, bottle, lone chair; /gallery = spa massage photos, alt "" | lobby 1631248055158, room 1595871151608, dental 1629909615184, consult, skincare; /gallery 8 clinic photos with Thai alts | fixed (reset 14:03) |
| clinic home sticky-story | step 1 "ปรึกษาแพทย์" = laptop + stethoscope | 1666214277730 | fixed (reset 14:03) |
| clinic hero | secondary inset = spa back massage | jade roller 1600428853876 | fixed (reset 14:03) |
| clinic /contact | §5.0: clinic contact should use chips | contactPage({ variant: "chips", interests }) | fixed (reset 14:03) |
| clinic/salon/course cards 390 | card title links 39 px tall (< 44) | inline-flex min-h-11 (service + pass cards) | fixed |
| clinic home 390 | services = 6 full-width cards ≈ 3 600 px column | phone snap rail (78 % cards, next peeks) .bk-rail | fixed |
| clinic /services/botox | h1 balance-wraps "Botox ลด | กราม / ริ้วรอย" | text-pretty | fixed |
| salon services | thai-60/90 same photo, hot-stone = clay facial, facial = back massage, scrub = nail polish, aroma/couple = lotion bottle | thai-60 1596178060671, thai-90 1775133262667 (herbal compress), foot 1519415510236, aroma 1544161515, hot-stone 1696841212541, facial 1598901986949, scrub 1590439471364, couple 1560750588 | fixed (reset 14:03) |
| salon home image-text + galleries | "ห้องนวด" oil photo; galleries reuse clinic photos + nail polish, alt "" | image-text 1507652313519 (private bath, matches copy); filmstrip/masonry spa spaces with Thai alts | fixed (reset 14:03) |
| course classes | Reformer = backbend in arches, Reformer Flow = singing bowl, Prenatal = B&W down-dog, gallery "สมาธิ" = dead id (404), "คลาสเย็น" = dumbbells | reformer 1747238415033 / 1747239069226, yin = singing bowl, prenatal 1710897869539, studio (oak room) 1687783615494, gallery + reformer room 1717500252297 | fixed (reset 14:03) |
| course /gallery | no closing CTA (A9) | cta card | fixed (reset 14:03) |
| clinic /staff/dr-nicha | 56 px service thumbs load the 800 px card image | thumb() → w=160 | fixed |
| salon home booking widget 1440 | wizard choices 2-up in a ~500 px column → "นวดเท้าและส|ครับ", "90 / นาที" | wizard step grids use container queries (@container; @xl 2-up, @lg form, @2xl date aside) | fixed |
| salon home widget | QA test service "คิวเอ ทรีตเมนต์ 1141" visible on the demo | reset-demo salon | fixed |
| course home 1440 | pinned class posters: titles below the fold (stage 900 px: header 270 + 3:4 poster 480 + text 210) | poster image h-[clamp(15rem,44svh,31rem)], lighter HS header padding | fixed |
| course class / service detail h1 | balance-wrap "Hatha | Yoga เริ่มต้น" | text-pretty | fixed |
| course home/instructors | instructor class chips 36 px, class card titles 33–35 px, session-row class link 24 px | min-h-11 (chips gap-2), card title inline-flex min-h-11, session link -my-2.5 min-h-11 | fixed |
| course home | "คลาสยอด|นิยม", "แค่|ไหน" heading splits; orb cue inside h1; stats wave | shared → qa_shared.md | logged |
| clinic home | sticky-story arch frame never renders; stage shows last photo first | shared → qa_shared.md | logged |
| course home 1440 | image-text heading wraps "ห้องไม้โอ๊ก แสง / ธรรมชาติ และความ / เงียบ…" in the narrow pinned column | forced "
" after แสงธรรมชาติ (+ neutralText pair key updated) | fixed (reset 14:03) |
| course /classes 390 | 4:5 class photos make every card ~1.3 viewports on phones | aspect-[4/3] on phones (sm: 4/5) | fixed |
| restaurant home | features = three empty white cards (weakest block on the page) | bento with photos: lamp-lit dining room (QR), takeaway boxes, open doorway | fixed (reset done) |
| restaurant home | reservation band = western fine-dining plate; gallery repeats it + a modern bar interior | candle-lit garden long table 1738958047430 (matches "โซนสวน"), gallery → garden string lights / long table | fixed (reset 14:03) |
| restaurant /menu, /order, /t | 80–112 px plates load 800 px photos (some rows paint blank while loading) | item-card thumb() → w=256 | fixed |
| restaurant order status | slip preview broken icon (fixture 404) | shared → qa_shared.md | logged |
| all operational pages | giant footer wordmark ≈ 1.3 viewports after short pages | shared → qa_shared.md | logged |
| clinic /contact | floating label overlaps phone placeholder | shared → qa_shared.md | logged |

| clinic home + /packages 1440 | package tickets: price rows at different heights, empty space under short cards | PassTicket perforation + price pinned with mt-auto (all ticket uses) | fixed |
| clinic home 390 | 3 package tickets stacked = 2 400 px | package-list phone snap rail (82 % cards) like services | fixed |
| clinic home gallery + /gallery | filmstrip repeated the consult photo (3x on the page) and the serum flat-lay; /gallery repeated hero + hero inset | arched hallway with skincare shelves 1786937680099, waiting room 1762625570087 (200, looked at) | fixed (reset 14:40) |
| salon hero 1440 + 390 | sub breaks inside loanwords: ทรีต / เมนต์ (1440), เท / อราพิสต์ (390) | U+2060 joiners in the template copy (shared hero renders raw text, see qa_shared) | fixed (reset 14:40) |
| salon home statement | ScrubText broke as '...สวัสดี ที่ / เงียบ...' and 'ซอย / สวัสดี' | copy 'บ้านเก่าในซอยสวัสดี เงียบจนได้ยินเสียงใบไม้' with ซอย+สวัสดี joined (+ neutralText key) | fixed (reset 14:40) |
| salon home gallery + /gallery | 05 = hero hot-stone photo again | floating-flower bowl 1543134968; /gallery + plumeria 1758614256591 | fixed (reset 14:40) |
| salon/course staff + instructor names 390 | name links 33 px wide | min-w-11 | fixed |
| course home image-text | 'และความเงียบกลาง / อารีย์' | lines ห้องไม้โอ๊ก แสงธรรมชาติ / และความเงียบ / กลางอารีย์ (+ neutralText key) | fixed (reset 14:40) |
| course home testimonial 390 | 'เหลือกี่ / ที่' | กี่+ที่ joined in the quote | fixed (reset 14:40) |
| restaurant home + /menu, /order | dish titles split compounds: 'แกงเขียว / หวานไก่บ้าน' | DishName (food compounds as nowrap units + wbr, client-safe) in menu-highlight + item cards | fixed |
| restaurant home features | two small bento tiles: 14 % photo wash reads as smudges | small tiles without photos (big QR tile keeps the dining-room photo); shared note logged | fixed (reset 14:40) |
| restaurant home stats | stats row repeated the hero strip (70 ปี, 32) | 48,000+ / 3 รุ่น / 12 โต๊ะ / 05:00 ออกตลาด | fixed (reset 14:40) |
| salon /services/aroma-90 h1 1440 | 'อโรมาเทอรา / พี 90 นาที' (word splitter breaks the unknown loanword) | nameLines(): break at the space nearest the middle for 12+ char Thai names (not number/unit, prefer Latin/Thai switch) on service/class/staff/instructor detail h1s; accessible name unchanged | fixed |
| about pages (all 4) | statement + CTA only: no image, identical structure on every site; CTA 'มีคำถาม? ทัก / เรามาได้เลย' split | withAboutStory(): clinic image-text overlap (arched hallway) + doctors grid, salon card (floating-flower foot bath), course plain (morning class) + teachers grid, restaurant overlap (wok flame); CTA heading breaks after the question (demo only, neutral page untouched) | fixed (reset 15:00) |
| clinic /gallery 1440 | 8 photos in 3 masonry columns left a ~500 px hole under two columns before the CTA | 9th photo (dental room) | fixed (reset 15:00) |
| restaurant /menu, /order, /t 1440 | checked after DishName: no split compounds, plates load 256 px thumbs | - | ok |
| course /classes, /classes/*, /schedule, /instructors, /packages, /start 1440 | checked: no clipping, posters + schedule fine; giant footer wordmark (shared, logged) | - | ok |
| v5 390 sweep (clinic + salon every page, account pages logged in) | 0 overflow, 0 console/hydration errors, <= 1 live canvas / viewport; audit noise = rail cards off-screen (CLIP), sliding pill text (CON 1.07), footer text links 36x44 | - | ok |
| clinic/salon/course cards + rows + wizard 390 | tenant names split mid-unit: '120 นาที (2 / ท่าน)', 'หน้าสมุนไพร 60 / นาที', '(HIFU / + Pico + Botox)', service fact '฿4,900 เริ่ม / ต้น' | NameWrap (booking hi/name-wrap.tsx, pure string): number+unit, short parentheticals, '/' '+' glued to the word before, short Thai words whole; used in service cards, spa menu rows, pass tickets, class cards, staff-detail rows, service facts, wizard choices | fixed |
| clinic /staff, home staff grid, /about 390 | 'จองกับทพญ.พิมพ์ / ชนก ตั้งใจ' (break inside the name); glass title truncated 'แพทย์ผิวหนัง · ผู้อำ…' | button = 'จองกับ' + wbr + name parts kept whole (text unchanged); title line-clamp-2 | fixed |
| clinic /staff/dr-nicha 390 | service rows truncated 'ปรึกษาแพทย์ + วิเคราะห์…' | line-clamp-2 + NameWrap | fixed |
| clinic /services 390 + 1440 | intro arch photo = card 01's photo directly below it (consult twice in one screen) | intro visuals lead with featured services beyond the first row (pico, hifu) | fixed |
| salon/clinic /services/* 390 | 'ให้บริการโดย' = 4 full-width portraits (4 viewports); related services 3 more viewports | team grid 2-up on phones; related services = phone snap rail | fixed |
| course home + /packages 390 | drop-in ticket: 'เลือกรอบเรียน' button touches the check list (Slot merged mt-auto over mt-6) | button wrapped in mt-auto pt-6 | fixed |
| clinic /about 390 | h1 'Lumière Clinic / — / ความงาม…' (dash alone on a line) | 'Lumière Clinic —\n…' (dash stays with the brand) | fixed (reset 19:36) |
| clinic home 390 | staff h2 'แพทย์ผู้ / เชี่ยวชาญของเรา' | U+2060 in the template copy (shared glue item still logged) | fixed (reset 19:36) |
| clinic + salon footer | about page (doctors / story) not linked anywhere on clinic; salon only in the header | footer + 'เกี่ยวกับเรา' | fixed (reset 19:36) |
| detail breadcrumbs (services/staff/classes/instructors) | category link 28 px wide | min-w-11 | fixed |
| course home 390 | 'คลาสยอด / นิยม', 'แค่ / ไหน' | WJ not possible (course-journey M2 reads innerText) -> shared glue item (already in qa_shared) | logged |
| course /classes 390 (+ every booking card with a portrait photo) | 'Prenatal Yoga', 'Mat Pilates Core' frames ~1:2 instead of 4:3: an aspect-ratio box with overflow:clip grows to its portrait image | .bk-frame min-height:0 (probe _qab-frames.ts: all 8 class frames 0.75, clinic services 1.25, salon staff 1.25) | fixed |
| course /classes/* 390 | upcoming-session rows repeat the class name + level and the date twice on the class's own page; related classes 3 full viewports | SessionRow inClass (row title = full date, no class link/level); related classes = phone snap rail | fixed |
| course /classes/* fact 'รอบประจำ' | '· ส. 09:00' line starts with the dot | segments nowrap, dot kept at the end of the line | fixed |
| course /start, salon, restaurant copy | ' ๆ' at a line start in raw paragraphs ('…อย่างช้า / ๆ ปลอดภัย') | template body/quote/subheading/description copy uses NBSP before ๆ (13 spots incl. 3 neutralText keys, headings untouched — kit splitter already glues) | fixed (reset 19:36) |
| restaurant home reservation band | zone line '8 โต๊ะ · สูงสุด 4 ที่' reads cut off | 'สูงสุด 4 ที่นั่ง' | fixed |
| restaurant home/menu/order/reserve 390 | checked: dish names whole, sticky category pills, calm order page, reserve form + dark info card | - | ok |

## shared issues logged (qa_shared.md ## qa-b)
