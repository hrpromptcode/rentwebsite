import { eq, getAdminDb, navigation, tenants, tenantModules, pages, forms } from "@rentweb/db";
import path from "node:path";
import { ADMIN, SHOTS, fetchTenant, goto, launch, newPage, out, signup, writeCreds, readCreds } from "./admin_core-lib";

const db = getAdminDb();
const RAND = Math.random().toString(36).slice(2, 6);
const TEMPLATES: Array<{ key: string; label: RegExp; name: string; slug: string }> = [
  { key: "shop", label: /ร้านค้าออนไลน์/, name: "ร้านผ้าทอบ้านนา", slug: `ac-shop-${RAND}` },
  { key: "cafe", label: /คาเฟ่/, name: `AC Sweet Cafe ${RAND}`, slug: "" },
  { key: "salon", label: /ซาลอน/, name: "สปาสบายใจ", slug: `ac-salon-${RAND}` },
  { key: "clinic", label: /คลินิก/, name: `AC Smile Clinic ${RAND}`, slug: "" },
  { key: "restaurant", label: /ร้านอาหาร/, name: "ครัวคุณยาย", slug: `ac-rest-${RAND}` },
  { key: "corporate", label: /บริษัท/, name: `AC Northwind Co ${RAND}`, slug: "" },
];

async function main() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await newPage(ctx);
  const email = `qa-ac-${RAND}@example.com`;
  const password = `Ac-${RAND}-Pw9!`;
  await signup(page, "QA AC Owner", email, password);
  writeCreds({ owner: { email, password }, rand: RAND });
  out("signup", page.url());

  // ---- slug validation on the wizard ----
  await page.getByRole("button", { name: TEMPLATES[0]!.label }).first().click();
  await page.getByRole("button", { name: /ถัดไป/ }).click();
  await page.locator("#shop-name").waitFor();
  const status = () => page.locator("#slug-status").innerText();
  const slugVal = () => page.locator("#shop-slug").inputValue();
  const next = page.getByRole("button", { name: /ถัดไป/ });
  // Thai name -> auto slug
  await page.locator("#shop-name").fill("ร้านกาแฟบ้านสวน");
  await page.waitForTimeout(1200);
  out("thai-name auto slug", { slug: await slugVal(), status: await status(), nextEnabled: await next.isEnabled() });
  // typing a hyphenated slug with the keyboard
  await page.locator("#shop-slug").click();
  await page.keyboard.type("my-shop", { delay: 60 });
  await page.waitForTimeout(1500);
  out("typed 'my-shop'", { slug: await slugVal(), status: await status() });
  for (const s of ["ร้านค้า", "admin", "www", "demo-shop", "demo-xyz", "ab", "qa-test-22bt", "a--b", "-abc-", "xn--abc", "api", "shop.test", "UPPER"]) {
    await page.locator("#shop-slug").fill(s);
    await page.waitForTimeout(1800);
    out(`slug '${s}'`, { slug: await slugVal(), status: (await status()).trim(), nextEnabled: await next.isEnabled() });
  }
  await page.screenshot({ path: path.join(SHOTS, "bughunt-admin_core-wizard-slug.png") });

  // ---- create a tenant from each template ----
  const created: Array<Record<string, unknown>> = [];
  for (const t of TEMPLATES) {
    await goto(page, "/onboarding");
    await page.getByRole("button", { name: t.label }).first().click();
    await page.getByRole("button", { name: /ถัดไป/ }).click();
    await page.locator("#shop-name").fill(t.name);
    if (t.slug) await page.locator("#shop-slug").fill(t.slug);
    await page.waitForFunction(() => /ใช้ได้|ว่าง/.test(document.querySelector("#slug-status")?.textContent ?? ""), null, { timeout: 20_000 }).catch(() => {});
    const slug = await page.locator("#shop-slug").inputValue();
    const st = (await page.locator("#slug-status").innerText()).trim();
    await page.getByRole("button", { name: /ถัดไป/ }).click();
    const t0 = Date.now();
    await Promise.all([page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 120_000 }), page.getByRole("button", { name: /สร้างเว็บไซต์/ }).click()]);
    await page.waitForLoadState("networkidle");
    const finalSlug = new URL(page.url()).pathname.split("/")[2]!;
    const kpi = (await page.locator("section[aria-label='ตัวเลขวันนี้']").innerText().catch(() => "")).replace(/\s+/g, " ");
    const checklist = await page.locator("ul.divide-y > li").evaluateAll((els) => els.map((e) => `${e.querySelector("svg.lucide-circle-check, svg.lucide-check-circle-2, [data-done=true]") ? "[x]" : "[ ]"} ${(e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50)}`));
    const progressText = (await page.locator("[role=progressbar]").getAttribute("aria-valuenow").catch(() => null)) ?? "";
    await page.screenshot({ path: path.join(SHOTS, `bughunt-admin_core-dash-${t.key}.png`) });
    const [row] = await db.select().from(tenants).where(eq(tenants.slug, finalSlug));
    const mods = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, row!.id));
    const settings = row!.settings as Record<string, any>;
    const host = `${finalSlug}.localhost:3000`;
    const home = await fetchTenant(host, "/");
    const title = /<title>([^<]*)<\/title>/.exec(home.body)?.[1];
    // crawl nav links on home
    const hrefs = Array.from(new Set(Array.from(home.body.matchAll(/href="(\/[^"#?]*)"/g)).map((m) => m[1]!).filter((h) => !h.startsWith("/_next") && !h.startsWith("/uploads"))));
    const broken: string[] = [];
    for (const h of hrefs.slice(0, 40)) {
      const r = await fetchTenant(host, encodeURI(decodeURI(h)));
      if (r.status >= 400) broken.push(`${h} -> ${r.status}`);
    }
    const nav = await db.select().from(navigation).where(eq(navigation.tenantId, row!.id));
    const pg = await db.select({ slug: pages.slug, status: pages.status }).from(pages).where(eq(pages.tenantId, row!.id));
    const fm = await db.select({ slug: forms.slug, notify: forms.notifyEmails }).from(forms).where(eq(forms.tenantId, row!.id)).catch(() => []);
    const info = {
      key: t.key, name: t.name, requestedSlug: t.slug || "(auto)", wizardSlug: slug, wizardStatus: st, finalSlug, ms: Date.now() - t0,
      status: row!.status, plan: row!.planKey, modules: mods.map((m) => m.moduleKey),
      contact: settings.contact, payments: settings.payments,
      kpi, progressText, checklist,
      storefront: { status: home.status, title, containsName: home.body.includes(t.name), hasTemplateBrand: /Siam Atelier|Sugar Puff|Sabai|Lumi|บ้านริม|Northstar/i.test(home.body) },
      brokenLinks: broken, linksChecked: hrefs.length,
      pages: pg.map((p) => `${p.slug}:${p.status}`), forms: fm,
      navHeader: nav.find((n) => n.location === "header")?.items.map((i: any) => i.href),
      errors: page.__errors.splice(0).slice(0, 5),
    };
    created.push({ key: t.key, slug: finalSlug, id: row!.id });
    out(`tenant ${t.key}`, info);
  }
  writeCreds({ tenants: created });
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
