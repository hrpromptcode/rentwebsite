import { eq, navigation, pages, tenants, tenantModules } from "@rentweb/db";
import { ADMIN, done, go, launch, newCtx, newPage, out, plat, rand, readCreds, sget, shot, writeCreds, OWNER_STATE } from "./admin_b2-lib";

const R = rand();
const TPL: Array<{ key: string; label: RegExp; name: string }> = [
  { key: "shop", label: /ร้านค้าออนไลน์/, name: `QA B2 Shop ${R}` },
  { key: "cafe", label: /คาเฟ่/, name: `QA B2 Cafe ${R}` },
  { key: "salon", label: /ซาลอน/, name: `QA B2 Salon ${R}` },
  { key: "clinic", label: /คลินิก/, name: `QA B2 Clinic ${R}` },
  { key: "restaurant", label: /ร้านอาหาร/, name: `QA B2 Rest ${R}` },
  { key: "corporate", label: /บริษัท/, name: `QA B2 Corp ${R}` },
];
const SAMPLE = /0812345678|081-234-5678|123-4-56789-0|Siam Atelier|Northstar|northstar|@siamatelier|@lumiere|02-123-4567|contact@/;

async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser, { reducedMotion: "reduce" });
  const page = await newPage(ctx);
  // ---------- signup validation ----------
  await go(page, "/signup");
  const err = async () => (await page.locator("form [role=alert], form .text-destructive, form p.text-sm.text-destructive").allInnerTexts().catch(() => [])).join(" | ");
  await page.fill("#name", "a"); await page.fill("#email", `qa-b2-x${R}@example.com`); await page.fill("#password", "Passw0rd!x");
  await page.click('button[type="submit"]'); await page.waitForTimeout(1500);
  out("signup short name", { url: page.url(), err: await err() });
  await page.fill("#name", "QA Dup"); await page.fill("#email", "admin@rentweb.local");
  await page.click('button[type="submit"]'); await page.waitForTimeout(4000);
  out("signup existing email", { url: page.url(), err: await err() });
  await page.fill("#email", "ADMIN@RentWeb.Local");
  await page.click('button[type="submit"]'); await page.waitForTimeout(4000);
  out("signup existing email (upper-case)", { url: page.url(), err: await err() });
  await page.fill("#email", "not-an-email");
  await page.click('button[type="submit"]'); await page.waitForTimeout(1000);
  out("signup bad email (native validity)", { url: page.url(), valid: await page.locator("#email").evaluate((e: HTMLInputElement) => e.validity.valid) });
  // API-level: short password / whitespace password / huge name
  const api = async (body: unknown) => page.evaluate(async (b) => { const r = await fetch("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.text()).slice(0, 160) }; }, body);
  out("api short pw", await api({ name: "QA", email: `qa-b2-pw${R}@example.com`, password: "1234567" }));
  out("api spaces pw", await api({ name: "QA", email: `qa-b2-sp${R}@example.com`, password: "        " }));
  out("api empty name", await api({ name: "", email: `qa-b2-nm${R}@example.com`, password: "Passw0rd!x" }));
  out("api 5000-char name", await api({ name: "ก".repeat(5000), email: `qa-b2-ln${R}@example.com`, password: "Passw0rd!x" }));
  // sign out whatever the API calls signed in
  await go(page, "/logout");
  // ---------- real signup ----------
  const email = `qa-b2-${R}@example.com`;
  const password = `B2-${R}-Pw9!`;
  await go(page, "/signup");
  await page.fill("#name", `QA B2 Owner ${R}`); await page.fill("#email", email); await page.fill("#password", password);
  await Promise.all([page.waitForURL(/\/onboarding/, { timeout: 90_000 }), page.click('button[type="submit"]')]);
  writeCreds({ owner: { email, password }, rand: R });
  out("signed up", email);
  const created: any[] = [];
  for (const t of TPL) {
    await go(page, "/onboarding");
    await page.getByRole("button", { name: t.label }).first().click();
    await page.getByRole("button", { name: /ถัดไป/ }).click();
    await page.locator("#shop-name").fill(t.name);
    await page.waitForFunction(() => /ใช้ได้|ว่าง/.test(document.querySelector("#slug-status")?.textContent ?? ""), null, { timeout: 30_000 }).catch(() => {});
    await page.locator("#shop-slug").blur();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /ถัดไป/ }).click();
    await Promise.all([page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 180_000 }), page.getByRole("button", { name: /สร้างเว็บไซต์/ }).click()]);
    await page.waitForLoadState("networkidle");
    const slug = new URL(page.url()).pathname.split("/")[2]!;
    const [row] = await plat((tx) => tx.select().from(tenants).where(eq(tenants.slug, slug)));
    const mods = await plat((tx) => tx.select().from(tenantModules).where(eq(tenantModules.tenantId, row!.id)));
    const st = row!.settings as any;
    const checklist = (await page.locator("main").innerText()).match(/เช็กลิสต์[\s\S]{0,600}/)?.[0]?.replace(/\s+/g, " ").slice(0, 400);
    await page.screenshot({ path: shot(`dash-${t.key}`) });
    const home = await sget(slug, "/");
    const contact = await sget(slug, "/contact");
    const sampleHits = [...new Set([...(home.body.match(new RegExp(SAMPLE, "g")) ?? []), ...(contact.body.match(new RegExp(SAMPLE, "g")) ?? [])])];
    const lineBtn = /line\.me|แชตผ่าน LINE/.test(home.body);
    created.push({ key: t.key, slug, id: row!.id });
    out(`tenant ${t.key}`, { slug, status: row!.status, modules: mods.filter((m) => m.enabled).map((m) => m.moduleKey), payments: st.payments, contact: st.contact, checklist, home: home.status, contactPage: contact.status, sampleHits, lineBtn });
  }
  writeCreds({ tenants: created });
  await ctx.storageState({ path: OWNER_STATE });
  out("errors", page.__errors.slice(0, 10));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
