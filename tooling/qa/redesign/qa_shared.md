
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
- [ ] **two `<h1>` on module-hero home pages** · demo-hotel `/` (and demo-events `/`) · all widths · `packages/storefront/src/render.tsx`
  `H1_SECTIONS = new Set(["hero"])` → RenderSections adds the sr-only page `<h1>` "บ้านทะเล เขาหลัก" although the first section
  (`stay-search` / `event-hero`) already renders the page h1 ("ตื่นมาพร้อมเสียงคลื่น ที่บ้านทะเล"). Fix: H1_SECTIONS = {"hero",
  "stay-search", "event-hero"} (same set as page-body.tsx HERO_TYPES).
- [ ] **body copy breaks inside Thai words / orphans ๆ** · seen on demo-hotel `/` 390 (stay-search sub "และที⏎มงาน", fixed in my
  module with ThaiWrap) and image-text body 1440 ("จนถึงสาย⏎ๆ ทั้งข้าวต้มปลา", tooling/screenshots/redesign-qa-c-hotel-home-1440-before-3.png f13).
  Chromium's ICU line breaker splits words its dictionary lacks and breaks before a spaced "ๆ". Shared sections render paragraphs
  as raw text. Suggest: sections render body/sub copy through the kit `ThaiWrap` (server) — or at least glue " ๆ" → " ๆ" in
  the renderer (I did it in hotel/events/topup template copy).
