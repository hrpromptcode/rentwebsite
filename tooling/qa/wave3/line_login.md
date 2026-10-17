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
- Admin: `/t/<slug>/settings/line` (tab "LINE Login" added to settings-tabs.tsx).
- Tests: `packages/core/test/line-login.test.ts`; journey `tooling/qa/line_login-journey.ts`.

## DONE
- (nothing yet — exploration finished, writing core)

## REMAINING
- core line.ts, tests, storefront routes + UI, mock, admin page, journey, screenshots, smoke

## How to test
- see bottom once built
