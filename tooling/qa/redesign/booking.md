# booking agent progress (phase 2) — booking module pages + clinic/salon/course templates
Owner: packages/modules/booking/src/{components,sections}/** + labels, routes services, staff, book, bookings, classes, schedule,
instructors, packages, account/{bookings,packages}; templates clinic.ts, salon.ts, course.ts; journeys booking-journey.ts, course-journey.ts

## done
- 2026-10-22 run 1: read direction §0-2, §5 (clinic/salon/course), §6-9, kit3d.md, kitmotion.md, sections.md, shell.md
- 2026-10-22 run 2 (successor): re-read docs, both journeys (hooks below), every owned page/component/section, templates

- run 2: verified portrait ids (contact sheets): clinic dr-nicha 1614608682850-e0d6ed316d47, dr-kan 1622902046580-2b47f47f5471,
  dr-pim 1594824476967-48c8b964273f; salon ann 1548142813-c348350df52b, mali 1534751516642-a1af1ef26a56, nam 1580489944761-15a19d654956,
  bow 1567532939604-b6b5b0db2604; course kru-nan 1592621385612-4d7129426394, kru-ploy 1606406054219-619c4c2e2100,
  kru-mook 1607746882042-944635dfe10e, kru-beam 1507003211169-0a1dd7228f2d (all 200, looked at)
- run 2: hi kit built (components/hi: look, styles, intro, filter-pills, category-tabs, portrait, service-views, people-views,
  pass-views, class-views, status-views), class-cards primitives theme-toned, week-timetable "living grid", wizard restyle
  (step line, pop-in choices/slots, ticket summary with flash), slot picker, calendar; all 8 sections; all owned pages rewritten
  (services, staff, classes, schedule, instructors + details, packages, buy, book, bookings/[id], account/*).
  `pnpm --filter @rentweb/web --filter @rentweb/module-booking typecheck` green.

- run 2: templates recomposed (clinic: hero 
 + scene auto, sticky-story arch replaces image-text, consult image fix A7,
  gallery CTA; salon: cinematic water-ripple hero on hot stones, text large statement, image-text "พักในบ้าน ไม่ใช่ในห้าง",
  gallery page intro text + CTA; course: cinematic breathing-orb hero, class-highlights editorial (HorizontalScroll, 6),
  features list, image-text pinned) + Unsplash staff portraits. provision-neutral 10/10. reset-demo clinic/salon/course +
  create-admin done (04:36).
  NOTE: python edits through bash heredocs turned "\n" into real newlines in template strings — use chr(92) / the Edit tool.

- run 2 ~05:10: journeys green after the redesign: booking-journey 26/26, course-journey 15/15.
  Fixed afterwards: hydration style mismatch (wizard motion `animate` depended on useReducedMotion → null on SSR;
  timetable day panel `initial` likewise) — keep motion props identical on server/client.
- review iterations: clinic hero 4 controlled lines, features columns 4, sticky-story short titles, salon hero 3 lines,
  spa menu 12-col groups, ticket notches on the perforation (not masks), whole-baht per-session, summary rows no remount,
  2-col people grids on phones, organic frames show the title below, single performer layout, aspect-square cards on phones.

- run 2 ~05:40 FINAL: typecheck web + module-booking + templates green; module-booking tests 58/58; provision-neutral 10/10;
  booking-journey 26/26 (no hydration warnings left; remaining console lines are the journey's own aborted fetches /
  expected 400/404 checks); course-journey 15/15 (no console errors). Reduced-motion pass: static orb/poster, all content.
  Cursor labels on cards/rows (ดูบริการ / ดูคลาส / โปรไฟล์ / ดูรายละเอียด).

## STATUS: DONE (2026-10-22 05:40)

## screenshots (tooling/screenshots/)
- redesign-booking-<clinic|salon|course>-<route>-<1440|390>.png — contact sheets of viewport frames (--frames): clinic home,
  services, services-cat, service, staff, staff-profile, packages, book, book-date; salon home, services, services-cat,
  service, staff, staff-profile, book, gallery; course home, classes, classes-beginner, class, schedule, instructors,
  instructor, packages, start, book
- redesign-booking-salon-flow-{date,time,details,confirm,booked}-1440.png (wizard choreography + status page)
- redesign-booking-clinic-account-{bookings,packages,package,buy}-1440.png (signed-in operational pages)
- redesign-booking-*-reduce-1440.png (reduced motion, first viewport)
- scripts: qa/redesign/booking-shots.ts (--frames/--top/--reduce), booking-flow-shots.ts, booking-account-shots.ts,
  _booking-imgsheet.ts (Unsplash id contact sheet for image verification)

## next
1. verify new Unsplash portrait ids (doctors / therapists / instructors) — pravatar 160px faces look wrong in arches
2. hi kit: look.ts (siteType → clinic|spa|studio|default motif), styles (hoisted CSS), ModuleIntro, FilterPills (client, sliding pill),
   MotifFrame/Portrait (DisplaceImage hover), PassCard (TiltCard + GradientBorder), ServiceIndex (HoverPreview rows)
3. sections: service-list, staff-grid, package-list, class-highlights (editorial → HorizontalScroll), weekly-schedule, instructor-grid,
   pass-pricing, booking-widget frame
4. pages: services(+detail), staff(+detail), classes(+detail), schedule, instructors(+detail), packages, buy, book, bookings/[id], account/*
5. templates clinic/salon/course per §5.3/5.5/5.8 → reset-demo + create-admin, provision-neutral test
6. screenshots 1440/390 + reduced motion, journeys, typecheck, module tests

## journey hooks to keep (booking-journey S*/C*, course-journey C*/M*)
- /services: h1 "บริการทั้งหมด" (category → h1 = category name), distinct a[href^="/services/"] ≥ active count, text "N รายการ", "มัดจำ",
  "ฟรี", "เริ่มต้น"; EXACTLY ONE a[href^="/book?service="] per service (skin category → 2). No horizontal overflow at 390.
