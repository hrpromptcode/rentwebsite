
## qa-b
(clinic / salon / course / restaurant visual QA — shared-layer problems; each: where · viewport · what · suggested fix)

- [ ] **sticky-story `mediaStyle="arch"` renders as a rounded rectangle** · demo-clinic `/` (home, "ทุกการรักษาเริ่มจากการฟัง") · 1440 + 390 ·
  screenshot tooling/screenshots/redesign-qa-b-before-clinic-home-1440-p2.png (f08–f10), …-390-p2.png (f12–f14).
  `packages/storefront/src/sections/sticky-story.tsx` Media(): the wrapper gets `rounded-[var(--radius-2xl)]` for every style except
  "full"; that utility (utilities layer) beats `.rw-story-media[data-style="arch"]` (components layer) → the clinic arch motif (§5.3)
  never shows. Fix: `style !== "full" && style !== "arch" && "rounded-[var(--radius-2xl)]"` (or move the arch rule out of the layer).
- [ ] **sticky-story stage shows the LAST item's photo before step 1 activates** · demo-clinic `/` · 1440 · …-clinic-home-1440-p2.png f07:
  heading "ทุกการรักษาเริ่มจากการฟัง" is on screen, step "ปรึกษาแพทย์" not yet active, and the stage already shows step 4's serum photo
  (crossfade stack order). Suggest the crossfade stage defaults to index 0 (or renders item 0 on top) until a step becomes active.
- [ ] **sticky-story: the kit counter "01 / 04" covers the item's "ดูเพิ่มเติม" link chip** · demo-clinic `/` (also demo-restaurant `/`) · ≥ 768 ·
  tooling/screenshots/redesign-qa-b-v3-clinic-home-1440-p2.png f08–f10 (bottom-right of the stage: "ดูส…" peeks out under "01 / 04").
  `motion-kit.css` `.rw-story [data-story-counter]` is `right:1rem; bottom:1rem` and `storefront/src/sections/sticky-story.tsx` puts the link at
  `absolute right-5 bottom-5` (lines 31/41/55). Fix: link chip bottom-left (`left-5`) or the counter top-right when an item has a link.
- [ ] **gallery masonry (parallax columns) runs into its heading** · demo-restaurant `/` "บรรยากาศบ้านริม" · 1440 ·
  …-v3-restaurant-home-1440-p2.png f09 + tooling/screenshots/redesign-qa-b-el-rfeat-1.png: the faster middle column's first photo starts
  ~10 px under the h2 baseline (and overlaps it while scrolling up). Suggest a top margin on the columns ≥ the max parallax travel
  (or start the parallax offset at 0 at the heading and only move downwards).
- [ ] **features bento: small tiles with an image get a 14 % photo wash that reads as a smudge** · demo-restaurant `/` before my template
  change (tooling/screenshots/redesign-qa-b-el-rfeat-0.png tiles 02/03). `storefront/src/sections/features.tsx` Bento(): small tiles render
  `it.image` at `opacity-[.14]` under the text. I removed the images from my template; suggest a real treatment for customers who add
  one (photo strip at the top of the tile, or duotone `mix-blend-multiply` over `--primary-soft` at ≥ 40 %).
- [ ] **Thai glue list: "ผู้เชี่ยวชาญ"** · demo-clinic `/` · 390 · …-v3-clinic-home-390-p2.png f11: staff-grid h2 "แพทย์ผู้ | เชี่ยวชาญของเรา".
  Add `ผู้เชี่ยวชาญ` (and `ผู้สอน`, `ผู้ให้บริการ`) to THAI_GLUE_WORDS with the other items above.
