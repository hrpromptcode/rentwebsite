import "../../load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { and, eq, getDb, gt, products, tenants, withPlatform } from "@rentweb/db";

/** responsive_a11y bughunt: signed-in account pages + cart/checkout with an item, at 390 and 1440 (demo-shop, demo-cafe, demo-clinic, demo-salon). */
const HERE = path.resolve("qa/bughunt");
const CHECKS = readFileSync(path.join(HERE, "responsive_a11y-checks.js"), "utf8").replace(/^\s*\/\/.*\n/, "").trim();
const log = (...a: unknown[]) => console.log(...a);
const SLUGS = process.argv.slice(2).length ? process.argv.slice(2) : ["demo-shop", "demo-clinic"];

async function report(page: Page, label: string, width: number) {
  const r = (await page.evaluate(`(${CHECKS})(${JSON.stringify({ tap: width === 390, contrast: width === 1440 })})`)) as Record<string, any>;
  const keys = ["overflow", "imgNoAlt", "imgDistorted", "noName", "noLabel", "fixedOverlap", "covered", "hidden", "contrast"];
  const parts = keys.filter((k) => r[k]?.length).map((k) => `${k}: ${r[k].slice(0, 8).join(" || ")}`);
  const tap = (r.tap ?? []).filter((t: string) => !/hover:text|text-background\/85|Siam Atelier|Facebook|Instagram|LINE'|gap-2\.5/.test(t));
  log(`\n## ${label} @${width} sw=${r.sw}/${r.vw} title=${await page.title()}`);
  for (const p of parts) log("  " + p.slice(0, 1200));
  if (tap.length) log("  tap(filtered): " + tap.slice(0, 10).join(" || "));
}

async function main() {
  const db = getDb();
  const prod = await withPlatform(db, (tx) =>
    tx.select({ id: products.id, slug: products.slug, tenant: tenants.slug }).from(products).innerJoin(tenants, eq(tenants.id, products.tenantId)).where(and(eq(products.status, "active"), eq(products.hasVariants, false), gt(products.stock, 5))),
  );
  const browser = await chromium.launch();
  for (const slug of SLUGS) {
    const O = `http://${slug}.localhost:3000`;
    const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const lp = await lctx.newPage();
    await lp.goto(O + "/account/login", { waitUntil: "networkidle" });
    const phone = "089" + String(Date.now()).slice(-7);
    await lp.fill("#otp-target", phone);
    await lp.locator('form button[type="submit"]').first().click();
    const codeEl = lp.locator("span.font-mono").first();
    await codeEl.waitFor({ timeout: 20_000 });
    const code = (await codeEl.textContent())!.trim();
    await lp.fill("#otp-code", code);
    if (await lp.locator("#otp-name").count()) await lp.fill("#otp-name", "QA RA ทดสอบ");
    await lp.locator('form button[type="submit"]').first().click();
    await lp.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 30_000 }).catch(() => {});
    log(`[${slug}] signed in as ${phone} -> ${lp.url()}`);
    const p = prod.find((x) => x.tenant === slug);
    if (p) {
      const res = await lp.evaluate(async (pid) => (await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: pid, quantity: 1 }) })).status, p.id);
      log(`[${slug}] cart add ${p.slug} -> ${res}`);
    }
    const state = await lctx.storageState();
    await lctx.close();
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, reducedMotion: "reduce", storageState: state, isMobile: width < 768, hasTouch: width < 768 });
      const page = await ctx.newPage();
      const errs: string[] = [];
      page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errs.push("[pageerror] " + e.message.slice(0, 200)));
      for (const route of ["/account", "/account/orders", "/account/bookings", "/account/packages", ...(p ? ["/cart", "/checkout"] : [])]) {
        const r = await page.goto(O + route, { waitUntil: "networkidle" });
        if (!r || r.status() >= 400 || !page.url().includes(route)) { log(`\n## ${route} @${width} -> ${r?.status()} ${page.url()}`); continue; }
        await page.waitForTimeout(400);
        await report(page, route, width);
        if (width === 390 && (route === "/checkout" || route === "/account")) await page.screenshot({ path: `screenshots/bughunt-responsive_a11y-${slug}${route.replace(/\//g, "-")}-390.png`, fullPage: true });
      }
      if (errs.length) log("  console errors:", JSON.stringify([...new Set(errs)]));
      await ctx.close();
    }
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
