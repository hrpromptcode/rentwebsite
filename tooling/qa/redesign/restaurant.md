# restaurant agent progress (phase 2) — บ้านริม (preset ember)
Owner: packages/modules/restaurant/src/{components,sections}/** + labels, routes (sites)/rw/[tenantId]/{menu,order,reserve,reservations,t}/** + orders/r/**,
packages/templates/src/restaurant.ts, tooling/qa/restaurant-journey.ts

## done
- (2026-10-22) read direction §1-2, §5.4, §6-§7, kit3d.md, kitmotion.md, sections.md, shell.md
- (successor run) read journey; hooks listed below

## journey hooks to KEEP (restaurant-journey.ts, 390px, reducedMotion reduce, isMobile)
- /menu: h1 "เมนู"; nav aria-label "หมวดเมนู" computed position sticky, ≥5 links each ≥44px, `[aria-current="true"]` active, nav y 0..130 after wheel 1600
- item cards `button[aria-label*="฿"]` ≥10; click by name /ชื่อเมนู/; modifier dialog: "ระดับความเผ็ด", "จำเป็น", add button aria-disabled + `fieldset` first gets class bg-destructive; radios/checkbox names; add button text contains ฿amount
- `[data-rw-cartbar] button` aria-label "N รายการ", ≥44px tall, text ฿total; cart sheet "ออเดอร์ของคุณ", line name + "เผ็ดกลาง · ไข่ดาว", link /สั่งกลับบ้าน/ href /order; Escape closes
- /t: h1 contains "โต๊ะ A1"; text "รหัส XXXX"; dialog #guest-name, "ส่งออเดอร์เข้าครัว" → "ส่งออเดอร์เข้าครัวแล้ว" + R-number, "เลือกเมนูต่อ"; "รายการที่สั่งแล้ว (n รอบ)"; "ยอดรวมทั้งโต๊ะ" + following-sibling <p> = total; "รอบที่ 2"; buttons เรียกพนักงาน (→ role=status "แจ้งพนักงานแล้ว"), ขอบิล; bill dialog "ยอดที่ต้องชำระ", ชำระด้วย PromptPay / ชำระที่เคาน์เตอร์, img alt "PromptPay QR", "แนบสลิปโอนเงิน", `.heading-display` = amount, "ชำระเงินสำเร็จ", "ชำระเงินเรียบร้อย ขอบคุณที่มาอุดหนุน", "ขอบิลแล้ว", "ขอบิลแล้ว พนักงานกำลังนำบิลไปที่โต๊ะ", input[type=file]
- /order: h1 "สั่งกลับบ้าน"; text "รับได้ HH:MM–HH:MM น."; link /ติดตามออเดอร์/ href /orders/r/lookup; "ดำเนินการต่อ"; radiogroup "เวลารับอาหาร" radios ≥44px aria-checked; #pickup-name #pickup-phone; input[name=paymentMethodPick][value=promptpay_qr|cash]; label "เงินสดเมื่อมารับ"; "ยืนยันสั่งอาหาร"
- /orders/r/[n]: h1 contains number; "รอชำระเงิน", "เวลารับอาหาร:", "ยอดที่ต้องชำระ", "ทานที่ร้าน", "ชำระที่โต๊ะ/เคาน์เตอร์", "ได้รับสลิปแล้ว รอตรวจสอบ", "ชำระเมื่อมารับ", "กรอกเบอร์โทรศัพท์ที่ใช้สั่ง", "รายการอาหาร" (absent on wrong phone); lookup #lookup-n #lookup-p button ติดตามออเดอร์
- /reserve: h1 "จองโต๊ะล่วงหน้า"; #res-date; radiogroup "เวลา" radios by name "19:00" aria-checked; button /แสดงเวลาอื่น/; group "จำนวนคน" button "เพิ่มจำนวน" ≥44px; input[name=partySize]; radiogroup "โซน" radio /สวน/; "ว่าง สามารถจองได้" / /เต็มในช่วงเวลานี้/; #res-name #res-phone; button ยืนยันการจอง (disabled when full); `p[role=alert]`
- /reservations/[n]: "จองโต๊ะสำเร็จ", number, "4 คน", "สวน" exact, /19:00/, buttons "ยกเลิกการจอง" → "แตะอีกครั้งเพื่อยืนยันยกเลิก" → "ยกเลิกแล้ว"; wrong phone: "กรอกเบอร์โทรศัพท์ที่ใช้จอง", no heading "รายละเอียดการจอง"

## in progress
- home sections done + template recomposed + demo reset (committed in a2d3646 along with first-pass menu page, menu-browser, item-card, menu-cover, pickup-steps, reserve page + reserve-form)
- (successor 2, 2026-10-22) home verified: 1440 + 390 contact sheets, 0 errors, 0 overflow, 1 canvas. NEXT: screenshot module pages, finish menu/order/reserve, then reservations/[n], orders/r/*, /t polish

- (successor 2) DONE: OrderTracker = night status ticket (live dot, CSS steam over status icon while cooking, filled step line,
  pay chip once) + paper receipt aside (shopName, scalloped edge); /orders/r/[n] wide grid + actions prop; AccessGate (new,
  components/access-gate.tsx) for /orders/r/lookup, locked order, locked reservation; /reservations/[n] = headline + night
  place card (giant day, time / party / zone, perforation, number) + details card + actions; TablePanel = night table-tent card,
  round history cards (motion layout, Badge tones), bill sheet due amount big; reserve aside → .rr-night (dark-theme safe).
- baseline journey before these edits: 29/34 (2.7 / 4.0 / 4.2 / 4.3 / 4.5 failed while Turbopack recompiled from my edits — rerun at the end)

- journey rerun 33/34: only 4.0 failed = strict-mode dup of "จองโต๊ะสำเร็จ": Next's app-router-announcer (shadow DOM) copies the
  page h1 text when the streamed title is not in yet (probe qa/redesign/_rr-dup.ts). Journey step 4.0 changed minimally to
  getByRole("heading", { level: 1, name: "จองโต๊ะสำเร็จ" }). Dev server is shared → availability / API timeouts are load flakes; warm routes first.
- FINAL (2026-10-22): shots home/menu/order/reserve/lookup/locked/table + flows (modifier, cart, pickup, tracker, reservation)
  at 1440 + 390, reduced-motion pass, dark-theme spot check (qa/redesign/_rr-dark.ts): 0 console / hydration errors, 0 px overflow,
  ≤ 1 canvas. typecheck web + module green, module tests 43/43, core provision-neutral 10/10, restaurant-journey 34/34.
  STATUS: DONE

## next
- (later phase) apply the shared-owner requests below

## decisions

## For shared owners
- shell / layout: Next's app-router-announcer copies the page h1 text into a shadow-DOM live region whenever document.title is
  still empty at navigation commit (streamed metadata) → getByText(h1 text) is a strict-mode duplicate after server-action
  redirects. Consider awaiting / non-streamed titles for operational routes, or journeys should prefer getByRole("heading").
- tokens: restaurant uses a local --rr-night / --rr-night-fg (same maths as sections' --rw-night) for night panels on
  operational pages where rw-sections CSS is not loaded; promote --rw-night to globals so modules can share it.
- template: hero image = tom yum on dark slate (1548943487-a2e4e43b4853) so SteamRise reads; sticky-story kickers 05:00/07:00/10:00/11:00
  neutralised for new shops via neutralText pairs (provision-neutral forbids \d:\d\d in visible copy); seed dish photos replaced
  (donuts / lattes / pancakes were wrong) with verified ids — see cand sheets in scratchpad; dish + category descriptions added
- module CSS: components/styles.tsx (RestaurantStyles, hoisted <style href="rw-restaurant">), rr-* classes
- verification script: tooling/qa/redesign/restaurant-shots.ts (--home, --pages=, --flows, --reduce, --w=)
