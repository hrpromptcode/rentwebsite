import { done, go, launch, newCtx, newPage, readCreds, stateFor } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";
const c = readCreds();
const paths = process.argv.slice(2);
const browser = await launch();
const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
const ctx = await newCtx(browser, { storageState: st, viewport: { width: 390, height: 844 } });
await isolateHmr(ctx);
const page = await newPage(ctx);
for (const p of paths) {
  await go(page, p);
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0) {
        let hidden = false;
        for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(s.overflowX) && a.getBoundingClientRect().right <= vw + 1) { hidden = true; break; } }
        if (!hidden) offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} r=${Math.round(r.right)} w=${Math.round(r.width)}`);
      }
    }
    return { vw, sw, offenders: offenders.slice(0, 8) };
  });
  console.log(p, JSON.stringify(res));
}
await browser.close();
await done();
