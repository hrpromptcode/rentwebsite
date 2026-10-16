# storefront_shop progress
- [x] (1) commerce-journey rerun: 41/46; FAILs 1c/3a/M are data artifacts (QA products cheaper, linen M stock 0/2) not bugs; 400 console errors = invalid-coupon 400 responses (expected path)
- [x] (2) account: OTP login, overview, orders list/detail, logout, next= -> SS-01 open redirect, SS-02 takeover (critical), SS-03 no OTP rate limit, SS-14 tel input
- [x] (3) crawl 2 levels shop/cafe/corporate (desktop+mobile nav) -> SS-06 /blog 404; no broken images, no console errors elsewhere
- [x] (4) CMS pages render; contact form stores submissions (form_submissions) -> SS-04 arbitrary form creation, SS-05 weak validation
- [x] (5) search/sort/empty/OOS/variant/max qty/cart persistence OK; SS-09 empty-state copy, SS-12 no cart merge across devices
- [x] (6) robots ok; sitemap SS-06/SS-08; meta SS-07, SS-13; favicon SS-10
- [x] (7) dark mode toggle on throwaway tenant qa-sf-theme (mode=system): toggles+persists; reduced motion content visible
- [x] (8) 404 pages OK (Thai, 404, noindex); SS-11 payments API 500 on non-uuid
- [x] mobile 390px overflow on 34 pages: none
