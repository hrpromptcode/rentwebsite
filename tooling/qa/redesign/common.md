# common agent progress (phase 2) — tenant home / [...slug] / account (index, login, orders) / preview + corporate.ts + admin auth/onboarding
Owner files: apps/web/src/app/(sites)/rw/[tenantId]/{page.tsx,[...slug]/**,account/page.tsx,account/login/**,account/orders/**,preview/**},
packages/templates/src/corporate.ts, apps/admin/src/app/{(auth)/**,onboarding/**} (+ invite page restyle if time)
Journeys: tooling/qa/line_login-journey.ts, tooling/qa/admin-journey.ts
Scripts: tooling/qa/redesign/common-imgsheet.ts (photo contact sheet), common-shots.ts (verification, --only= --w= --frames= --reduce), common-probe.ts (full console dump), common-logout-probe.ts (repro of shared issue #1)

## done
- 2026-10-22: read direction (§1–2, §4.1, §5.0, §5.6, §6–7), kit docs, sections/shell progress, both journeys (hooks noted below)
- 2026-10-22 (successor run): verified new Unsplash ids (200 + looked): warehouse 1586528116311-ad8dd3c8310d, port 1494412574643-ff11b0a5c1c3,
  food 1504674900247-0877df9cc836, resort 1520250497591-112f2f40a3f4, sprouts 1625246333195-78d9c38ad449, wireframe sketch 1581291518857-4e27b48ff24e,
  swatches 1561070791-2526d30994b5, phone 1512941937669-90a1b58e7e9c, server room 1558494949-ef010cbdcc31, devs 1551434678-e076c223a692,
  dark laptop 1531297484001-80022131f5a1

## STATUS: DONE (2026-10-22) — only open item is For shared owners #1 (blocks line_login Z)
- final shots: tooling/qa/redesign/common-shots.ts (48 page×width runs, 0 console errors, 0 overflow) → tooling/screenshots/redesign-common-<name>-<1440|390>[-sheet].png

## done (verification)
- admin-journey 31/31 PASS; line_login-journey 26 PASS / 1 FAIL (Z console error, cause = frozen tenant layout Preloader, see For shared owners)
- provision-neutral 10/10; typecheck web + admin + templates green
- screenshots reviewed: corp home/work/about/contact/services/privacy, shop/clinic/cafe about/contact/refund, login, account, orders,
  preview (corporate about draft + shop home), admin login/signup/onboarding 1–3 at 1440 + 390; reduced-motion pass (corp home/work, login, admin)

## done (code)
- corporate.ts §5.6 composition (hero cinematic+clock+corner labels, giant-wordmark, logos names, curved-gallery WORKS, project-list,
  stats big, features list, tunnel (4 steps w/ photos), team large, testimonials spotlight, pricing, faq, cta wordmark);
  services = features sticky w/ 6 photos; work = project-list grid-staggered + curved-gallery ARCHIVE; contact = chips; provision-neutral green
- [...slug]/cms-page-view.tsx (CmsPageView: PageIntro absorbing first section title block, legal prose + sibling nav), page.tsx uses it
- account/login (split card: shop hero photo brand panel + sign-in column; auth-styles.tsx hoisted CSS), otp-form, account/page, account/orders
- admin: (auth)/_brand/{fonts.ts,night.css,brand.tsx} (night tokens via html:has(.rw-night), Brandmark, ShopWindows CSS-3D wall of
  /showcase screenshots, AuthSplit), (auth)/layout, login page+form, signup page+form, onboarding layout/page/wizard (shot urls, browser preview)

## next
- [...slug] CmsPageView: PageIntro absorbing the first section's heading (eyebrow = page title), legal prose (70ch, no motion), first-section top padding trim
- account login (focused split screen), account index, account/orders, preview banner, tenant home "setting up" fallback
- admin (auth) layout + login + signup + onboarding wizard → platform identity (§4.1 night palette, Anuphan/Unbounded, coral dot)

## journey hooks (must keep)
- storefront login: #otp-target, first `form button[type=submit]` = OTP submit (no form before it!), #otp-code, #otp-name,
  body text "รหัสของคุณคือ NNNNNN", testid line-login-button (text "เข้าสู่ระบบด้วย LINE", height ≥ 44, href /api/auth/line/start…),
  testid line-login-error; account: testid account-name, line-link-card[data-linked], line-unlink(+disabled), line-unlink-confirm,
  line-banner, button /ออกจากระบบ/; account/orders: order number in body text
- admin: #email #password, ONE button named "เข้าสู่ระบบ" (substring!), `form p[role=alert]` error; signup #name #email #password +
  button "สร้างบัญชีฟรี"; onboarding heading "เว็บของคุณเป็นแบบไหน?", `button[aria-pressed]` template cards with h3 name (hasText "ร้านค้า"),
  "ถัดไป", #shop-name, #shop-slug, text "ว่าง! ใช้ชื่อนี้ได้", heading "เลือกธีมเริ่มต้น", button[aria-pressed='true'] ≥ 1,
  button "สร้างเว็บไซต์" (no other aria-pressed buttons on onboarding pages!)
- admin-journey step 13 (390px, logged in): /onboarding must have NO visible <aside> and no horizontal overflow

## decisions
- provision-neutral: giant-wordmark "NORTHSTAR" is mapped to "" via corporate neutralText (new shops show their own name);
  no hh:mm, ถ./ซอย, BTS, "เซ็นเตอร์" (sample address word) in visible corporate copy
- corporate /services goes through apps/web/src/lib/cms-fallback.tsx (booking route, NOT mine) → no PageIntro there until shared owner applies the request below

## For shared owners
1. TENANT LAYOUT (apps/web/src/app/(sites)/rw/[tenantId]/layout.tsx, shell): the first-visit <Preloader> inline <script> is rendered
   again when a SERVER ACTION redirects to "/" (customer logout → redirect("/")) → React logs "Encountered a script tag while rendering
   React component" → line_login-journey step Z fails (repro: tooling/qa/redesign/common-logout-probe.ts). Fix: skip the Preloader on
   non-document requests, e.g. `const h = await headers(); const docRequest = !h.get("next-action") && h.get("rsc") !== "1";`
   and `showPreloader && docRequest`. (A plain <Link> navigation to "/" does not trigger it.)
2. apps/web/src/lib/cms-fallback.tsx: render through `CmsPageView` from `app/(sites)/rw/[tenantId]/[...slug]/cms-page-view.tsx`
   (`return <CmsPageView runtime={runtime} page={page} />`) so CMS pages served by module routes when the module is off
   (corporate /services) get the same PageIntro as every other CMS page.
3. sections/stats.tsx: pass `decimals` to Odometer when the value is fractional (4.9 renders as "5"); corporate now uses integers.
4. sections/contact.tsx (chips variant): the details column (lg:col-span-4) wraps long e-mails mid-word ("contact@northstar.co.
th");
   consider `break-all` only for the e-mail row or a wider column.
5. sections/project-list.tsx grid-staggered: the meta column is `shrink-0`, so a long category squeezes the title/summary on phones
   (corporate now passes short categories on /work).
6. platform: re-run tooling/qa/redesign/capture-showcase.ts --only=corporate (the onboarding wizard + admin login wall use /showcase/<key>.webp;
   corporate.webp still shows the old light corporate home).
