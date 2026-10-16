# admin_b2 bughunt progress (continues admin_core steps 4-8 + admin_modules steps 3-5) — DONE

Test data: owner qa-b2-sppp@example.com (admin_b2-creds.json), throwaway tenants qa-b2-{shop,cafe,salon,clinic,rest,corp}-sppp,
staff qa-b2-staff-sppp@example.com + manager qa-b2-mgr-sppp@example.com (joined shop/rest/salon/clinic via invite).
qa-b2-cafe-sppp is CANCELLED (danger-zone test); qa-b2-shop has a failed custom domain www.qa-b2-sppp.test.
Leftover published test pages: demo-salon /qa-b2-5wb9, demo-restaurant /qa-b2-7u08, demo-clinic /qa-b2-if9m (reset later).

- [x] page builder: all section types on demo-shop/salon/restaurant/clinic, edit/reorder/hide/delete, draft vs publish, SEO, noindex, dup/reserved slugs, unpublish, delete -> ADMIN_B2-01..03, -14
- [x] navigation editor -> ADMIN_B2-18
- [x] media library: jpg/png/webp OK + served; svg/html/txt rejected; size limit; in-use delete -> ADMIN_B2-15..17
- [x] customers list/search/detail/edit/block -> ADMIN_B2-13
- [x] settings general/LINE, payments (PromptPay QR + bank on order page OK), domains, team invite/accept -> ADMIN_B2-09..12
- [x] billing page (placeholder upgrade toast OK), danger zone self-suspend/reactivate/cancel on throwaways (works; propagation delay -> ADMIN_B2-19)
- [x] new-tenant onboarding: no sample PromptPay/bank/contact (OK); payment messaging -> ADMIN_B2-04..07; signup API -> ADMIN_B2-08
- [x] superadmin console: overview, search/filter, detail, impersonate start/stop, suspend -> 503 page -> reactivate, templates, plans (OK apart from ADMIN_B2-19)
- [x] auth: wrong password / unknown email same message, protected-route redirects with next, login honours next, logout (GET + menu), back after logout (OK)
- [x] role enforcement: UI survey staff/manager on core + module pages, 18 server-side spot checks with real ids all refused (OK) -> ADMIN_B2-14, -20 found along the way
- [x] print pages in print media: order label (sender, number, full address) and table QR sheet (12 cards, QR loaded, 2 PDF pages) OK
- [x] empty states: every admin nav page of the 6 fresh tenants at 1440 + 390, no crashes (restaurant-only routes 404 on other templates as expected)
Not logged: one-off 28px overflow on /settings/domains at 390 (not reproducible on 3 retries).
