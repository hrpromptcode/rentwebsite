# Packet line_login — "เข้าสู่ระบบด้วย LINE" for storefront customers (per tenant)

## Plan / design (decided 2026-10-18)
- Core: `packages/core/src/customer/line.ts` (exported via `@rentweb/core/customer`): PKCE/state/nonce, authorize URL,
  encrypted oauth cookie payload, code exchange, id_token verify (HS256 local; other algs → LINE verify endpoint;
  no id_token → profile endpoint), find-or-create BY lineUserId ONLY, link/unlink rules, per-tenant credentials in
  `tenant_secrets` (`line_login_channel_id`, `line_login_channel_secret`), enabled flag in `tenants.settings.lineLogin.enabled`.
- Endpoints configurable: `LINE_OAUTH_BASE` (default https://access.line.me) and `LINE_API_BASE` (default https://api.line.me).
- Storefront: `/api/auth/line/start` + `/api/auth/line/callback` under `rw/[tenantId]/api/auth/line/**`; login page button
  (only when enabled); account page link state + เชื่อมต่อ/ยกเลิกการเชื่อมต่อ; errors → `/account/login?error=line_*` (Thai).
- Dev mock: `apps/web/src/app/api/dev/line-mock/{oauth2/v2.1/authorize,oauth2/v2.1/token,oauth2/v2.1/verify,v2/profile}` —
  only when NODE_ENV !== production && LINE_MOCK=1. Stateless signed codes/tokens (encryptToString, dev key).
- Admin: `/t/<slug>/settings/line` (tab "LINE Login" added to settings-tabs.tsx); actions live in settings/line/actions.ts
  (own folder — the shared settings/actions.ts is untouched).
- Tests: `packages/core/test/line-login.test.ts`; journey `tooling/qa/line_login-journey.ts`.

## DONE (verified by the continuation agent 2026-10-18 04:05)
- core `line.ts` complete (610 lines) + `customer/index.ts` re-export; `pnpm --filter @rentweb/core exec vitest run test/line-login.test.ts` → 36/36 green
- storefront routes `api/auth/line/{_shared,start/route,callback/route}.ts` complete (login + link modes, audit on signup/link)
- storefront UI: `account/line-button.tsx`, `account/line-link-card.tsx`, `account/page.tsx` (banner + card), `account/login/page.tsx` (button + Thai error) — written
- dev mock `apps/web/src/app/api/dev/line-mock/**` complete (authorize picker, token w/ HS256 id_token, verify, profile, picture)
- admin typecheck green at start; web typecheck: ONLY `unlinkLineAction` missing

## DONE (continuation, 04:20)
- `unlinkLineAction` added to account/actions.ts (audit customer.line.unlink, redirect /account?line=unlinked)
- admin Settings > LINE Login: settings/line/{page.tsx,line-form.tsx,actions.ts} + tab line in settings-tabs.tsx
- .env.example section (LINE_MOCK, LINE_OAUTH_BASE, LINE_API_BASE); root .env got LINE_MOCK=1 + both bases → mock;
  apps/web/.env.local + apps/admin/.env.local (gitignored) carry the same 3 lines because Next hot-reloads those
  (verified: GET localhost:3000/api/dev/line-mock/oauth2/v2.1/authorize → 400 mock page, i.e. LINE_MOCK is live without a restart)

## DONE (continuation, 04:40)
- journey `tooling/qa/line_login-journey.ts` written (steps 0, A1-A11, S1-S8, L1-L4, M1, Z); tooling typecheck green; core typecheck green
- apps/web + apps/admin typecheck: my files clean; the ONLY error is packages/storefront/src/definitions/index.ts(506) category "rental" — the rental packet (not mine)

## DONE (continuation, 05:05)
- journey run 1: 25 PASS / 1 FAIL (S5 navigated to /checkout before the optimistic add-to-cart POST landed → bounced to /cart) → fixed (wait for POST /api/cart, enter checkout via /cart); S6 now requires an order number
- journey run 2 (tooling/qa/_line-journey-run2.txt): **27 PASS, 0 WARN, 0 FAIL** — results in tooling/qa/line_login-journey-results.json
- account page header stacks the logout button under the name on phones (Thai name was truncated at 390); web typecheck still clean
- screenshots reviewed: line-admin-settings-{desktop,mobile}, line-login-{desktop,mobile}, line-account-{desktop,mobile}, line-mock-picker-mobile — all OK

## DONE (05:15)
- smoke demo-shop (tooling/qa/_line-smoke.txt): see file — run after the journey, all 9 routes × 2 viewports

## REMAINING
- nothing for this packet. Follow-ups (not blocking): delete apps/web/.env.local + apps/admin/.env.local after the next dev-server restart (root .env now carries the same keys); the "ทดสอบ" probe cannot prove a wrong secret against REAL LINE (LINE checks the code before the secret → invalid_grant) — the report wording says so; add an admin Customers column/filter for LINE-linked customers if wanted.

## Decisions
- Enabling the toggle without stored credentials is refused by the admin action (otherwise the storefront would show a button that fails).
- "ทดสอบ" button = shape validation (lineChannelIdError/lineChannelSecretError + lineCredentialWarnings) + live probe of the
  token endpoint with a dummy code: `invalid_client` → credentials rejected, `invalid_grant` → "reachable" (real LINE checks the code BEFORE the secret, so this does not prove the secret — the report text says so), else inconclusive / unreachable.
- Env: root .env is loaded once by next.config (dotenv) → a running dev server does NOT see new root .env keys; Next only
  hot-reloads apps/<app>/.env*.local. See "How to test" for the exact files.

## How to test
- (filled in as milestones land)
- Env: root `.env` has `LINE_MOCK=1`, `LINE_OAUTH_BASE=LINE_API_BASE=http://localhost:3000/api/dev/line-mock` (added by this packet — say so
  in the report). A running dev server only sees them through `apps/web/.env.local` + `apps/admin/.env.local` (same 3 lines, gitignored,
  hot-reloaded by Next; delete after the next server restart). Without them `/api/dev/line-mock/**` is 404 and the button goes to real LINE.
- Unit: `pnpm --filter @rentweb/core exec vitest run test/line-login.test.ts` (36 tests: PKCE vector, ticket cookie, id_token checks,
  token exchange mocks, find-or-create / link / unlink rules incl. no e-mail merge + two tenants).
- Journey: `cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/line_login-journey.ts [--headed]` → PASS/FAIL per step,
  `tooling/qa/line_login-journey-results.json`, screenshots `tooling/screenshots/line-*.png` (admin settings 1440/390, login 1440/390,
  mock picker 390, account 1440/390). Leaves demo-shop with LINE Login ENABLED (channel 2007654321 / secret …cdef in tenant_secrets).
- Manual: admin http://localhost:3001/t/demo-shop/settings/line (tab "LINE Login") → storefront http://demo-shop.localhost:3000/account/login
  → ปุ่ม "เข้าสู่ระบบด้วย LINE" → mock picker (3 fake users + ยกเลิก) → /account shows card บัญชี LINE.
- Real LINE: remove the 3 env keys (or leave them empty), create a LINE Login channel, paste Channel ID/secret in the admin page and the
  Callback URL shown there (https://<tenant host>/api/auth/line/callback) into the LINE console.