- /services/aroma-90: h1 name, "ชำระมัดจำ ฿300", "ให้บริการโดย"
- /staff: h1 "ทีมของเรา", "4 ท่าน"/"3 ท่าน", names, ≥4 a[href^="/book?staff="]; /staff/mali h1 "พี่มะลิ", "บริการที่ดูแล"
- wizard: h1 "จองคิวออนไลน์", button[aria-pressed] service/staff/slot chips (slot text starts HH:MM, no "เหลือ n ที่" for couple),
  getByText (STRICT, unique): "เลือกผู้ให้บริการ" "เลือกวันที่สะดวก" "ข้อมูลสำหรับติดต่อ" "ตรวจสอบและยืนยันการจอง" "กำลังโหลดเวลาว่าง…"
  "กำลังตรวจสอบวันว่าง…"; button "ใครก็ได้ที่ว่าง"; button[role=gridcell][data-date] (+aria-disabled, .animate-pulse while loading);
  h3[data-step="time"]; #bk-name #bk-phone #bk-email #bk-note; buttons "ถัดไป" "ยืนยันการจอง"; p[role=alert]; texts "ไม่ต้องมัดจำ ยืนยันทันที",
  "ชำระตอนนี้ (มัดจำ)", "วิธีชำระมัดจำ", "แพ็กเกจสำหรับ 2 ท่าน", "ค่าเรียน", "ใช้สิทธิ์คอร์ส"
- /bookings/[id]: getByText "หมายเลขการจอง" (unique), BK-xxxx, status labels, "จองสำเร็จ", "ยอดที่ต้องชำระ", "ไม่สามารถเปิดการจองนี้ได้",
  "นโยบายการยกเลิก / เลื่อนนัด", buttons "เลื่อนนัด" "ยกเลิกการจอง" "ยืนยันยกเลิกการจอง" /ยืนยันเลื่อนเป็น/, #cancel-reason,
  "เลือกวันและเวลาใหม่", "เลื่อนมาจากการจองก่อนหน้า", "การจองนี้ถูกยกเลิกแล้ว", "จองใหม่อีกครั้ง", too_late copy, "ชำระที่ร้าน", "ยืนยันเมื่อ", "2 ท่าน"
- /packages: h1 "คอร์สและแพ็กเกจ"/"คลาสพาสและแพ็กเกจ", ≥3 a[href^="/packages/"][href$="/buy"], "ประหยัด", "คอร์สของฉัน · เหลือ N ครั้ง";
  course: `article, .card` filtered by "คลาสพาส 5 ครั้ง" FIRST match must be that pass's own card (no wrapping article/.card)
