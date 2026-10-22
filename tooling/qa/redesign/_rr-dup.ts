/** restaurant agent probe: which elements carry the reservation success text after the server-action redirect */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const BASE = "http://demo-restaurant.localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "th-TH" });
await isolateHmr(ctx);
const page = await ctx.newPage();
const d = new Date(Date.now() + (50 + (Date.now() % 20)) * 86400000).toISOString().slice(0, 10);
await stableGoto(page, `${BASE}/reserve?date=${d}&time=19:00&size=2&zone=${encodeURIComponent("ในบ้าน")}`, "load");
await page.getByText("ว่าง สามารถจองได้").waitFor({ timeout: 60000 });
await page.locator("#res-name").fill("คุณโพรบ");
await page.locator("#res-phone").fill("0891112233");
await page.getByRole("button", { name: /ยืนยันการจอง/ }).click();
await page.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 60000 });
for (let i = 0; i < 12; i++) {
  const c = await page.getByText("จองโต๊ะสำเร็จ").count();
  const ann = await page.evaluate(() => document.querySelector("next-route-announcer")?.shadowRoot?.textContent ?? "(none)");
  console.log(i, c, ann.slice(0, 80));
  await page.waitForTimeout(150);
}
const hits = await page.evaluate(() => {
  const out: string[] = [];
  const walk = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walk.nextNode())) if (n.textContent?.includes("จองโต๊ะสำเร็จ")) out.push(`${n.parentElement?.tagName} ${(n.parentElement?.outerHTML ?? "").slice(0, 200)} | ancestors: ${[...(function* (e: Element | null) { while (e) { yield e.tagName.toLowerCase() + (e.id ? "#" + e.id : ""); e = e.parentElement; } })(n.parentElement)].slice(0, 6).join("<")}`);
  return { out, title: document.title };
});
console.log(JSON.stringify(hits, null, 1));
await page.getByRole("button", { name: "ยกเลิกการจอง" }).click();
await page.getByRole("button", { name: "แตะอีกครั้งเพื่อยืนยันยกเลิก" }).click();
await page.getByText("ยกเลิกแล้ว").first().waitFor({ timeout: 15000 });
console.log("cancelled", page.url());
await browser.close();
