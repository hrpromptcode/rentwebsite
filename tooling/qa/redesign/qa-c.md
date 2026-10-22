# qa-c agent progress (phase 3 — visual QA + fix: demo-topup, demo-hotel, demo-events)
Owner: packages/modules/{topup,rental,events}/src/{components,sections}/** + their routes, packages/templates/src/{topup,hotel,events}.ts.
Shared layer frozen → problems go to tooling/qa/redesign/qa_shared.md under "## qa-c".

Tool: tooling/qa/redesign/qa-c-crawl.ts (--site= --mode=normal|reduce|nogl --tag= --fps --links --noshots)
→ tooling/screenshots/redesign-qa-c-<site>-<page>-<w>[-mode][-tag]-<n>.png

## log
- 2026-10-22 start: no predecessor file. shared1 DONE (topup 8 hero cards + chat testimonials, hotel sticky tones + interlude
  photo scrim already in templates and reset).

## findings (page | issue | fix | status)
| site/page | issue | fix | status |
|---|---|---|---|
| topup/games, home grid, hero orbit | PUBG Mobile cover = a TV showing another game's "WARZONE" logo (wrong brand) | COVER["pubg-mobile"] → 1560253023-3ec5d502959f (esports players, 200 + viewed); reset topup | fixed (reset pending) |
| topup/how-to | page ends on a bare 4-step timeline, ~half a viewport of nothing before the footer | + faq two-column (shared FAQ const with home) + cta glow (เลือกเกมที่จะเติม / ตรวจสอบสถานะ) | fixed (reset pending) |
| topup/games/[slug] 390+1440 (guest) | "เข้าสู่ระบบ" link 59×20 px and wrapped "เข้าสู่ / ระบบ" in the flex row on phones | topup-form: text in a span, link inline-flex min-h-11 nowrap | fixed |
| topup/home 1440 | hero CardStack3D orbit reads small (cards ≈ 55×90 px, ring Ø160 in a 467×584 canvas) — weak signature moment | shared (kit fit) → qa_shared.md | logged |
| topup/* | header nav links 40 px tall, account icon 36×36, header CTA 36 px, footer socials 40×40 (< 44) | shared shell → qa_shared.md | logged |
| topup/home 390 | hero stats strip 3 items in 2 cols → "4.9/5" orphan row | shared hero → qa_shared.md | logged |
| hotel/home hero 1440 | white sub over the bright golden-hour sky ≈ 2.7:1 (median), heading p90 2.3:1 | rental-styles: copy-pool radial scrim (.82/.62/.22) + .rw-hero-sub halo, sub text-white → sub p50 5.1:1, heading p90 3.1:1 | fixed |
| hotel/home hero 390 | sub broke inside a word "และที / มงาน" (Chromium ICU) | stay-search: subheading via kit ThaiWrap (server segmentation) | fixed |
| hotel/* "พูลวิลล่า" | IMG.villaPool was a city-hotel bedroom (tufted headboard, gilt mirror): cover of บีชฟรอนต์ พูลวิลล่า, home gallery, facilities | IMG.villaPool → 1582610116397-edb318620f90 (tropical villa + private pool + sala, 200 + viewed) | fixed (reset pending) |
| hotel/rooms + home grid | pool-access suite led with a classic city room | gallery leads with IMG.suitePool 1571003123894-1f0594d2b5d9 (cabanas on an infinity pool at dusk, 200 + viewed) | fixed (reset pending) |
| hotel/home image-text | "อาหารเช้าริมทะเล" photo = dim city cafe with diners | IMG.breakfast → 1559339352-11d035aa65de (seaside dining terrace, golden light, 200 + viewed) | fixed (reset pending) |
| hotel/home image-text + all templates | "สาย ๆ" → ๆ orphaned at the start of a line | templates hotel/events/topup: " ๆ" → " ๆ" (13×) | fixed (reset pending) |
| hotel/facilities + location heroes | auto ocean scene = pale grey sea filling the frame, the real photo shrunk to an inset | facilities scene "water-ripple" (pool photo ripples), location scene "none" (turquoise bay photo leads) | fixed (reset pending) |
| hotel/about | text only (statement + CTA card), no imagery for a resort | withAlbum(): polaroid gallery "อัลบั้มบ้านทะเล" (6 site photos) before the CTA; neutral page unchanged | fixed (reset pending) |
| hotel/rooms/[slug] | light header text over the light top of the room photo (mirror / sky) | top scrim .66 → .38 @14% → 0 @32% | fixed |
| hotel/stay/book (dev) | summary dimmed (opacity .5) + submit disabled on load: the re-quote effect's "first render" ref is defeated by StrictMode's double mount → a quote request fires on mount | book-form: re-quote keyed on type/dates/guests/extras (skip the initial key) + aborted request no longer clears the newer flag | fixed |
| hotel/stays/[id] | "ราคาต่อคืนตามวันที่" summary 32 px tall | quote-breakdown: min-h-11 py-3.5 | fixed |
| events/about | text only (statement + CTA card) | withWall(): parallax masonry "หนึ่งปีในโกดัง" (6 site photos) before the CTA; neutral page unchanged | fixed (reset pending) |
| hotel+events home | two h1 (sr-only page title + module hero h1) | shared render.tsx H1_SECTIONS → qa_shared.md | logged |

## log (cont.)
- crawl "before" (normal, 1440+390, all pages) done for topup + hotel; demo resets: hotel 01a16221-297a…, topup 01a16221-4ce7… + create-admin; provision-neutral 10/10
