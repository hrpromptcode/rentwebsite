import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { ADMIN, SLUG, STORE, TENANT, adminDb, here, rowsOf, stateFor, OWNER } from "../topup_admin-lib";
import { sql } from "@rentweb/db";

/**
 * Final top-up verification screenshots (one browser context at a time): storefront home, /games/rov, a keyed
 * /topup/<number>?k=… page and /wallet (signed in, fixture customer of topup_admin-probes setup), then the admin
 * orders queue — each at 390 and 1440. Prints per-shot horizontal overflow and console errors.
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_verify-shots.ts
 */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const W = [390, 1440] as const;
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const want = (n: string) => !only.length || only.some((o) => n.startsWith(o));

async function snap(page: Page, url: string, name: string, errors: string[], detail?: string) {
  if (!want(name)) return;
  for (const w of W) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    const r = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(900);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const f = path.join(SHOTS, `topup-verify-${name}-${w}.png`);
    await page.screenshot({ path: f, animations: "disabled" });
    if (detail && w === 390) {
      const el = page.locator(detail).first();
      await el.scrollIntoViewIfNeeded();
      await el.screenshot({ path: path.join(SHOTS, `topup-verify-${name}-detail-390.png`), animations: "disabled" });
    }
    console.log(`${name} ${w}: HTTP ${r?.status()} url=${new URL(page.url()).pathname}${new URL(page.url()).search ? "?…" : ""} overflow=${sw > w ? `${sw}>${w}` : "none"} errors=${errors.length} → ${path.basename(f)}`);
    errors.length = 0;
  }
}

async function main() {
  const [o] = rowsOf<{ number: string; k: string }>(
    await adminDb().execute(sql`select number, device_id as k from topup_orders where tenant_id = ${TENANT} and status = 'fulfilled' and fulfillment = 'stock' and device_id is not null order by placed_at desc limit 1`),
  );
  if (!o) throw new Error("no keyed stock order");
  const browser = await chromium.launch();
  try {
    const errors: string[] = [];
    const customer = JSON.parse(readFileSync(path.join(here, "topup_admin-state-customer.json"), "utf8"));
    let ctx = await browser.newContext({ storageState: customer, locale: "th-TH" });
    let page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await snap(page, `${STORE}/`, "home", errors);
    await snap(page, `${STORE}/games/rov`, "games-rov", errors);
    await snap(page, `${STORE}/topup/${o.number}?k=${encodeURIComponent(o.k)}`, `order-${o.number}`, errors, "main dl");
    await snap(page, `${STORE}/wallet`, "wallet", errors);
    if (want("wallet") && new URL(page.url()).pathname !== "/wallet") throw new Error(`/wallet redirected to ${page.url()} (customer state expired)`);
    await ctx.close();

    if (!want("admin-orders")) return;
    const owner = await stateFor(browser, "owner", OWNER.email, OWNER.password);
    ctx = await browser.newContext({ storageState: owner, locale: "th-TH" });
    page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await snap(page, `${ADMIN}/t/${SLUG}/topup/orders`, "admin-orders", errors);
    await ctx.close();
  } finally {
    await browser.close();
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
