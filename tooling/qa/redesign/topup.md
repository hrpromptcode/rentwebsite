# topup agent progress (phase 2 hi-end redesign) — status: DONE (2026-10-22)
Owner: packages/modules/topup/src/{components,sections}/** + labels, apps/web/src/app/(sites)/rw/[tenantId]/{games,topup,wallet}/** + account/topups/**,
packages/templates/src/topup.ts, journey tooling/qa/topup-journey.ts

## done
- (2026-10-22, run 1) read direction §1–2, §5.2, §6–§9, kit docs, sections/shell docs
- (run 2) re-read docs, module components/sections/routes, template, journey; baseline journey run started

- (run 2) built: components/topup-styles.tsx (hoisted CSS: HUD labels, brackets, holo tilt/foil, neon border-draw radios,
  pulse, code flip, synthwave floor, cover fan, feed rail, balance card), holo-card.tsx (pointer → CSS vars, fine pointer only),
  game-grid-client (sliding pill tabs w/ counts, glowing search + "/" shortcut, holo 4:5 tiles, Flip reflow), topup-feed-client
  (kill-feed rows, new-row flash, hidden-tab pause, `framed`), sections game-grid (split HUD heading) + topup-feed (HUD panel,
  null when empty), topup-form (glass step panels lit ✓ when done, READY n/4 segments, holo receipt aside, pulse OTP CTA),
  order-tracker (HUD nodes), code-reveal (flip), wallet-topup-form (neon presets); routes games (HUD intro + CSS cover fan),
  games/[slug] (blurred parallax banner under the header + synthwave floor + holo cover tile), topup/[number] (receipt header),
  topup/status (ticket result), wallet (glowing balance card), account/topups (HUD stats + status rails)
- template topup.ts per §5.2 (hero cards = 8 covers, 
 heading, clock + corner labels, grid before feed, steps numbered,
  stats short values, cta 
) + reset-demo + create-admin
- journey 22/22 green after the redesign (run 2, 1st pass)

- (run 2) iteration from screenshots: feed rows single-column wide kill-feed (grid areas), status h1s compact (step-4),
  wallet header order on mobile, HUD tag no-wrap on featured tiles, fan spread, package grid 2-col for 4 packages,
  mono only for numeric player ids; hero cards 8 → 6 (kit static fan overflowed into the copy with 8)
- typecheck web + module-topup + templates green; module tests 96/96

- final: reset-demo topup + create-admin (tenant 01a16074-…); topup-journey 22/22 green; core provision-neutral 10/10;
  module-topup tests 96/96; typecheck web + module-topup + templates green
- final screenshots (tooling/qa/redesign/topup-shots.ts): tooling/screenshots/redesign-topup-<page>-<1440|390>.png for home,
  games, games-empty, game (guest OTP gate), game-in (signed in), steam, roblox (sold out), status, status-found, status-miss,
  order-code, order-manual, order-public, wallet, account (+ -reduce variants of home/games/game/wallet at 1440):
  0 console / hydration errors, 0 px overflow, ≤ 1 canvas per page (home hero only)

## in progress
- (none)

## next
- tests, typecheck, final journey, final screenshots

## journey hooks to KEEP (tooling/qa/topup-journey.ts + topup-admin-journey.ts storefront steps)
- /games: h "เลือกเกมที่จะเติม"; tiles = `a[href^="/games/"]` (NO other /games/<x> links on /games: search "rov" must leave exactly 1, "garena" 2);
  text /เริ่มต้น ฿\d/ ≥ 8; 0 broken imgs; label "ค้นหาเกม"; empty "ไม่พบเกม “q” ลองคำอื่นหรือเปลี่ยนหมวด" + button "ดูเกมทั้งหมด" ≥44px;
  role=tab "บัตร / โค้ด"(2) "PC"(1) "มือถือ"(5) "ทั้งหมด"(8), aria-selected, ≥44px; ?cat=voucher&q=steam → 1 tile
- /games/[slug]: "ร้านนี้ให้ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก"; guests: all submit disabled/absent; link "ยืนยันด้วย OTP" → /account/login?next=;
  h1 = game name; #pf-uid #pf-contact #pf-server #contact; role=radio packages (name starts with package name, aria-checked, disabled when sold out,
  innerText has "อัตโนมัติ" / "เติมมือ" / "เหลือ N โค้ด" / "หมดชั่วคราว"); input[name=packageId]; `label` containing "PromptPay QR" / "กระเป๋าเงินในเว็บ"
  wrapping input[type=radio] (PaymentMethodPicker); wallet label text "คงเหลือ ฿N"; `aside` has exact "฿35" / "฿271" + "คงเหลือหลังหัก";
  visible submit containing "เติมเลย" (mobile: within 390×844 viewport, ≥44px); /ยอดในกระเป๋า ฿172 ไม่พอสำหรับ ฿899/ + link /เติมเงินกระเป๋า/
- /topup/[number]: getByLabel("สถานะรายการ") with exact รอชำระ/ชำระแล้ว/กำลังเติม/สำเร็จ; "รอชำระเงิน"; img[alt="PromptPay QR"]; /หมดอายุใน \d+:\d{2}/;
  "GameHub" exact; "แนบสลิปโอนเงิน"; "Open ID / UID"; UID exact; "เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ"; "เติมสำเร็จ" exact; /^SIM-[A-Z0-9]{6}$/ exact node;
  "อัตโนมัติ" exact; "ชำระเมื่อ"; "เติมสำเร็จเมื่อ"; "โค้ด ฿100"; first `code` = masked code; buttons "แสดงโค้ด"/"ซ่อน"; /^SW100-\d{3}$/; "รับโค้ดทันที" exact;
  "กระเป๋าเงินในเว็บ" exact; link "ประวัติการเติม"; "กำลังเติม" exact; /แอดมินกำลังเติมให้ ใช้เวลาประมาณ 15 นาที/; "เติมมือ" exact; "ผู้เล่น" exact (public);
  no `code` element / no "แสดงโค้ด" without key
- /wallet: "ยอดเงินคงเหลือ"; customer name; "ยังไม่มีรายการ เติมเงินครั้งแรกเพื่อรับโบนัส" (once); "โบนัส +2% ทุกครั้งที่เติม"; radio /฿300/ aria-checked;
  "เข้ากระเป๋าทั้งหมด"; "฿306" exact; button /เติมเงิน ฿300/; "ชำระเงินเพื่อเติมกระเป๋า"; "เมื่อชำระสำเร็จจะได้รับ ฿306 (รวมโบนัส ฿6)"; "เติมเงินสำเร็จ ฿300";
  "ได้รับโบนัสเพิ่ม ฿6"; ledger `li` rows: "เติมเงินเข้ากระเป๋า"+"+฿300", "โบนัสเติมเงิน"+"+฿6", "ซื้อแพ็กเกจเติมเกม"+"−฿35"+"RoV (Arena of Valor) · 40 คูปอง";
  "คงเหลือ ฿306" exact; balance "฿271"/"฿172" exact (Counter, not Odometer); no mobile overflow
- /topup/status: #number ≥44px; button "ค้นหา"; number exact; "1234****" exact; "RoV (Arena of Valor) · 40 คูปอง"; link /ดูไทม์ไลน์รายการ/; /ไม่พบรายการ/
- /account/topups: heading "ประวัติการเติม"; number exact; "ยอดเติมสะสม ฿35"; "1234****"; link name containing the number
- home: "เติมล่าสุด (สด)" + "1234****" (feed)
- 0 console errors

## decisions
- testimonials stays variant "cards" (not "chat") until the shared `.rw-chat` clash is fixed (see For shared owners)
- stats values "1.2M+"/"99.8%" written as value 1/99 + suffix ".2M+"/".8%" (Odometer formats integers only; 10-char values overflowed)
- /games has NO extra `/games/<slug>` links (journey counts tiles) → the intro visual is a decorative aria-hidden CSS cover fan
- operational pages: no WebGL; motion = CSS transitions + motion layout only; numbers that journeys read stay plain text / Counter

## For shared owners
- SHELL × SECTIONS class clash: shell.css `.rw-chat` (floating LINE button: position fixed, green pill) also matches the
  testimonials `variant="chat"` thread (`sections/client/chat-thread.tsx`, `.rw-chat` in sections/_styles.tsx) → the whole chat
  thread renders as a fixed green bar at the bottom of the viewport on every page using it. Rename one (e.g. sections
  `.rw-chat-thread`). After the fix, switch packages/templates/src/topup.ts testimonials to `variant: "chat"` (§5.2) + reset-demo.
- kit CardStack3D static fan (reduced motion / no WebGL / poster): `li` width is a fixed min(34%,240px) with a 46% step, so
  n cards span (1 + (n-1)·0.46)·34% of the box (8 cards = 143%) and slide under the hero copy; scale the li width by count
  (e.g. min(34%, 240px, 100% / (1 + (n-1)·0.46))). topup.ts uses 6 cards meanwhile — restore 8 (§5.2) after the fix.
- hero split + card-stack (kit CardStack3D orbit): the outer cards are clipped by the canvas edges of the 5-col media column;
  give the orbit some inner padding or let the canvas overflow the column.
