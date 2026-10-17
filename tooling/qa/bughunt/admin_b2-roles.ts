import { readFileSync } from "node:fs";
import { and, eq, pages } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, readCreds, shot, tenantIdOf, tt, type P } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
async function vis(page: P, name: RegExp, role: "button" | "link" = "button") {
  const l = page.getByRole(role, { name });
  const n = await l.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) if (await l.nth(i).isVisible()) out.push(((await l.nth(i).isDisabled().catch(() => false)) ? "disabled" : "enabled"));
  return out.length ? out.join(",") : "hidden";
}
async function main() {
  const browser = await launch();
  const shop = T.shop.slug as string;
  const tid = await tenantIdOf(shop);
  const [home] = await tt(tid, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, tid), eq(pages.kind, "home"))));
  for (const role of ["staff", "manager"] as const) {
    const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(`qa/bughunt/admin_b2-state-${role}.json`, "utf8")) });
    const page = await newPage(ctx);
    // pages list + editor
    await go(page, `/t/${shop}/pages`);
    out(`${role} pages: create button`, await vis(page, /สร้างหน้า/));
    await go(page, `/t/${shop}/pages/${home!.id}`);
    out(`${role} editor buttons`, { save: await vis(page, /บันทึกร่าง/), publish: await vis(page, /^เผยแพร่$/), add: await vis(page, /เพิ่มเซ็กชัน/) });
    // add a hero, try image upload
    await page.getByRole("button", { name: "เพิ่มเซ็กชัน" }).first().click();
    await page.getByRole("dialog").locator("button.flex.min-h-14", { hasText: "ฮีโร่" }).first().click();
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 80, height: 60 } });
    const fileInput = page.locator('label[aria-label="อัปโหลดรูป"] input[type=file], input[type=file][accept="image/*"]').first();
    // reverify-repro 2026-10-17: a successful section-image upload fills the image URL field and shows NO toast (only failures
    // toast, ADMIN_B2-14 fix), so "(no toast)" alone proves nothing — read the URL field as well
    if (await fileInput.count()) {
      const t = await anyToast(page, () => fileInput.setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: png }), 30_000);
      await page.waitForFunction(() => [...document.querySelectorAll('fieldset input[id$="-url"]')].some((i) => (i as HTMLInputElement).value.includes("/uploads/")), null, { timeout: 60_000 }).catch(() => {});
      const urls = await page.locator('fieldset input[id$="-url"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean));
      out(`${role} section image upload`, { toast: t, url: urls.find((u) => u.includes("/uploads/")) ?? null });
      console.log(urls.some((u) => u.includes("/uploads/")) && !page.__errors.length ? `PASS ADMIN_B2-14 ${role} section image upload fills the URL` : `FAIL ADMIN_B2-14 ${role} section image upload`);
    }
    else out(`${role} section image upload`, "no upload control");
    // remove the added hero again (do not save it)
    await page.reload({ waitUntil: "networkidle" });
    if (role === "staff") {
      // SEO change on the published home page via save draft
      const before = (await hreq(`${shop}.localhost:3000`, "/")).body.match(/<title>([^<]*)<\/title>/)?.[1];
      await page.getByRole("button", { name: "ตั้งค่าหน้า & SEO" }).click();
      await page.fill("#seo-title", `STAFF-EDITED-SEO ${C.rand}`);
      out("staff saves home SEO", await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click()));
      await page.waitForTimeout(1500);
      const after = (await hreq(`${shop}.localhost:3000`, "/")).body.match(/<title>([^<]*)<\/title>/)?.[1];
      out("storefront home <title> before/after staff draft save", { before, after });
    }
    // media
    await go(page, `/t/${shop}/media`);
    out(`${role} media`, { upload: await page.locator('input[type="file"]').count(), delete: await vis(page, /ลบ/) });
    // navigation
    await go(page, `/t/${shop}/navigation`);
    out(`${role} navigation`, { save: await vis(page, /^บันทึก$/), add: await vis(page, /เพิ่มเมนู/), inputsDisabled: await page.locator('input[aria-label="ชื่อเมนู"]').first().isDisabled().catch(() => null) });
    // settings
    for (const p of ["/settings", "/settings/payments", "/settings/domains", "/settings/team", "/settings/billing", "/settings/danger", "/design"]) {
      const s = await go(page, `/t/${shop}${p}`);
      const firstInput = page.locator("main input:not([type=hidden]):not([type=search])").first();
      const dis = (await firstInput.count()) ? await firstInput.isDisabled() : "no-input";
      out(`${role} ${p}`, { status: s, h1: await page.locator("main h1").first().innerText().catch(() => ""), firstInputDisabled: dis, save: await vis(page, /บันทึก|เชิญ|เพิ่มโดเมน|ระงับ|ยกเลิกเว็บ|อัปเกรด|เปลี่ยนแพ็กเกจ/) });
    }
    await page.screenshot({ path: shot(`role-${role}-design`) });
    // print label as role
    const ord = await page.evaluate(async (s) => { const r = await fetch(`/t/${s}/orders`); const t = await r.text(); return t.match(/\/orders\/([0-9a-f-]{36})/)?.[1]; }, shop);
    if (ord) { const s = await go(page, `/t/${shop}/orders/${ord}/print`); out(`${role} order print`, { status: s, text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 80) }); }
    out(`${role} errors`, page.__errors.slice(0, 4));
    await ctx.close();
  }
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