- buy: getByText "ยอดชำระ" unique, "ซื้อในชื่อ", input[name=consent], submit text "ซื้อแพ็กเกจ"
- /account/packages(/id): h1 "คอร์สของฉัน", "ใช้งานได้ N คอร์ส · เหลือรวม N ครั้ง", "รอชำระเงิน", "ใช้งานได้", "คอร์สพร้อมใช้งาน", /ครั้งคงเหลือ\s*5/, "ใช้ได้ถึง", "จองคิวใช้สิทธิ์"
- /account/bookings: h1 "การจองของฉัน"/"คลาสของฉัน", "นัดถัดไป (N)"/"คลาสถัดไป (N)", exactly 1 a[href="/bookings/<id>"] per booking
- /classes: h1 "คลาสทั้งหมด" / "คลาสเริ่มต้น" / "พิลาทิส", ≥8 distinct a[href^="/classes/"], /\d+ คลาส · \d+ รอบต่อสัปดาห์/; filtered pages must NOT
  mention other classes anywhere (no marquee of all classes)
- /classes/hatha-basic: "สิ่งที่จะได้เรียน" "รอบเรียนที่กำลังจะมาถึง" "ครูแนน" "12 คน" "฿450", [data-testid=upcoming-sessions] a[href^="/book?service=hatha-basic"],
  /เหลือ \d+ ที่นั่ง/, FIRST a hasText "สมัครเรียนคลาสนี้" → /book?service=hatha-basic&date=…&start=…, "ใช้คลาสพาสกับคลาสนี้ได้"
- /schedule: h1 "ตารางเรียนรายสัปดาห์", testid schedule-summary /(\d+) รอบ · เปิดรับ (\d+) รอบ/, testid schedule-week, session links
  a[href^="/book?service="] innerText with "เหลือ n ที่นั่ง", link "สัปดาห์ถัดไป", mobile: exactly 7 role=tab, 1 visible tabpanel
- /instructors: h1 "ครูผู้สอนของเรา", "4 ท่าน"; /instructors/kru-nan h1 "ครูแนน", "คลาสที่สอน", a[href="/schedule?instructor=kru-nan"]
- course home text: "คลาสยอดนิยมสัปดาห์นี้" "ตารางเรียน 7 วันข้างหน้า" "ครูผู้สอนของเรา" "เรียนบ่อยแค่ไหน ก็มีพาสที่พอดี" "เสียงจากนักเรียน"
- provision-neutral: new-tenant visible copy must not contain times (\d:\d\d), BTS/ซอย/ถนน, landmarks (อารีย์, สุขุมวิท, ซอยสวัสดี…) →
  any new sample-place copy needs a neutralText pair

## decisions
- motif by business (siteType / modules), colours by theme: clinic = arch frames + glass, spa (salon) = soft stone radius + slow water,
  studio (course) = tall pills + breath; default = rounded.

## For shared owners
- sections/stats (sections agent): `Num` passes no `decimals` to Odometer, so non-integers round — clinic
  "4.9 คะแนนรีวิว Google" renders "5" (also course hero stats strip is fine because those are strings). Suggest
  `decimals={Number.isInteger(it.value) ? 0 : String(it.value).split(".")[1]?.length}` (and `toLocaleString` with the
  same fraction digits at fx=off).
- sections/hero `headingClass` (sections agent): auto size is chosen from the total length, so a Thai heading with two long
  `
` lines (clinic "สวยอย่าง…ไว้ใจ", 37 graphemes) stays at --step-5 inside the 7/12 split column and wraps to 4 lines; at
  1440×900 the CTAs fall just below the fold. Suggest sizing by the LONGEST line (e.g. > 12 graphemes per line → step-4)
  or a `headingSize: "lg"` (step-4) option. (Templates now force 4 balanced lines meanwhile.)
- storefront `PageIntro`/`rw-draw-line`: the scroll-driven draw line is half drawn at the top of short intros (animation
  range "entry 15% cover 45%" never completes above the fold) — fine, but a mount-time draw would read better on module pages.
- kit FloatingObjects in a 4:5 media box: the glass droplets look great; consider exposing `count` in docs (works, used 6).
