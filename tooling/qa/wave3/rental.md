# Packet: rental (hotel template + rental module)

Status: STARTED 2026-10-18. No code written yet.

## Plan
1. schema packages/db/src/schema/rental.ts (+ index export + migration)
2. package packages/modules/rental (services, tests, sections, components, admin exports, register.ts)
3. core modules registry (rental adminNav/routes/permissions) + theme preset "riviera" (cream/sand/gold)
4. template packages/templates/src/hotel.ts + registrations (templates index, seed/reset-demo DEMO_NAMES)
5. storefront routes apps/web rw/[tenantId]/{rooms,stay,stays,api/rental,account/stays}
6. admin routes apps/admin t/[slug]/rental/{bookings,units,rates,calendar}
7. provision demo-hotel; journey tooling/qa/rental-journey.ts; smoke; screenshots

## DONE
- (nothing yet)

## REMAINING
- everything above

## Decisions
- refType for payments: "stay"
- check-out exclusive; dates stored as YYYY-MM-DD text (date column)

## How to test
- pnpm --filter @rentweb/module-rental test
- pnpm --filter @rentweb/module-rental --filter @rentweb/web --filter @rentweb/admin typecheck
- pnpm --filter @rentweb/tooling exec tsx tooling/qa/rental-journey.ts
