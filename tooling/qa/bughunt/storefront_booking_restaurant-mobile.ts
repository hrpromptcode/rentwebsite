import "../../load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
/** 390px sweep of crawled pages: horizontal overflow + elements wider than viewport. */
const here = path.dirname(fileURLToPath(import.meta.url));
async function main() {
  const txt = await readFile(path.join(here, "storefront_booking_restaurant-crawl.txt"), "utf8");
  const urls = [...new Set(txt.split("\n").filter((l) => / 200 /.test(l) && !l.startsWith(" ")).map((l) => { const [t, , u] = l.split(" "); return `${t} ${u}`; }))]
    .filter((x) => !/\/book\?service=.*&staff=|\/order\?item=/.test(x));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "th-TH", timezoneId: "Asia/Bangkok", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const x of urls) {
    const [t, u] = x.split(" ");
    try {
      await page.goto(`http://${t}.localhost:3000${u}`, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const ov = document.documentElement.scrollWidth - window.innerWidth;
        const wide = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 1 && b.width > 0 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => `${e.tagName}.${(e.className || "").toString().slice(0, 40)} r=${Math.round(e.getBoundingClientRect().right)}`);
        return { ov, wide };
      });
      if (r.ov > 0) console.log(`OVERFLOW ${t} ${u} ${r.ov}px ${r.wide.join(" | ")}`);
    } catch (e) { console.log(`ERR ${t} ${u} ${String(e).slice(0, 120)}`); }
  }
  console.log(`checked ${urls.length}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
