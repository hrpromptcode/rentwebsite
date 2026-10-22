# qa-a progress (phase 3 — visual QA + fix: demo-shop, demo-cafe, demo-corporate)
Owner: packages/modules/commerce/src/{components,sections}/**, commerce routes (products, collections, cart, checkout, orders/[orderId], orders/track),
packages/templates/src/{shop,cafe,corporate}.ts, common routes (tenant page.tsx, [...slug], account index/login/orders, preview).
Shared issues → tooling/qa/redesign/qa_shared.md (## qa-a).

## status
- [x] read direction §5.1/5.6/5.7 + commerce/common/shared1 notes (2026-10-22 start, no predecessor)
- [x] crawl script qa/redesign/qa-a-shots.ts (+ _qa-a-db.ts crawl map, _qa-a-imgsheet.ts Unsplash contact sheet)
- [~] normal crawl 1440+390 running (log screenshots/_qa-a-normal.log, report screenshots/redesign-qa-a-report-normal.txt)
- [ ] crawl shop / cafe / corporate 1440 + 390 + reduce + no-webgl
- [ ] fixes
- [ ] re-verify
- [ ] typecheck web + commerce, commerce tests, commerce-journey, line_login-journey

## findings
| site | page | issue | fix | status |
|---|---|---|---|---|
| shop | home hero | inset photo (imageSecondary "รายละเอียดผ้า") = woman in yellow tracksuit at a basketball hoop — off-brand | shop.ts → woven-fabric close-up 1643766882273 | code, reset pending |
| shop | home sticky-story | step photos wrong: ปลูกฝ้าย=knit poncho, ทอมือ=bedroom lamp, ตัดเย็บ=clothes rack | cotton field 1761069183527 / indigo shibori 1778084355441 / loom warp 1719462193202 / hand-sewing 1764298493253 | code, reset pending |
| shop | home image-text | "ช่างทอผ้า" photo = living room with macramé | ikat weaver at loom 1640292343595 | code, reset pending |
| shop | home features | 4 icon cards in 3 columns → orphan 4th card centred on row 2 | columns: 4 | code, reset pending |
| shop | products / cards / detail | product photos contradict names (sand shirt=blue dotted shirt, woven tote=black backpack, clutch=floral handbag, cushion=bedroom, sofa throw=framed prints, wide pants=pink joggers, indigo dress=white dress) | matching photos (2 per product for hover-swap / gallery) | code, reset pending |
| shop | category tiles | bags category photo shows a branded Gucci logo bag | woven totes 1524679813234; apparel studio rack 1788500304966; home knit throw 1674475760738 | code, reset pending |
| shop | about | text-only page (statement + CTA), no imagery for an atelier | masonry gallery "ในสตูดิโอของเรา" (6 photos) inserted after the statement (demo only; neutral page unchanged) | code, reset pending |
| shop/cafe | products (any) | product with no photo renders an empty beige block (seen with leftover "QA สินค้าทดสอบ" from admin-journey) | product-card typographic placeholder (.rwc-noimg, first letter, theme tint) | code |
| shop/cafe | products / collections | "ทุกหมวดหมู่" chip count = sum of category counts (8) while the page says 9 รายการ (uncategorised product) | CategoryPills allCount from the routes (all active products) | code |
| cafe | products | almond croissant = rye loaf, coconut cake = chocolate cake, iced latte = hot latte art | 1710220988376 / 1716579895359 / 1764298490445 | code, reset pending |
| cafe | home features | same 4-in-3 orphan | columns: 4 | code, reset pending |
| shop/cafe/corp | testimonials | random pravatar faces (bearded man for "คุณแม่น้ำหวาน", western stock faces for Thai customers) | matching Asian portraits via u(id,160,"&h=160&crop=faces") | code, reset pending |
| cafe | home product-grid | 6 featured products in a 4-col grid → 4 + 2 orphan row | brownie + iced latte featured → 8 = two full rows | code, reset pending |
| cafe | product detail | every product shares one generic line ("อบใหม่ทุกเช้า สั่งล่วงหน้า 1 วัน"), detail block nearly empty | per-product Thai descriptions (short + long) | code, reset pending |
| cafe | about | text-only; heading widow "คอนโด" alone on line 3 | kitchen masonry gallery (6 photos) + forced break "Sugar Puff — ครัวเล็ก ๆ⏎ที่เริ่มจากเตาอบในคอนโด" | code, reset pending |
| corp | home/about team | Thai leadership names (ธนกร, พิมพ์มาดา, ณัฐพล, อรจิรา) with Caucasian stock portraits | Asian professional portraits 1720501828093 / 1758600587811 / 1622902141397 / 1581065178047 | code, reset pending |
| corp | /work | CTA "glow" (ShaderBackdrop aurora) directly after the curved gallery → 2 live WebGL canvases in one viewport | CTA variant wordmark (no canvas) | code, reset pending |
| corp | /careers | 4 benefit cards in 3 columns (orphan) | columns: 4 | code, reset pending |

## log
- 2026-10-22: start, no predecessor file.
