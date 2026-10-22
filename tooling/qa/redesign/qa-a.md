# qa-a progress (phase 3 — visual QA + fix: demo-shop, demo-cafe, demo-corporate)
Owner: packages/modules/commerce/src/{components,sections}/**, commerce routes (products, collections, cart, checkout, orders/[orderId], orders/track),
packages/templates/src/{shop,cafe,corporate}.ts, common routes (tenant page.tsx, [...slug], account index/login/orders, preview).
Shared issues → tooling/qa/redesign/qa_shared.md (## qa-a).

## status
- [x] read direction §5.1/5.6/5.7 + commerce/common/shared1 notes (2026-10-22 start, no predecessor)
- [x] crawl script qa/redesign/qa-a-shots.ts (+ _qa-a-db.ts crawl map, _qa-a-imgsheet.ts Unsplash contact sheet)
- [x] normal crawl 1440 (pre-reset, 11:53) + 390 shop/cafe (post-reset 12:36); 390 crashed at corp-services (browser per site now)
- [x] reset-demo shop/cafe/corporate done 2026-10-22 12:25 (DB has the new photos/sections) → all "reset pending" rows applied
- [x] crawl 1440 (all, 14:12–14:45, partial re-runs after resets 15:20) + 390 (shop/cafe 14:55–15:25, corp 14:45 + careers/about 15:20)
- [~] reduce + no-webgl passes (key pages, 1440+390) running 15:30
- [x] fixes round 2 (product h1, card titles, reviews label, about CTA, cafe hero labels, corp careers)
- [ ] re-verify
- [ ] typecheck web + commerce, commerce tests, commerce-journey, line_login-journey

## findings
| site | page | issue | fix | status |
|---|---|---|---|---|
| shop | home hero | inset photo (imageSecondary "รายละเอียดผ้า") = woman in yellow tracksuit at a basketball hoop — off-brand | shop.ts → woven-fabric close-up 1643766882273 | done (reset 12:25) |
| shop | home sticky-story | step photos wrong: ปลูกฝ้าย=knit poncho, ทอมือ=bedroom lamp, ตัดเย็บ=clothes rack | cotton field 1761069183527 / indigo shibori 1778084355441 / loom warp 1719462193202 / hand-sewing 1764298493253 | done (reset 12:25) |
| shop | home image-text | "ช่างทอผ้า" photo = living room with macramé | ikat weaver at loom 1640292343595 | done (reset 12:25) |
| shop | home features | 4 icon cards in 3 columns → orphan 4th card centred on row 2 | columns: 4 | done (reset 12:25) |
| shop | products / cards / detail | product photos contradict names (sand shirt=blue dotted shirt, woven tote=black backpack, clutch=floral handbag, cushion=bedroom, sofa throw=framed prints, wide pants=pink joggers, indigo dress=white dress) | matching photos (2 per product for hover-swap / gallery) | done (reset 12:25) |
| shop | category tiles | bags category photo shows a branded Gucci logo bag | woven totes 1524679813234; apparel studio rack 1788500304966; home knit throw 1674475760738 | done (reset 12:25) |
| shop | about | text-only page (statement + CTA), no imagery for an atelier | masonry gallery "ในสตูดิโอของเรา" (6 photos) inserted after the statement (demo only; neutral page unchanged) | done (reset 12:25) |
| shop/cafe | products (any) | product with no photo renders an empty beige block (seen with leftover "QA สินค้าทดสอบ" from admin-journey) | product-card typographic placeholder (.rwc-noimg, first letter, theme tint) | code |
| shop/cafe | products / collections | "ทุกหมวดหมู่" chip count = sum of category counts (8) while the page says 9 รายการ (uncategorised product) | CategoryPills allCount from the routes (all active products) | code |
| cafe | products | almond croissant = rye loaf, coconut cake = chocolate cake, iced latte = hot latte art | 1710220988376 / 1716579895359 / 1764298490445 | done (reset 12:25) |
| cafe | home features | same 4-in-3 orphan | columns: 4 | done (reset 12:25) |
| shop/cafe/corp | testimonials | random pravatar faces (bearded man for "คุณแม่น้ำหวาน", western stock faces for Thai customers) | matching Asian portraits via u(id,160,"&h=160&crop=faces") | done (reset 12:25) |
| cafe | home product-grid | 6 featured products in a 4-col grid → 4 + 2 orphan row | brownie + iced latte featured → 8 = two full rows | done (reset 12:25) |
| cafe | product detail | every product shares one generic line ("อบใหม่ทุกเช้า สั่งล่วงหน้า 1 วัน"), detail block nearly empty | per-product Thai descriptions (short + long) | done (reset 12:25) |
| cafe | about | text-only; heading widow "คอนโด" alone on line 3 | kitchen masonry gallery (6 photos) + forced break "Sugar Puff — ครัวเล็ก ๆ⏎ที่เริ่มจากเตาอบในคอนโด" | done (reset 12:25) |
| corp | home/about team | Thai leadership names (ธนกร, พิมพ์มาดา, ณัฐพล, อรจิรา) with Caucasian stock portraits | Asian professional portraits 1720501828093 / 1758600587811 / 1622902141397 / 1581065178047 | done (reset 12:25) |
| corp | /work | CTA "glow" (ShaderBackdrop aurora) directly after the curved gallery → 2 live WebGL canvases in one viewport | CTA variant wordmark (no canvas) | done (reset 12:25) |
| corp | /careers | 4 benefit cards in 3 columns (orphan) | columns: 4 | done (reset 12:25) |
| shop/cafe | product detail h1 (768–1440) | text-balance breaks inside a phrase: "เดรสฝ้ายทอ⏎มือ ย้อมคราม", "เค้กวันเกิดสั่ง⏎ทำ", "ลาเต้คั่ว⏎เอง" | multi-phrase names split on spaces only (SplitReveal segment=spaces) + size capped min(step, 100cqi / widest phrase em ×1.1) in an @container | done (probe 390/768/1024/1440: every phrase fits) |
| shop/cafe | product detail reviews | "4.9 · 30 รีวิว" beside "ยังไม่มีรีวิว เป็นคนแรก…" | L.noWrittenReviews when ratingCount>0 and no published review | code |
| cafe | product detail reviews | seeded reviews missing in DB (template edited 12:45 after the 12:25 reset) | re-reset 14:25 | done |
| shop/cafe/corp | about CTA card | "มีคำถาม? ทัก⏎เรามาได้เลย" at 1440 | demo about sections: heading broken after "?" (breakAboutCta) | done (reset 14:49–14:51) |
| cafe | home hero scatter cards | labels truncated "คุกกี้ช็อกโก…", "เค้กวั…", "ครัวซอง…" | short labels ครัวซองต์ / คุกกี้ / เค้กวันเกิด·สั่งทำ / โดนัท | done (reset 14:49–14:51) |
| shop/cafe | listing chips | contrast audit 1.00 on the active chip | false positive (pill is an absolute sibling) → audit skips [data-active] | n/a |
| corp | /careers | page read thin (PageIntro + 4 benefit cards + CTA) for an agency | + image-text overlap "ชีวิตที่ Northstar" (workshop photo already in corporate.ts) + features list "ตำแหน่งที่เปิดรับ" (3 roles the CTA names) | done (reset 14:51) |
| shop | product cards (390) | Node ICU splits ฝ้ายออร์แกนิก as ฝ้า/ยออร์/แก/นิก → card title "เสื้อยืดคอกลม ฝ้า⏎ยออร์แกนิก" | commerce components/thai-name.tsx (glue ออร์แกนิก/สั่งทำ/หมวดหมู่/ของแต่งบ้าน before ThaiWrap) in product-card + category-list; kit glue list logged (qa_shared #7) | code, verifying |
| shop/cafe | product card titles (360–1440) | text-balance + word units broke inside phrases: "กางเกงขากว้าง ผ้า⏎ฝ้ายซักนุ่ม", "เค้กมะพร้าว⏎อ่อน", "เค้กวันเกิด⏎สั่งทำ (เริ่มต้น)", "…1⏎ปอนด์" | ThaiName phrases: phrases that surely fit (≤7.4em est.) are inline-blocks, quantity+unit merged, glue ทอมือ; card h3 [text-wrap:wrap] | done (probe 360/390/1440) |

## log
- 2026-10-22 14:05 successor run: verified reset applied; crawl script → fresh browser per site + per-mode/width report files; re-crawl 1440 + corp 390.
- 2026-10-22: start, no predecessor file.
- 2026-10-22 14:25 re-reset shop+cafe (template edits at 12:45 were after the 12:25 reset: reviews missing on cafe); shop CTA copy → "ผ้าทอมือ ที่ใส่ได้ทุกวัน" + WELCOME10
- 14:40 reverted shop CTA copy to the direction §5.1 line ("สมัครรับข่าวคอลเลกชันใหม่ก่อนใคร") → DB has the interim copy, shop needs one more reset in the fix batch; product page: 'noWrittenReviews' label when ratingCount>0 but no published review (cafe/shop showed '4.9 · 30 รีวิว' + 'ยังไม่มีรีวิว')
- 14:49 reset shop+cafe (about CTA break, cafe hero labels, shop CTA back to direction copy); product h1 container cap verified 390/768/1024/1440 (all phrases fit, no wraps); corp reset waits for the corp crawl
- 14:51 reset corporate (careers enrich + about CTA); provision-neutral 10/10 green. Next: 390 re-crawl shop/cafe (+corp careers/about), reduce + nogl passes, journeys.
- 15:00 web typecheck + commerce typecheck green; commerce tests 123/123; ThaiName stopgap for ICU mis-splits in card titles.
- 15:15 card titles: phrase-first breaking verified at 360/390/1440; shop 390 crawl done (linen p-page timed out, cafe home 390 timed out → re-run).
- 15:30 commerce-journey (shop+cafe) running in parallel with reduce/nogl passes.
- 15:36 commerce-journey 46/46 PASS (shop+cafe), console errors 0
- 15:43 line_login-journey 27/27 PASS; reduced-motion canvas check: shop/cafe/corp hero canvases static under reduce (canvas-only clip unchanged after pointer moves; only the custom cursor dot moves)
