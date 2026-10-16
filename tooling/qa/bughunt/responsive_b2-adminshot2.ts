import "../../load-env";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HERE, SHOTS, isolateHmr, gotoRetry } from "./responsive_b2-lib";

/** responsive_b2: admin restaurant menu table at 390 scrolled fully right inside its scroller (where the sold-out toggles live). */
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: path.join(HERE, "responsive_b2-admin-state.json"), isMobile: true, hasTouch: true });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await gotoRetry(page, "http://localhost:3001/t/demo-restaurant/restaurant/menu");
  await page.waitForTimeout(2000);
  const r = await page.evaluate(`(() => { const t = document.querySelector("table"); let sc = t.parentElement; while (sc && !["auto","scroll"].includes(getComputedStyle(sc).overflowX)) sc = sc.parentElement; window.scrollTo(0, t.getBoundingClientRect().top + scrollY - 120); sc.scrollLeft = 10000; const sw = [...t.querySelectorAll("tbody tr")[0].querySelectorAll("button,[role=switch],input")].map(b => (b.getAttribute("aria-label") || b.innerText || b.type).trim().slice(0, 30) + "@x=" + Math.round(b.getBoundingClientRect().left)); return { scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollLeft: sc.scrollLeft, rowH: Math.round(t.querySelector("tbody tr").getBoundingClientRect().height), controlsRow1: sw, shadowHint: getComputedStyle(sc).maskImage + " " + getComputedStyle(sc).backgroundImage.slice(0, 40) }; })()`);
  console.log(JSON.stringify(r));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-responsive_b2-admin-rest-menu-scrolled-390.png") });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
