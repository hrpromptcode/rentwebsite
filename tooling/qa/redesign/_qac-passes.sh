#!/usr/bin/env bash
# qa-c: sequential verification passes (one browser at a time). Logs → $OUT/<name>.log
#   bash qa/redesign/_qac-passes.sh <outdir> [step ...]   steps: after-topup after-hotel reduce nogl fps
cd "$(dirname "$0")/../.." || exit 1
OUT="$1"; shift
mkdir -p "$OUT"
run() { local name="$1"; shift; echo "== $name $(date +%H:%M:%S)" >> "$OUT/progress.log"; timeout 3600 pnpm exec tsx qa/redesign/qa-c-crawl.ts "$@" > "$OUT/$name.log" 2>&1; echo "   exit $? $(date +%H:%M:%S)" >> "$OUT/progress.log"; }
for step in "$@"; do
  case "$step" in
    after-topup) run after-topup --site=topup --tag=after --only=home,games,how-to,game,roblox,about,status-found,wallet ;;
    after-ev-ws) run after-ev-ws --site=events --tag=after --only=event-ws,event-run --w=390 ;;
    after-hotel) run after-hotel --site=hotel --tag=after --only=home,facilities,location,about,rooms,room,room-deluxe,book,stays-confirmed ;;
    reduce)
      for s in topup hotel events; do run "reduce-$s-audit" --site=$s --mode=reduce --noshots; run "reduce-$s-home" --site=$s --mode=reduce --only=home --frames=6; done ;;
    nogl)
      for s in topup hotel events; do run "nogl-$s-audit" --site=$s --mode=nogl --noshots; run "nogl-$s-home" --site=$s --mode=nogl --only=home --frames=6; done ;;
    fps)
      for s in topup hotel events; do run "fps-$s" --site=$s --only=home --noshots --fps; done ;;
  esac
done
echo "ALL DONE $(date +%H:%M:%S)" >> "$OUT/progress.log"
