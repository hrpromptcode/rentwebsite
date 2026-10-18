# topup_services QA progress (KEY: services)
Started 2026-10-19. Findings -> tooling/qa/bughunt/topup_services.jsonl (source of truth). Scripts: topup_services-proof.ts (probes, run with MSYS_NO_PATHCONV=1 pnpm --silent exec tsx qa/bughunt/topup_services-proof.ts <name|all> from tooling/), topup_services-ids.ts (ids, RLS, constraints).

- [x] 0 survey module files
- [x] 1 order state machine vs payment layer -> SERVICES-01 (no closed handler), 05 (failed order paid), 06 (oos not flagged), 07 (frozen wallet throw)
- [x] 2 wallet math / concurrency / idempotency -> parallel debit OK, bonus rounding OK, tier price OK, SERVICES-12 (idempotency race 500)
- [x] 3 stock code concurrency + encryption -> race OK (1 sold, 1 refunded), encryption at rest OK, no codes in feed/api/outbox
- [x] 4 api fulfilment retry idempotency -> SERVICES-11 (suspected, simulator only)
- [x] 5 rate limits + timezone -> rolling window OK; SERVICES-10 (no ip+no customer unlimited)
- [x] 6 blacklist matching -> all phone forms normalise to 0812345678; email/uid lowercased; OK
- [x] 7 OTP-first-order -> enforced in action + service (only entry points); SERVICES-09 (guest row side effect); SERVICES-04 (blocked customers), SERVICES-08 (disabled methods)
- [x] 8 tenant_id + RLS -> pg_policies: tenant_isolation + platform_access on all 9 topup tables, FORCE RLS on; CHECK constraints present
- [x] 9 secrets / feed route -> feed on tenant w/o module returns 200 {items:[]}; order lookup enumerable (SERVICES-13)
- [x] 10 outbox / notification payloads -> SERVICES-02, 03
- [x] 11 supplier adapters -> SERVICES-11
- [x] wrap-up: SERVICES-13 (public enumeration + feed w/o module), 14 (adminCancelOrder raw payment update), 15 (no manual-refund recording) logged; 15 findings total; structured output returned
