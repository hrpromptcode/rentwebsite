import { readFileSync } from "node:fs";
import { desc, eq, orders } from "@rentweb/db";
import { ADMIN, done, launch, newCtx, out, readCreds, shot, tenantIdOf, tt } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
async function main() {
  const browser = await launch();
  const shopId = await tenantIdOf(T.shop.slug);
  const [o] = await tt(shopId, (tx) => tx.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.tenantId, shopId)).orderBy(desc(orders.createdAt)).limit(1));
  for (const role of ["owner", "staff"]) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(`qa/bughunt/admin_b2-state-${role}.json`, "utf8")), viewport: vp });
      const p = await ctx.newPage();
      await p.goto(`${ADMIN}/t/${T.shop.slug}/orders/${o!.id}/print`, { waitUntil: "networkidle", timeout: 120_000 });
      await p.emulateMedia({ media: "print" });
      const info = await p.evaluate(() => {
        const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && r.height > 0; };
        const visibleText = [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && vis(e)).map((e) => (e.textContent ?? "").trim()).filter(Boolean).join(" | ");
        return { visibleText: visibleText.slice(0, 700), scrollW: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll("button,a")].filter(vis).map((b) => (b as HTMLElement).innerText.trim()).slice(0, 6) };
      });
      out(`order print ${role}@${vp.width}`, info);
      await p.screenshot({ path: shot(`print-order-${role}-${vp.width}`), fullPage: true });
      if (vp.width === 1440 && role === "owner") { const pdf = await p.pdf({ format: "A4" }); out("order pdf pages", (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length); }
      // tables
      await p.emulateMedia({ media: "screen" });
      const s = await p.goto(`${ADMIN}/t/${T.restaurant.slug}/restaurant/tables/print`, { waitUntil: "networkidle", timeout: 120_000 });
      await p.emulateMedia({ media: "print" });
      const info2 = await p.evaluate(() => {
        const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.height > 0; };
        const cards = [...document.querySelectorAll(".qr-card")];
        const imgs = cards.map((c) => c.querySelector("img") as HTMLImageElement | null);
        return { cards: cards.length, imgsLoaded: imgs.filter((i) => i && i.complete && i.naturalWidth > 0).length, firstCard: (cards[0] as HTMLElement | undefined)?.innerText.replace(/\s+/g, " ").slice(0, 120), outside: [...document.querySelectorAll("button,a,h1,aside,header")].filter((b) => vis(b) && !b.closest(".qr-grid")).map((b) => (b as HTMLElement).innerText.trim().slice(0, 25)).slice(0, 8), cols: getComputedStyle(document.querySelector(".qr-grid")!).gridTemplateColumns, scrollW: document.documentElement.scrollWidth };
      });
      out(`tables print ${role}@${vp.width} (status ${s?.status()})`, info2);
      await p.screenshot({ path: shot(`print-tables-${role}-${vp.width}`), fullPage: false });
      if (vp.width === 1440 && role === "owner") { const pdf = await p.pdf({ format: "A4" }); out("tables pdf pages", (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length); }
      await ctx.close();
    }
  }
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
