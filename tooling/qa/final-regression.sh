#!/usr/bin/env bash
# Final regression for RentWeb: typecheck → package tests (one at a time) → smoke → every Playwright journey.
# Usage (Git Bash, both dev servers already running on 3000/3001):
#   MSYS_NO_PATHCONV=1 bash tooling/qa/final-regression.sh [--skip-typecheck] [--skip-tests] [--skip-journeys] [--only <substring>]
# Logs: tooling/qa/final-logs/<step>.log ; summary printed at the end and written to tooling/qa/final-logs/SUMMARY.md
set -u
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.."
LOGS=tooling/qa/final-logs
mkdir -p "$LOGS"
SKIP_TC=0; SKIP_TESTS=0; SKIP_J=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-typecheck) SKIP_TC=1;; --skip-tests) SKIP_TESTS=1;; --skip-journeys) SKIP_J=1;;
    --only) ONLY="$2"; shift;;
  esac; shift
done
declare -a RESULTS=()
run() { # run <name> <cmd...>  — records PASS/FAIL by exit code, also fails on "FAIL" lines in journeys
  local name="$1"; shift
  if [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]]; then return; fi
  local log="$LOGS/$name.log"; local start=$(date +%s)
  printf "▶ %-34s" "$name"
  ( "$@" ) >"$log" 2>&1; local code=$?
  local fails=$(grep -cE '^\s*(✗|❌|FAIL\b|FAIL:)' "$log" 2>/dev/null || true)
  local secs=$(( $(date +%s) - start ))
  if [ "$code" -eq 0 ] && [ "${fails:-0}" -eq 0 ]; then
    printf "PASS  (%ss)\n" "$secs"; RESULTS+=("| $name | PASS | ${secs}s | |")
  else
    printf "FAIL  exit=%s failLines=%s (%ss)  → %s\n" "$code" "$fails" "$secs" "$log"
    RESULTS+=("| $name | FAIL | ${secs}s | exit=$code failLines=$fails |")
  fi
}
if [ "$SKIP_TC" -eq 0 ]; then run typecheck pnpm turbo typecheck; fi
if [ "$SKIP_TESTS" -eq 0 ]; then
  for p in core db integrations module-booking module-commerce module-events module-rental module-restaurant module-topup; do
    run "test-$p" pnpm --filter "@rentweb/$p" test
  done
fi
run smoke pnpm --filter @rentweb/tooling smoke
if [ "$SKIP_J" -eq 0 ]; then
  for j in tooling/qa/*-journey.ts; do
    n=$(basename "$j" .ts)
    run "$n" pnpm --filter @rentweb/tooling exec tsx "qa/$(basename "$j")"
  done
fi
{
  echo "# Final regression — $(date '+%Y-%m-%d %H:%M')"; echo; echo "| step | result | time | note |"; echo "|---|---|---|---|"
  printf "%s\n" "${RESULTS[@]}"
} > "$LOGS/SUMMARY.md"
echo; echo "== SUMMARY ($LOGS/SUMMARY.md)"; printf "%s\n" "${RESULTS[@]}" | sed 's/^| //; s/ |$//'
fail=$(printf "%s\n" "${RESULTS[@]}" | grep -c '| FAIL |' || true)
echo "failed steps: $fail"; [ "$fail" -eq 0 ]
