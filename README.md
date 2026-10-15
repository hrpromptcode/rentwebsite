# RentWeb

Multi-tenant website-as-a-service platform for Thai businesses (shops, game top-up, booking, clinics, restaurants, cafes, corporate sites). One codebase, many themed templates; every tenant customizes logo, colors, fonts, layout and content.

Planning docs (Thai): [docs/README.md](docs/README.md)

## Quick start

```bash
pnpm install
cp .env.example .env            # fill DATABASE_URL / DATABASE_ADMIN_URL (Postgres 15+)
pnpm db:generate                # drizzle migrations from schema
pnpm db:migrate                 # apply migrations + RLS policies + app role
pnpm db:seed                    # plans, templates and 7 demo tenants
pnpm dev:web                    # http://localhost:3000
```

Demo tenants after seeding (Chrome resolves `*.localhost` automatically):

- http://demo-shop.localhost:3000 — ร้านค้าออนไลน์ (aurora)
- http://demo-topup.localhost:3000 — เว็บเติมเกม (neon, 3D)
- http://demo-clinic.localhost:3000 — คลินิก (porcelain)
- http://demo-restaurant.localhost:3000 — ร้านอาหาร (ember)
- http://demo-salon.localhost:3000 — จองคิวสปา (zen)
- http://demo-corporate.localhost:3000 — เว็บบริษัท (quartz)
- http://demo-cafe.localhost:3000 — คาเฟ่ (candy)

## Layout

```
apps/web          storefront renderer for every tenant + platform marketing site (Next.js 16)
apps/admin        tenant admin + superadmin console (Next.js 16)
packages/db       Drizzle schema, migrations, RLS, tenant transactions, PGlite test utils
packages/core     theme engine, tenant resolution, module registry, cache, crypto, money
packages/ui       shadcn-style components, motion (motion/GSAP), fx backgrounds, three.js scenes
packages/storefront  section definitions (zod) + React sections + header/footer shells
packages/templates   site templates: modules + theme preset + pages + sample data seeds
packages/i18n     th/en messages
tooling           seed / create-tenant scripts
```

## Background jobs & notifications

Domain events are written to `events_outbox`; `packages/integrations` turns them into LINE / email / SMS notifications, booking reminders and custom-domain DNS checks.

```bash
pnpm --filter @rentweb/tooling worker            # dev worker: drains the outbox every 5s
curl -X POST http://localhost:3000/api/internal/outbox   # or trigger one batch (cron-friendly)
```

## QA tooling

```bash
pnpm --filter @rentweb/tooling screenshot -- demo-shop --path /products   # PNGs in tooling/screenshots/
pnpm --filter @rentweb/tooling smoke                                       # browser smoke test of every demo route
pnpm --filter @rentweb/tooling reset-demo -- --template shop               # re-provision a demo tenant
```

## Tests

```bash
pnpm --filter @rentweb/db test   # tenant isolation suite on in-memory Postgres (PGlite)
```
