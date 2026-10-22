# commerce agent progress (phase 2) — module pages + shop/cafe templates
Owner: packages/modules/commerce/src/{components,sections}/** + labels, routes products, collections, cart, checkout,
orders/[orderId]/**, orders/track/** ; templates packages/templates/src/{shop,cafe}.ts ; journey tooling/qa/commerce-journey.ts
Verification script (mine): tooling/qa/redesign/commerce-shots.ts (`cd tooling && pnpm exec tsx qa/redesign/commerce-shots.ts --only=shop,cafe --w=1440,390 [--home] [--reduce] [--pages=products,collections,collection,search,detail,cartempty,cart,checkout,order,track,ordernotfound]`)

## status
- [x] read direction §1-2/§5.0/§5.1/§5.7/§6.4/§7, kits, sections/shell docs (2026-10-22, run 2)
- [x] read commerce components / routes / journey (hooks below)
- [x] commerce styles (components/commerce-styles.tsx, hoisted) + card language (editorial / hover-swap tilt / sticker) + quick-add (quick-add.tsx, fly-to-cart.ts)
- [x] sections: product-grid (split heading + count + CtaButton), category-list (hover-reveal index on editorial presets, refined tiles else)
- [x] listing pages: ListingIntro (local PageIntro variant), CategoryChips sliding pill, next/form filters (soft nav), CatalogGrid FLIP + density toggle
- [x] product detail (3D card stack gallery + zoom dialog, sticky buy box, spring chips, ✓ morph + fly-to-cart, marquee, editorial details/reviews) — mobile checked (sticky bar portalled)
- [x] cart, checkout, order status, track (FlowHeader + CheckoutSteps, layout row exits, flash numbers, receipt, drawn check, route art)
- [x] templates shop.ts + cafe.ts → reset demos + create-admin (last: cafe 2026-10-22 ~05:25, category images); provision-neutral 10/10 green
- [x] screenshots + iterate (1440 + 390 every route, both sites; reduced-motion pass; interaction script)
- [x] typecheck (web + commerce + templates) green; commerce tests 123/123; commerce-journey 46/46 (no journey edits needed)

## journey hooks to KEEP (tooling/qa/commerce-journey.ts)
- listing: `article a[href^="/products/"]` (>=4); EVERY `article` on /products is a product card whose first `span.font-semibold.tabular-nums`
  is the selling price (Price component) -> never use <article> for anything else on listing pages;
  first `p[aria-live=polite]` = "N รายการ" (collection: startsWith "N รายการ"); chips `a[href^="/collections/"]` hasText name, visible;
  collection page has `a[aria-current="page"]`; `select[name="sort"]` auto-submits; `input[name="q"]` + Enter; link /ล้างตัวกรอง/;
  `nav[aria-label="pagination"]`; text "ยังไม่มีสินค้าในร้าน" (informational only)
- detail: h1 text; button name "เพิ่มลงตะกร้า" (quick-add buttons elsewhere must NOT contain that substring in their name);
  `button[aria-pressed]` textContent exactly S/M/L/XL; `button[aria-label="เพิ่มจำนวน"]` >=44px, `input[aria-label="จำนวน"]`;
  toast "เพิ่มลงตะกร้าแล้ว"; header badge `header a[href="/cart"]` text = number; mobile: first visible "เพิ่มลงตะกร้า" (sticky bar) not covered
- cart: `.card` containing `input[aria-label="จำนวน"]` includes variant title; `button[aria-label="ลดจำนวน"]`; first `dl` = summary
  ("ส่วนลด", "ค่าจัดส่ง ส่งฟรี"); `#coupon`, button "ใช้โค้ด", `button[aria-label="ยกเลิกโค้ด"]`, error `form p.text-destructive`; link /ไปชำระเงิน/
- checkout: #name #phone #email #line1 #subdistrict #district #province(77 opts) #postalCode; text "รับสินค้าที่ร้าน ไม่ต้องกรอกที่อยู่จัดส่ง";
  `div[role=radiogroup][aria-label="วิธีจัดส่ง"] label` (each shows ฿/ส่งฟรี); getByText(shipping name, exact); getByText("สแกน PromptPay", exact);
  `input[name=paymentMethod]`; `dl dd.font-heading` (total); submit button text "สั่งซื้อและชำระเงิน" (visible one); "วิธีจัดส่งนี้ชำระแบบเก็บเงินปลายทางเท่านั้น"
- order: h1 contains "#1234"; `ol[aria-label="สถานะคำสั่งซื้อ"]` 4 li; `img[alt="PromptPay QR"]`, `p.heading-display`, "หมดอายุใน",
  `input[type=file]` (PaymentPanel — shared); "WELCOME10"; "ชำระเงินสำเร็จ"; "ชำระเงินเรียบร้อย"; "ชำระแล้ว"; "เก็บเงินปลายทาง";
  "ค่าธรรมเนียมเก็บเงินปลายทาง"; "ยืนยันแล้ว"; not found: "ไม่พบคำสั่งซื้อ" without the number
- track: #tr-number, #tr-contact, button "ค้นหาคำสั่งซื้อ"
- journey contexts run with reducedMotion "reduce"

## decisions
- definitions (schemas) are frozen: module sections keep props; renderings keyed on existing values + theme preset
  (category-list tiles -> hover-reveal index on editorial presets; product-grid standard -> sticker cards on playful presets)

## For shared owners
- [shell/sections] CLASS COLLISION `.rw-chat`: sections/testimonials.tsx variant "chat" puts `rw-chat` on its bubble column, and
  shell/shell.css styles `.rw-chat` as the fixed LINE pill (position fixed, green, 56px tall) → any page with testimonials
  variant="chat" shows a ~670px green bar fixed at the bottom-right. Rename one (e.g. `.rw-tchat`). demo-cafe uses "marquee"
  until fixed — switch cafe.ts testimonials back to `variant: "chat"` (§5.7 item 7) afterwards.
- [sections] hero `scatter` at 1440×900: a 2-line Thai heading whose first line wraps (cafe "ขนมอบที่ทำให้วันธรรมดา\nหวานขึ้นนิดนึง")
  pushes the CTAs below the fold; consider a narrower step / wider copy column for scatter.
- [shell] mobile floating LINE pill stays expanded ("แชตผ่าน LINE") for 30 s+ in 390 screenshots (spec: collapse after 4 s).

## log
- 2026-10-22 run 2: built styles/cards/quick-add/sections/listing/detail/cart/checkout/order/track; shop.ts (editorial hero \n + giant +
  cornerLabels, marquee outline, sticky-story 4 steps, cta wordmark) and cafe.ts (scatter hero + 5 cards, polaroid gallery, chat
  testimonials) composed — demos NOT yet reset (other agents' templates had syntax errors: clinic.ts / salon.ts literal newlines)
- 2026-10-22 ~05:10: commerce-journey 46/46 green (shop + cafe). Interaction script qa/redesign/_commerce-interact.ts: drag stack,
  zoom open/Esc, variant pill, ✓ morph, quick-add toast, FLIP on sort, density toggle, index hover preview — all PASS, 0 console errors.
  Fixed: phone sticky buy bar was inside a Reveal (opacity 0 until scrolled into view) → portalled to <body> after mount.
- next: reduced-motion pass, cafe interactions, final 1440/390 screenshots of every route, module tests, provision-neutral test.
- 2026-10-22 ~05:35 DONE. Final shots: tooling/screenshots/redesign-commerce-<shop|cafe>-<page>-<1440|390>.png (+ -home- sheets,
  -reduce, -ix-* interaction frames). Category tiles/index borrow a product photo when a category has none (withCategoryImages).
