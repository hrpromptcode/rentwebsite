# security bughunt progress
Done:
- admin server actions: all /t/[slug] actions use getTenantCtx+assertRole (grep summary); non-member u1 gets 404 on pages, feeds and actions (security-nonmember.mjs)
- RLS: rls-check OK (63/63 tenant tables RLS+forced, app_user no bypass)
- console actions require superadmin (u1 -> redirect /t)
- SEC-001 custom CSS sanitizer bypass (confirmed in HTML of sec-a)
- SEC-002 owner lifts platform suspension / past_due -> active (confirmed)
- SEC-003 admin login open redirect; SEC-005 storefront login open redirect
- SEC-004 /rw/<id>/x.png bypasses proxy guard
- SEC-006/007 OTP (code review only)
Test data: users in security-creds.json; tenants sec-a (business plan, malicious css), sec-u1shop (owner u1), sec-u2rest (owner u2)
Next: slip upload, payments status, storefront API ownership, forms, JSON-LD/HTML sanitizer, secrets

## Final coverage
- SEC-001/001b custom CSS XSS (confirmed browser), SEC-008 slip SVG/HTML stored XSS (confirmed browser, cross-origin), SEC-009 slip upload missing authz -> free paid orders (confirmed), SEC-010 payment status leak, SEC-011 timing-unsafe key compare, SEC-012 admin peer demotion.
- SEC-002 suspension bypass, SEC-003/005 open redirects, SEC-004 /rw guard bypass, SEC-006/007 OTP.
OK (no issue found):
- Cross-tenant admin actions: owner A targeting B's order id -> "not found" (RLS+getTenantCtx), slug B -> 404. (security-crosstenant.mjs)
- Non-member user: 404 on all /t/<slug> pages, feeds, actions; /console -> redirect /t. (security-nonmember.mjs)
- CSRF: foreign-Origin server action rejected 500 "Invalid Server Action request".
- RLS: 63/63 tenant tables RLS+FORCE with 2 policies incl tenant_secrets, customer_otps/sessions, payments, media, forms, reviews, restaurant_orders, table_sessions. app_user NOBYPASSRLS. (rls-check.ts)
- Secrets: no NEXT_PUBLIC_* leaks; no process.env in client components; LINE token + clinic notes encrypted (aes-256-gcm) in tenant_secrets (RLS).
- Restaurant dine-in order needs session token; pickup needs phone; reservation needs phone. Session token shortCode(6) via CSPRNG (randomBytes) - low entropy but gated by order number + no listing.
- Admin feed routes (kitchen/orders) require session + membership (getTenantCtx).
Could not fully check: production cookie 'secure' flag relies on host string (localhost) not protocol; real edge x-forwarded-host trust; email/SMS OTP delivery side effects (not exercised to avoid spam).
