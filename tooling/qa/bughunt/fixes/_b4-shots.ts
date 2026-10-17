import { done, go, launch, newCtx, newPage, readCreds, shot, stateFor } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";
const c = readCreds();
const browser = await launch();
const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await newCtx(browser, { storageState: st, viewport: { width: w, height: h } });
  await isolateHmr(ctx);
  const page = await newPage(ctx);
  for (const [name, p] of process.argv.slice(2).map((a) => a.split("="))) {
    await go(page, p!);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot(`b4-${name}-${w}`), fullPage: false });
  }
  await ctx.close();
}
await browser.close();
await done();
