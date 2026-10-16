import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HERE, SHOTS, isolateHmr, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: admin page screenshot at 390x844 + table geometry. args: path name */
const [p = "/t/demo-restaurant/restaurant/menu", name = "rest-menu"] = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: path.join(HERE, "responsive_b2-admin-state.json"), isMobile: true, hasTouch: true });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, "http://localhost:3001" + p);
  await page.waitForTimeout(2000);
  const t = await page.evaluate(`[...document.querySelectorAll("table")].map(t => { const r = t.getBoundingClientRect(); const row = t.querySelector("tbody tr"); return { top: Math.round(r.top + scrollY), w: Math.round(r.width), head: [...t.querySelectorAll("thead th")].map(th => (th.innerText||"").trim() + ":" + Math.round(th.getBoundingClientRect().width) + (getComputedStyle(th).display === "none" ? "(hidden)" : "")), firstRow: row ? [...row.children].map(td => Math.round(td.getBoundingClientRect().width) + ":" + (td.innerText||"").replace(/\s+/g," ").trim().slice(0, 30)) : [] }; })`);
  console.log(JSON.stringify(t, null, 1));
  const top = (t as { top: number }[])[0]?.top ?? 0;
  await page.evaluate(`window.scrollTo(0, ${Math.max(0, top - 120)})`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, `bughunt-responsive_b2-admin-${name}-390.png`) });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
