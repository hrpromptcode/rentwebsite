import { readFileSync } from "node:fs";
import { eq, tenants } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, plat, readCreds, shot } from "./admin_b2-lib";
async function main() {
  const C = readCreds(); const cafe = C.tenants.find((t: any) => t.key === "cafe");
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const page = await newPage(ctx);
  await go(page, `/t/${cafe.slug}/settings/danger`);
  await page.getByRole("button", { name: /ยกเลิกเว็บไซต์/ }).first().click();
  const dlg = page.getByRole("dialog");
  out("dialog", (await dlg.innerText()).replace(/\s+/g, " "));
  out("cancel", await anyToast(page, () => dlg.getByRole("button", { name: new RegExp(process.argv[2] ?? "ยกเลิกเว็บไซต์") }).last().click()));
  out("db", (await plat((tx) => tx.select({ s: tenants.status }).from(tenants).where(eq(tenants.id, cafe.id))))[0]);
  await go(page, `/t/${cafe.slug}/settings/danger`);
  out("danger after cancel", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(300, 900));
  await page.screenshot({ path: shot("danger-cancelled"), fullPage: true });
  out("owner dashboard of cancelled", (await (async () => { await go(page, `/t/${cafe.slug}/dashboard`); return (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200); })()));
  out("owner can still edit products?", await (async () => { await go(page, `/t/${cafe.slug}/products`); return (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120); })());
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
