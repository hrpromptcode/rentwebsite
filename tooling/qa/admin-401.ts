import "../load-env";
import { chromium } from "@playwright/test";

/** Logs in and prints every HTTP response >= 400 (URL + status + initiator type) for a few admin routes.
 *  MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/admin-401.ts [path ...] */
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const routes = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((p) => (p.startsWith("/") ? p : `/${p}`));
const targets = routes.length ? routes : ["/t/demo-shop/dashboard", "/t/demo-shop/pages", "/t/demo-shop/design", "/t/demo-shop/settings", "/console"];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const bad: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.request().resourceType()} ${r.request().method()} ${r.url().slice(0, 160)}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") bad.push(`console: ${m.text().slice(0, 160)} @ ${m.location().url?.slice(0, 100)}`);
  });
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click("button[type=submit]")]);
  await page.waitForLoadState("networkidle");
  console.log("after login:", bad.length ? bad : "clean");
  for (const r of targets) {
    bad.length = 0;
    await page.goto(`${ADMIN}${r}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1500);
    console.log(`\n${r}:`);
    for (const b of bad) console.log("  " + b);
    if (!bad.length) console.log("  clean");
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
