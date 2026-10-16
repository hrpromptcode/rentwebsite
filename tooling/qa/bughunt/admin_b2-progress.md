# admin_b2 bughunt progress (continues admin_core steps 4-8 + admin_modules steps 3-5)

Test data: owner qa-b2-sppp@example.com (admin_b2-creds.json), tenants qa-b2-{shop,cafe,salon,clinic,rest,corp}-sppp (throwaway),
staff qa-b2-staff-sppp@example.com + manager qa-b2-mgr-sppp@example.com joined shop/rest/salon/clinic via invite.

- [x] page builder (admin_b2-pages.ts, -pages2.ts, -shadow.ts): 20 section types added on demo-shop, edit/reorder/hide/delete, draft vs publish, SEO, noindex, dup/reserved slugs, unpublish, delete -> ADMIN_B2-01..03
- [ ] navigation editor
- [~] media library (admin_b2-media.ts): type tests blocked by a concurrent edit of storage.ts (sniffUpload is not a function); >10 MB bodies fail with 'Unexpected end of form'
- [ ] customers list/detail/edit
- [x] settings general (phone/LINE), payments (PromptPay/bank -> QR + bank on order page OK), domains, team invite/accept -> ADMIN_B2-09..12
- [ ] billing, danger zone (throwaway)
- [x] new-tenant onboarding: no sample PromptPay/bank/contact (OK); checkout/booking messaging -> ADMIN_B2-04..07; signup API validation -> ADMIN_B2-08
- [ ] superadmin console
- [~] auth: signup validation done; login/logout/redirects pending
- [ ] role enforcement staff/manager/owner
- [ ] print pages
- [~] empty states (admin_b2-empty.ts running)