- [ ] **hero sub / section paragraphs are raw text → ICU splits loanwords** (adds to qa-c's ThaiWrap item) · demo-salon `/` hero sub ·
  1440 "ทรีต | เมนต์ผิว", 390 "โดยเท | อราพิสต์" (…-v3-salon-home-1440-p1.png f00, …-390-p1.png f00). I glued them with U+2060 in salon.ts,
  but customers type their own copy: rendering hero `subheading` (and section body paragraphs) through the kit `ThaiWrap` fixes it everywhere.
- [ ] **(low) HoverPreview `<img>` has no `src` until the first hover** · demo-salon `/` spa menu, demo-course `/` · `motion/hover-preview.tsx:110` ·
  an `<img alt="">` without src is reported as a broken image by audits / Lighthouse. Suggest rendering it only after the first
  pointerenter (or a transparent 1×1 data URI as the initial src).

## qa-c
(topup / hotel / events visual QA — shared-layer problems; each: where · viewport · what · suggested fix)

- [ ] **CardStack3D orbit reads small in the hero split media column** · demo-topup `/` · 1440×900 ·
  tooling/screenshots/redesign-qa-c-topup-hero-1440-t8000.png. The 8 cards are ≈ 55×90 px and the portal ring ≈ Ø160 px inside a
  467×584 canvas: the signature scene (§5.2) fills only the middle third of the column and the right half of the first viewport
  feels empty. After the clipping fix (orbit fit = min(1.25, vh/4.6, vw/8.4)) the fit is driven by the viewport, not the canvas.
  Suggest fitting the orbit radius to the canvas (≈ 0.42 × canvas width) and letting the canvas bleed past the column edges
  (pointer-events none on the bleed, cards keep their hit areas) so the cards are ≈ 110–130 px tall at 1440.
- [ ] **shell tap targets < 44 px** · every storefront page (seen on demo-topup / demo-hotel / demo-events) · 1440 ·
  header nav links `a.rw-nav-link` 40 px tall, account icon button 36×36, header CTA 36 px tall, footer social icons `a.rw-ft-social` 40×40.
  Suggest min-height 44 px (nav links can keep the 40 px pill visually with a 44 px hit area via padding / ::before).
- [ ] **hero stats strip orphan on phones** · demo-topup `/` · 390×844 · tooling/screenshots/redesign-qa-c-topup-home-390-before-1.png f1:
  3 stats ("1.2M+", "10 วิ", "4.9/5") in a 2-column grid leave "4.9/5" alone on the second row. Suggest `grid-cols-3` with a smaller
  value step when there are exactly 3 stats (or let the 3rd span both columns).
- [ ] **Thai compound words split by SectionHeading (balance + word units)** · demo-course `/` · 1440 + 390 ·
  …-course-home-1440-p2.png f09 "เรียนบ่อยแค่ | ไหน ก็มีพาสที่พอดี" (แค่ไหน split), …-course-home-390-p1.png f02 "คลาสยอด | นิยมสัปดาห์นี้"
  (ยอดนิยม split). The template cannot force "\n" here: course-journey M2 reads body innerText for these exact headings.
  Fix: add `แค่ไหน`, `ยอดนิยม` (and e.g. `ทั่วถึง`, `ตรงไปตรงมา`, `ชั่วโมง`) to THAI_GLUE_WORDS in `packages/ui/src/motion/split.ts`.
- [ ] **cinematic breathing-orb hero: h1 textContent includes the live breath cue** · demo-course `/` · h1 innerText =
  "หายใจให้ช้าลงค้างไว้แล้วขยับให้ลึกขึ้น" (cue "ค้างไว้" is inside the h1 via the aria-hidden scene span). a11y name is fine (aria-label),
  but crawlers / innerText read the cue. Suggest rendering the scene span as a sibling positioned between the two heading lines
  (`hero.tsx` Cinematic orb branch), or two h1 spans + scene outside the h1.
- [ ] **hero stats strip wave under cinematic orb hero looks like a flat brown blob and the last stat sits on it** · demo-course `/` ·
  390 …-course-home-390-p1.png f01 ("4.9 คะแนนรีวิว" label low contrast on the wave), 1440 …-course-home-1440-p1.png f01.
  Suggest: 3 equal columns on phones (no 2+1 wrap), wave as a thin line / softer tint (≤ 12 % primary) and labels on the plain background.
- [ ] **features bento with 6 items leaves a lone tile on the last row** · demo-events `/` (before my template change) · 1440×900 ·
  tooling/screenshots/redesign-qa-c-events-home-1440-before-1.png f04/f05 ("คืนเงินเต็มจำนวนเมื่องานยกเลิก" alone, 2/3 of the row empty).
  `packages/storefront/src/sections/features.tsx` `bentoSpan(6, i)`: i0 = 4×2, i1 = 2×2, i2–i5 = 2 → rows 1–2 full, row 3 = 3 tiles,
  row 4 = 1 tile, despite the "every count fills its rows" comment. Fix: n === 6 → i1 and i2 `md:col-span-2` (no row-span, they stack
  beside the big tile), i3–i5 `md:col-span-2` (one full row). demo-events now ships 5 items; any tenant can still add a 6th.
- [ ] **scene status "lost" after scrolling away from the hero (WebGL hero does not come back)** · demo-events `/` · 1440 ·
  crawl reports `scenes=[lost,live]` on the home page after a full scroll: the hero `StageTicketScene` ends up `data-scene-status="lost"`.
  `scene-3d.tsx` latches `failed` for the life of the page, and `canvas-host.tsx` feeds it from two sources: `ContextLossGuard`
  (`webglcontextlost`) and `FrameWatch onSlow={onLost}` (the perf watchdog). Probe result: (pending, see below).
- [ ] **floating LINE chat button: the expanded "แชตผ่าน LINE" pill covers copy on phones right after load** · demo-events `/venue`,
  `/contact` · 390×844 · …-events-venue-390-before-1.png f00 (pill over the h1 "ทุกสุดสัปดาห์"), …-events-contact-390-before-1.png f00
  (over the e-mail row). Suggest: show the label only after the first scroll (or only ≥ 768 px), or keep the 56 px icon alone on phones.
- [ ] **two `<h1>` on module-hero home pages** · demo-hotel `/` (and demo-events `/`) · all widths · `packages/storefront/src/render.tsx`
  `H1_SECTIONS = new Set(["hero"])` → RenderSections adds the sr-only page `<h1>` "บ้านทะเล เขาหลัก" although the first section
  (`stay-search` / `event-hero`) already renders the page h1 ("ตื่นมาพร้อมเสียงคลื่น ที่บ้านทะเล"). Fix: H1_SECTIONS = {"hero",
  "stay-search", "event-hero"} (same set as page-body.tsx HERO_TYPES).
- [ ] **body copy breaks inside Thai words / orphans ๆ** · seen on demo-hotel `/` 390 (stay-search sub "และที⏎มงาน", fixed in my
  module with ThaiWrap) and image-text body 1440 ("จนถึงสาย⏎ๆ ทั้งข้าวต้มปลา", tooling/screenshots/redesign-qa-c-hotel-home-1440-before-3.png f13).
  Chromium's ICU line breaker splits words its dictionary lacks and breaks before a spaced "ๆ". Shared sections render paragraphs
  as raw text. Suggest: sections render body/sub copy through the kit `ThaiWrap` (server) — or at least glue " ๆ" → " ๆ" in
  the renderer (I did it in hotel/events/topup template copy).
  More: demo-events `/venue` 390 hero sub "รองรับได้ตั้งแต่เวิร์⏎กช็อป 12 คน" (loanword split mid-word; …-events-venue-390-before-1.png f01) and
  `/` 390 image-text body "เวิร์กช็อปเครื่อง⏎หนัง". The kit glue list (THAI_GLUE_WORDS) only reaches SplitReveal/heading parts; plain
  `<p>` copy goes straight to ICU. Same fix: server ThaiWrap with the glue list for subheading/body in shared sections.
- [ ] (low) **reduced motion: VelocityMarquee fallback wraps every item into a giant multi-line block** · demo-topup `/` · 1440 ·
  tooling/screenshots/redesign-qa-c-topup-home-1440-reduce-1.png f1–f2: 9 game names at outline display size stack into ~4 lines
  (≈ 650 px of static type) between the hero and the game grid. Suggest the reduced-motion fallback keeps one row (nowrap +
  overflow clip / mask fade at the edges) or drops to `--step-4`, so the section keeps its height and rhythm.
- [ ] (low) **sticky-story stage images capped at 1200 px** · demo-hotel `/` · 1440 (seen in the reduced-motion pass) ·
  audit: "อาหารเช้าริมทะเล / สระและหาดส่วนตัว / พระอาทิตย์ตกที่ท่าเรือ …" served 1200 px wide but drawn 1360 px (cover crop scale < 0.8):
  `sticky-story.tsx:15` hard-codes `sized(it.image, 1200)`. When the stage is full-bleed (reduced-motion stacked fallback, wide
  stages) the photo is up-scaled. Suggest `sized(it.image, 2000)` + a `sizes` attribute matching the layout.

## qa-a
(demo-shop / demo-cafe / demo-corporate; screenshots in tooling/screenshots, crawl script tooling/qa/redesign/qa-a-shots.ts)

1. [ui/motion split — Thai compounds] Product h1 on demo-cafe breaks the compound "สั่งทำ": "เค้กวันเกิดสั่ง⏎ทำ (เริ่มต้น)".
   URL http://demo-cafe.localhost:3000/products/custom-cake · 1440×900 · redesign-qa-a-cafe-p-custom-cake-1440.png.
   ICU splits สั่ง|ทำ and `text-balance` then picks that break. Suggested fix: add common commerce compounds to
   THAI_GLUE_WORDS (packages/ui/src/motion/split.ts): "สั่งทำ", "หมวดหมู่", "ของแต่งบ้าน", "ส่งฟรี", "ลดราคา", "พร้อมส่ง", "ล่วงหน้า",
   "วันเกิด" (and any other 2-word compounds product names commonly use) — product names come from customers, so the glue
   list is the only lever (they render through RevealHeading/SplitReveal).
2. [three/fx — one live canvas per viewport] ShaderBackdrop (cta `card` mesh / cta `glow` aurora) is not part of the scene
   budget: a CTA card/glow right after a CurvedGallery / sticky scene gives 2 live WebGL canvases in one viewport.
   Seen on http://demo-corporate.localhost:3000/work (curved-gallery ARCHIVE → cta glow) 1440×900, crawl reported
   maxLiveInView=2 (redesign-qa-a-corp-work-1440-sheet.png f07/f08). I changed corporate.ts (/work CTA → wordmark), but any
   tenant can compose the same pair in the page builder. Suggested fix: a global "one live canvas" arbiter in
   three/core (scene-3d / canvas-host): when a second canvas would go live, the farther-from-centre one drops to its poster.
3. [three — FloatingObjects pastry set, candy preset] The hero pastries read as pale, overexposed blobs (cream macaron /
   yellow donut with almost no shading or saturation) — the weakest 3D moment of the three sites.
   http://demo-cafe.localhost:3000/ 1440×900 · redesign-qa-a-cafe-home-1440.png (right half). Suggest: lower ambient / add a
   warm key + rim light, theme-tinted glaze (primary/accent mix) and darker sprinkles so the clay look has form; keep
   them slightly in front of the scatter cards' drop shadows.
4. [three — ImageSilk on phones] The silk panel keeps the photo's aspect inside the 52svh box, so a landscape lookbook photo
   leaves ~40 % of the hero box empty above/below the rod (http://demo-shop.localhost:3000/ 390×844,
   redesign-qa-a-shop-home-390.png, run before my fix). I switched demo-shop to a portrait (ar=3:4) photo, but customers will
   upload landscape photos. Suggest: on portrait viewports crop the texture to the box aspect (cover UVs) instead of
   letterboxing, or cap the box height to the panel height.
5. [shell — tap targets] Desktop header nav links are 40 px tall and the account / cart icon buttons 36×36 (all three sites);
   on phones the footer text links are ~33 px wide ("ติดต่อ" 33×44; commerce breadcrumbs fixed by qa-a). WCAG 2.2 AA is met (≥24),
   but the brief asks ≥44 px. Suggest min-height 44 px on header nav links/icons and min-width 44 px (padding-inline) on
   footer/breadcrumb links.
   Also 1440: footer contact links (tel / e-mail) are 20 px tall ("081-234-5678" 95×20, "hello@siam-atelier.co" 137×20 on every
   demo-shop page) — below the 24 px WCAG 2.5.8 minimum; give footer contact rows min-height 24 px (44 on touch).
6. [storefront hero cinematic — phones] The ParticleMorph object sits behind the eyebrow + first heading line, so white particles
   run through "SOFTWARE & DESIGN STUDIO" and "สร้างระบบที่ทีมของคุณ" (legibility). http://demo-corporate.localhost:3000/ 390×844 ·
   tooling/screenshots/redesign-qa-a-corp-home-390.png. Suggest: below md, keep the scene in the top ~45svh (centre y ≈ 30 %) and start
   the copy block under it, or add a background-coloured scrim (gradient from --background) behind the copy.
7. [ui/motion — FYI] the commerce product h1 now splits on spaces with a container-capped size (qa-a, apps/web products/[slug]), but the
   THAI_GLUE_WORDS fix (#1) is still needed for product cards and other headings ("เค้กวันเกิดสั่ง⏎ทำ" in cards at 390).
   NEW, worse: Node ICU segments "ฝ้ายออร์แกนิก" as "ฝ้า|ยออร์|แก|นิก", so ThaiWrap broke INSIDE ฝ้าย ("เสื้อยืดคอกลม ฝ้า⏎ยออร์แกนิก",
   demo-shop product card 390, redesign-qa-a-shop-home-390-sheet.png f04). Please add "ออร์แกนิก" (and "สั่งทำ", "หมวดหมู่",
   "ของแต่งบ้าน", "ล่วงหน้า", "วันเกิด") to THAI_GLUE_WORDS. qa-a ships a module-local stopgap (commerce `components/thai-name.tsx`,
   used by product cards + category list) — delete its list once the kit has these words.
- [ ] (low) **PaymentPanel slip preview shows a broken-image icon when the slip URL 404s** · demo-restaurant `/orders/r/R-1030?p=…` · 1440 ·
  …-restaurant-order-status-1440.png f01 (journey fixture `/uploads/qa/slip.png`). `packages/storefront/src/payments/payment-panel.tsx:166`
  — add an onError fallback (hide the img, keep the "ได้รับสลิปแล้ว" text) so a missing file never renders a broken icon.
- [ ] **giant footer wordmark eats ~1.3 viewports on short operational pages** · demo-course `/schedule`, demo-restaurant `/order`, `/t/[qr]`,
  `/reserve` · 1440 · …-course-schedule-1440.png f02–f03, …-restaurant-order-1440.png f03–f04. Suggest a compact footer (no giant
  wordmark, or `--step-6` cap) when `routeKind` is operational (§6.4 "operational pages stay calm and fast").
- [ ] **contact form: floating label overlaps the phone placeholder** · demo-clinic `/contact` (also classic variant on salon/course/restaurant) ·
  1440 · …-after-clinic-contact-1440.png f00 — "เบอร์โทรศัพท์" label sits on top of the "08x-xxx-xxxx" placeholder (both visible at rest).
  `packages/storefront/src/sections/contact.tsx`: with a floating label, hide the placeholder until focus (`placeholder:opacity-0
  focus:placeholder:opacity-100`) or drop the placeholder and put the hint under the field.
