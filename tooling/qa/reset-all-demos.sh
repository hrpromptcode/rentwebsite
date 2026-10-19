#!/usr/bin/env bash
# Re-provisions every demo tenant from its template, then re-creates the platform admin + memberships.
# Usage (Git Bash): bash tooling/qa/reset-all-demos.sh   — restart both dev servers afterwards (tenant ids change).
set -u
cd "$(dirname "$0")/../.."
fail=0
for key in shop topup clinic restaurant salon corporate cafe course hotel events; do
  printf "reset %-11s " "$key"
  out=$(pnpm --filter @rentweb/tooling reset-demo -- --template "$key" 2>&1); code=$?
  if [ $code -eq 0 ]; then echo "$out" | grep -E "✓" | tail -1; else echo "FAILED"; echo "$out" | tail -15; fail=1; fi
done
pnpm --filter @rentweb/tooling create-admin -- --email admin@rentweb.local --password "Admin1234!" 2>&1 | tail -4 || fail=1
exit $fail
