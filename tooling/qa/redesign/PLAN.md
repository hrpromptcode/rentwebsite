# Hi-end 3D redesign — orchestration plan (owner request 2026-10-21)

Owner (Thai): every site type, every page and the showcase site must become Hi-End: 3D website, animation, front-end craft,
motion, creative ideas, interactive tricks — references vyre-studio.com and fastwork.com/selling. Work autonomously overnight.

## Phase 1 — workflow wf_4b8cfd34-8b9 (task wzh18c21u)
direction (docs/design/hi-end-direction.md) → kit3d ∥ kitmotion (packages/ui three / motion+fx, lab pages /lab/3d, /lab/motion)
→ platform (apps/web (platform) site: /, /templates, /templates/[key], /pricing, /features) ∥ shell (storefront shell, tenant layout,
presets) ∥ sections (storefront sections + definitions + admin page-builder options, /lab/sections).
Progress files: tooling/qa/redesign/<key>.md. Commit after phase 1: "feat(design): hi-end kit, showcase site, storefront shell + sections".

## Phase 2 — module pages + template compositions (one agent per module, disjoint ownership)
- commerce: packages/modules/commerce/src/{components,sections} + routes products, collections, cart, checkout, orders/* ; templates shop.ts, cafe.ts
- booking: packages/modules/booking/src/{components,sections} + routes services, staff, book, bookings, classes, schedule, instructors, packages, account/packages ; templates clinic.ts, salon.ts, course.ts
- restaurant: module + routes menu, order, reserve, reservations, t/[qrToken], orders/r ; template restaurant.ts
- topup: module + routes games, topup, wallet, account/topups ; template topup.ts
- rental: module + routes rooms, stay, stays, account/stays ; template hotel.ts
- events: module + routes events, tickets, account/tickets ; template events.ts
- common: routes page.tsx home, [...slug], account (index/login/orders), preview ; template corporate.ts ; neutral-copy check (pnpm --filter @rentweb/core test -- provision-neutral)
Each agent: follow docs/design/hi-end-direction.md section d for its templates, reset its demo(s) + create-admin, verify 1440/390.

## Phase 3 — QA, showcase screenshots, regression
- 3 visual-QA agents (sites split ~4/3/3 + platform) → findings tooling/qa/redesign/qa_*.jsonl; then fixers by ownership.
- Re-capture apps/web/public/showcase/<key>.webp from the redesigned demos (1440×900).
- MSYS_NO_PATHCONV=1 bash tooling/qa/final-regression.sh → fix red (journeys must stay green; update journey selectors only for intentional UI changes).
- bash tooling/qa/reset-all-demos.sh, restart servers (preview_stop/preview_start), final smoke, commit + push, memory update, Thai summary.

## Notes
- 2026-10-21 23:10: port 3000 was held by an idle dev server of D:\Projects\restaurant_white_label (session "แก้ไขจุดต่างๆ หลายฟีเจอร์");
  stopped it so RentWeb can run — tell the owner: restart with `pnpm --filter @favornoms/web dev` in that project.

## Status log
- 2026-10-22 02:30 — phase 1 DONE, committed + pushed 36d72b5 (typecheck 16/16). Platform site live at localhost:3000.
- 2026-10-22 02:35 — phase 2 launched: Workflow task w417beog1, run id wf_43110144-d79,
  script C:\Users\B\.claude\projects\D--Projects-promptcode-rentweb\23625773-70a0-4240-b67e-436e61f0d1a9\workflows\scripts\rentweb-hiend-phase2-wf_43110144-d79.js
  agents: commerce, booking, restaurant, topup, rental, events, common (progress files tooling/qa/redesign/<key>.md).
  Phase-3 inputs: "For shared owners" sections in every progress file (shared kit/storefront fixes), platform.md "For kit owners",
  re-capture showcase screenshots (tooling/qa/redesign/capture-showcase.ts then platform-og.ts), admin onboarding template preselect follow-up.
