# Packet qa_wave_a — independent QA of wave A (LINE Login, course template, rental module + hotel template)

Started 2026-10-18 (QA agent). Scope: tooling/qa/wave3/{line_login,course,rental}.md deliverables. Out of scope: events module.

## Plan
1. Rerun journeys: line_login, course, rental, rental-admin, booking; smoke (all tenants); hydration demo-course + demo-hotel
2. Human-eye screenshot pass 390/1440 (motion on): demo-course + demo-hotel storefront + admin pages
3. Edge probes: hotel (min nights, max advance, guests > max, same-day after check-in time, hold expiry, late cancel keeps deposit), course (full session, 0-session pass, instructor time-off), LINE (denied consent, state replay, unlink last login)
4. Security: tenant_id filters on rental/booking-class queries, timing-safe access keys, /stays/[id] without k → 404, cross-tenant stay read
5. Fix + regression test each finding; final: journeys, smoke, typecheck

## Findings (ID | severity | where | fix | verification)
| ID | Sev | Where | Finding | Fix | Verification |
|----|-----|-------|---------|-----|--------------|

## DONE
- (log below)

## REMAINING
- everything in Plan

## How to test
- see each packet's "How to test"; this packet's run logs live in tooling/qa/wave3/qa_a-logs/
