import { readFileSync } from "node:fs";
import { eq, tenants } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, plat, readCreds, shot } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
const status = async (id: string) => (await plat((tx) => tx.select({ s: tenants.status }).from(tenants).where(eq(tenants.id, id))))[0]?.s;
async function waitStore(slug: string, want: number, maxS = 330) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) { const r = await hreq(`${slug}.localhost:3000`, "/"); if (r.status === want) return Math.round((Date.now() - t0) / 1000); await new Promise((res) => setTimeout(res, 10_000)); }
  return -1;
}
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const page = await newPage(ctx);
  const corp = T.corporate;
  // billing
  await go(page, `/t/${corp.slug}/settings/billing`);
  out("billing text", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 700));
  const pick = page.getByRole("button", { name: /เลือกแพ็กเกจนี้/ }).first();
  if (await pick.count()) out("billing pick plan", await anyToast(page, () => pick.click()));
  await page.screenshot({ path: shot("billing"), fullPage: true });
  // danger: self-suspend
  await go(page, `/t/${corp.slug}/settings/danger`);
  await page.getByRole("button", { name: /ระงับชั่วคราว/ }).click();
  out("self-suspend", await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: /ระงับ/ }).last().click()));
  out("db after self-suspend", await status(corp.id));
  out("storefront 503 after (s)", await waitStore(corp.slug, 503));
  await go(page, `/t/${corp.slug}/settings/danger`);
  await page.getByRole("button", { name: /เปิดใช้งาน/ }).first().click();
  out("self-reactivate", await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: /เปิดใช้งาน/ }).last().click()));
  out("db after reactivate", await status(corp.id));
  out("storefront 200 after (s)", await waitStore(corp.slug, 200));
  // cancel the cafe tenant (throwaway)
  const cafe = T.cafe;
  await go(page, `/t/${cafe.slug}/settings/danger`);
  await page.getByRole("button", { name: /ยกเลิกเว็บไซต์/ }).first().click();
  out("cancel cafe", await anyToast(page, () => page.getByRole("dialog").getByRole("button").last().click()));
  out("db cafe", await status(cafe.id));
  out("owner admin of cancelled cafe", { status: await go(page, `/t/${cafe.slug}/dashboard`), text: (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200) });
  await go(page, `/t/${cafe.slug}/settings/danger`);
  out("danger after cancel", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 500));
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
