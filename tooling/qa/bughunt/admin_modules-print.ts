import path from "node:path";
import { ADMIN, chromium, fixName, loginState, shot, shotsDir } from "./admin_modules-lib";
async function main() {
  const browser = await chromium.launch();
  const st = await loginState(browser);
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ storageState: st, viewport: vp });
    await fixName(ctx); const p = await ctx.newPage();
    // order print
    await p.goto(`${ADMIN}/t/demo-shop/orders?q=1044`, { waitUntil: "networkidle", timeout: 120_000 });
    const href = await p.locator('main a[href*="/orders/0"]').first().getAttribute("href");
    await p.goto(`${ADMIN}${href}/print`, { waitUntil: "networkidle", timeout: 120_000 });
    await p.emulateMedia({ media: "print" });
    const info = await p.evaluate(() => {
      const vis = (el: Element | null) => { if (!el) return "missing"; const r = (el as HTMLElement).getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.height > 0 ? "visible" : "HIDDEN"; };
      const sheet = document.querySelector(".print-sheet");
      // reverify-repro 2026-10-17: the AM-04 fix turned the sheet head into <div data-print-sheet-head> (print CSS hides
      // every <header> outside the sheet), so look for either form
      const sheetHeader = sheet?.querySelector("[data-print-sheet-head], header") ?? null;
      const appHeaders = [...document.querySelectorAll("header")].filter((h) => !sheet?.contains(h)).map((h) => vis(h));
      const asides = [...document.querySelectorAll("aside")].map((a) => vis(a));
      const sender = [...(sheet?.querySelectorAll("p") ?? [])].find((x) => x.textContent?.includes("ผู้ส่ง")) ?? null;
      const btns = [...document.querySelectorAll("button")].filter((b) => vis(b) === "visible").map((b) => b.innerText.trim() || b.getAttribute("aria-label")).slice(0, 10);
      return { sheetHeader: vis(sheetHeader), sender: vis(sender), orderNo: sheetHeader?.textContent?.match(/#\d+/)?.[0], appHeaders, asides, visibleButtons: btns, w: document.documentElement.scrollWidth };
    });
    console.log(`order print @${vp.width}:`, JSON.stringify(info));
    console.log(info.sheetHeader === "visible" && info.sender === "visible" && !!info.orderNo && info.appHeaders.every((h: string) => h !== "visible") && info.asides.every((x: string) => x !== "visible") && !info.visibleButtons.length ? `PASS AM-04 order label @${vp.width}: sender + order number ${info.orderNo} visible, app shell hidden` : `FAIL AM-04 order label @${vp.width}`);
    await p.screenshot({ path: shot(`print-order-${vp.width}`), fullPage: true });
    if (vp.width === 1440) await p.pdf({ path: path.join(shotsDir, "bughunt-admin_modules-print-order.pdf"), format: "A4" });
    await p.emulateMedia({ media: "screen" });
    // tables QR print
    await p.goto(`${ADMIN}/t/demo-restaurant/restaurant/tables/print`, { waitUntil: "networkidle", timeout: 120_000 });
    await p.emulateMedia({ media: "print" });
    const info2 = await p.evaluate(() => {
      const vis = (el: Element | null) => { if (!el) return "missing"; const r = (el as HTMLElement).getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.height > 0 ? "visible" : "HIDDEN"; };
      const grid = document.querySelector(".qr-grid");
      const cards = [...document.querySelectorAll(".qr-card")];
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns : "none";
      const headers = [...document.querySelectorAll("header")].map((h) => vis(h) + ":" + (h.textContent ?? "").replace(/\s+/g, " ").slice(0, 30));
      const asides = [...document.querySelectorAll("aside")].map((a) => vis(a));
      const btns = [...document.querySelectorAll("button, a")].filter((b) => vis(b) === "visible" && !grid?.contains(b)).map((b) => ((b as HTMLElement).innerText.trim() || b.getAttribute("aria-label") || "").slice(0, 20)).slice(0, 12);
      const firstCard = cards[0] as HTMLElement | undefined;
      return { cards: cards.length, cols, cardH: firstCard?.getBoundingClientRect().height, headers, asides, visibleOutside: btns, w: document.documentElement.scrollWidth };
    });
    console.log(`tables print @${vp.width}:`, JSON.stringify(info2));
    await p.screenshot({ path: shot(`print-tables-${vp.width}`), fullPage: false });
    if (vp.width === 1440) await p.pdf({ path: path.join(shotsDir, "bughunt-admin_modules-print-tables.pdf"), format: "A4" });
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e.message.slice(0, 300)); process.exit(1); });
