import { ADMIN, chromium, collectErrors, loginState, shot } from "./admin_modules-lib";
async function main() {
  const browser = await chromium.launch();
  const st = await loginState(browser);
  const ctx = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs: string[] = [];
  collectErrors(page, errs);
  for (const slug of ["demo-restaurant", "demo-clinic", "demo-salon", "demo-shop"]) {
    await page.goto(`${ADMIN}/t/${slug}/dashboard`, { waitUntil: "networkidle", timeout: 120_000 });
    const kpi = await page.locator('section[aria-label="ตัวเลขวันนี้"]').innerText().catch(() => "(no kpi section)");
    console.log(`== ${slug} dashboard KPIs:`, kpi.replace(/\s+/g, " "));
  }
  for (const [slug, tab] of [["demo-restaurant", "paid"], ["demo-clinic", "paid"]] as const) {
    await page.goto(`${ADMIN}/t/${slug}/payments?tab=${tab}`, { waitUntil: "networkidle", timeout: 120_000 });
    const arts = page.locator("article");
    const n = await arts.count();
    console.log(`== ${slug} payments tab=${tab}: ${n} rows`);
    for (let i = 0; i < Math.min(n, 12); i++) {
      const a = arts.nth(i);
      const txt = (await a.innerText()).replace(/\s+/g, " ").slice(0, 140);
      const hrefs = await a.locator("a").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
      console.log("  row:", txt, "| links:", hrefs.join(","));
    }
    const link = await arts.locator('a[href*="/restaurant/"]').first().getAttribute("href").catch(() => null);
    if (link) {
      const r = await page.goto(`${ADMIN}${link}`, { waitUntil: "networkidle", timeout: 120_000 });
      console.log(`  follow ${link} -> ${r?.status()} h1=`, (await page.locator("h1").first().innerText().catch(() => "")).trim(), "|", (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160));
      await page.screenshot({ path: shot("payments-restaurant-link") });
    }
  }
  console.log("errors:", errs.slice(0, 10));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
