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
- NEXT: after 390 key pages, reduce + nogl passes, journeys (booking rerun, course, restaurant), typecheck, module tests.

## findings (page | issue | fix | status)
| site/page | issue | fix | status |
|---|---|---|---|
| clinic services/home/packages | wrong photos: HIFU = oil back-massage, Aqua Peel = lotion bottle + tulips, Pico = clay mask, scaling = x-ray hand, consult = laptop; packages reuse them | clinic.ts: consult 1666214277730 (doctor + client), filler 1573461160327, pico 1552693673 (device facial), hifu 1595871151608 (treatment room), aqua-peel 1616394584738, scaling 1606811841689 (dentist + patient); packages pico/aqua/bride 1552693673/1616394584738/1600428853876 | fixed (reset pending) |
| clinic home gallery + /gallery | "บรรยากาศคลินิก" = laptop, bottle, lone chair; /gallery = spa massage photos, alt "" | lobby 1631248055158, room 1595871151608, dental 1629909615184, consult, skincare; /gallery 8 clinic photos with Thai alts | fixed (reset pending) |
| clinic home sticky-story | step 1 "ปรึกษาแพทย์" = laptop + stethoscope | 1666214277730 | fixed (reset pending) |
| clinic hero | secondary inset = spa back massage | jade roller 1600428853876 | fixed (reset pending) |
| clinic /contact | §5.0: clinic contact should use chips | contactPage({ variant: "chips", interests }) | fixed (reset pending) |
| clinic/salon/course cards 390 | card title links 39 px tall (< 44) | inline-flex min-h-11 (service + pass cards) | fixed |
| clinic home 390 | services = 6 full-width cards ≈ 3 600 px column | phone snap rail (78 % cards, next peeks) .bk-rail | fixed |
| clinic /services/botox | h1 balance-wraps "Botox ลด | กราม / ริ้วรอย" | text-pretty | fixed |
| salon services | thai-60/90 same photo, hot-stone = clay facial, facial = back massage, scrub = nail polish, aroma/couple = lotion bottle | thai-60 1596178060671, thai-90 1775133262667 (herbal compress), foot 1519415510236, aroma 1544161515, hot-stone 1696841212541, facial 1598901986949, scrub 1590439471364, couple 1560750588 | fixed (reset pending) |
| salon home image-text + galleries | "ห้องนวด" oil photo; galleries reuse clinic photos + nail polish, alt "" | image-text 1507652313519 (private bath, matches copy); filmstrip/masonry spa spaces with Thai alts | fixed (reset pending) |
| course classes | Reformer = backbend in arches, Reformer Flow = singing bowl, Prenatal = B&W down-dog, gallery "สมาธิ" = dead id (404), "คลาสเย็น" = dumbbells | reformer 1747238415033 / 1747239069226, yin = singing bowl, prenatal 1710897869539, studio (oak room) 1687783615494, gallery + reformer room 1717500252297 | fixed (reset pending) |
| course /gallery | no closing CTA (A9) | cta card | fixed (reset pending) |
| clinic /staff/dr-nicha | 56 px service thumbs load the 800 px card image | thumb() → w=160 | fixed |
| salon home booking widget 1440 | wizard choices 2-up in a ~500 px column → "นวดเท้าและส|ครับ", "90 / นาที" | wizard step grids use container queries (@container; @xl 2-up, @lg form, @2xl date aside) | fixed |
| salon home widget | QA test service "คิวเอ ทรีตเมนต์ 1141" visible on the demo | reset-demo salon | fixed |
| course home 1440 | pinned class posters: titles below the fold (stage 900 px: header 270 + 3:4 poster 480 + text 210) | poster image h-[clamp(15rem,44svh,31rem)], lighter HS header padding | fixed |
| course class / service detail h1 | balance-wrap "Hatha | Yoga เริ่มต้น" | text-pretty | fixed |
| course home/instructors | instructor class chips 36 px, class card titles 33–35 px, session-row class link 24 px | min-h-11 (chips gap-2), card title inline-flex min-h-11, session link -my-2.5 min-h-11 | fixed |
| course home | "คลาสยอด|นิยม", "แค่|ไหน" heading splits; orb cue inside h1; stats wave | shared → qa_shared.md | logged |
| clinic home | sticky-story arch frame never renders; stage shows last photo first | shared → qa_shared.md | logged |
| course home 1440 | image-text heading wraps "ห้องไม้โอ๊ก แสง / ธรรมชาติ และความ / เงียบ…" in the narrow pinned column | forced "
" after แสงธรรมชาติ (+ neutralText pair key updated) | fixed (reset pending) |
| course /classes 390 | 4:5 class photos make every card ~1.3 viewports on phones | aspect-[4/3] on phones (sm: 4/5) | fixed |
| restaurant home | features = three empty white cards (weakest block on the page) | bento with photos: lamp-lit dining room (QR), takeaway boxes, open doorway | fixed (reset done) |
| restaurant home | reservation band = western fine-dining plate; gallery repeats it + a modern bar interior | candle-lit garden long table 1738958047430 (matches "โซนสวน"), gallery → garden string lights / long table | fixed (reset pending) |
| restaurant /menu, /order, /t | 80–112 px plates load 800 px photos (some rows paint blank while loading) | item-card thumb() → w=256 | fixed |
| restaurant order status | slip preview broken icon (fixture 404) | shared → qa_shared.md | logged |
| all operational pages | giant footer wordmark ≈ 1.3 viewports after short pages | shared → qa_shared.md | logged |
| clinic /contact | floating label overlaps phone placeholder | shared → qa_shared.md | logged |

## shared issues logged (qa_shared.md ## qa-b)
