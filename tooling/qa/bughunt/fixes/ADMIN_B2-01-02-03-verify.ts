/**
 * ADMIN_B2-01 / -02 / -03 regression (browser + DB + storefront HTTP) on the throwaway tenants of admin_b2-creds.json.
 *  01: on a PUBLISHED page, "บันทึกร่าง" of title / slug / SEO / noindex keeps the storefront unchanged (old URL 200, old
 *      <title>, no noindex, new URL 404) and stores the edit in pages.draft_meta; the editor reloads the draft values;
 *      "เผยแพร่" moves them live (new URL 200 + new title + noindex, old URL 404, draft_meta null).
 *  02: "ดูตัวอย่าง" opens <storefront>/preview?token=<signed> for this page (token verified here); the storefront route
 *      itself is a follow-up for the apps/web owner, so its status is only reported.
 *  03: slug "staff" refused on the booking tenant, "packages" on the clinic tenant, "services" allowed on the cms-only one.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-01-02-03-verify.ts
 */
import { and, eq, pages } from "@rentweb/db";
import { verifyPreviewToken } from "@rentweb/core/preview-token";
import { ADMIN, done, go, hreq, launch, newCtx, newPage, rand, readCreds, shot, stateFor, toast, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const c = readCreds();
const T = (key: string) => c.tenants.find((t: { key: string }) => t.key === key) as { slug: string; id: string };
const shop = T("shop");
const r = rand();
const slug = `qa-b4-pg-${r}`;
const renamed = `${slug}-renamed`;
const store = async (path: string) => {
  const res = await hreq(`${shop.slug}.localhost:3000`, path);
  return { status: res.status, title: res.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? null, robots: res.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null };
};

const sections = [{ id: "qab4txt1", type: "text", props: { eyebrow: "", heading: `QAB4-LIVE-${r}`, body: "", align: "left", size: "normal" } }];
const [row] = await tt(shop.id, (tx) =>
  tx.insert(pages).values({ tenantId: shop.id, slug, title: `QAB4 Live ${r}`, kind: "page", status: "published", sections, publishedSections: sections, seo: { title: `QAB4-SEO-LIVE-${r}` }, publishedAt: new Date() }).returning({ id: pages.id }),
);
const pageId = row!.id;
const created: Array<{ tenant: string; id: string }> = [{ tenant: shop.id, id: pageId }];

const browser = await launch();
try {
  const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
  const ctx = await newCtx(browser, { storageState: st });
  await isolateHmr(ctx);
  const page = await newPage(ctx);
  await go(page, `/t/${shop.slug}/pages/${pageId}`);
  await page.getByRole("button", { name: /ตั้งค่าหน้า & SEO/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("#meta-title").fill(`QAB4 Draft ${r}`);
  await dlg.locator("#meta-slug").fill(renamed);
  await dlg.locator("#seo-title").fill(`QAB4-SEO-DRAFT-${r}`);
  await dlg.locator("#seo-desc").fill(`QAB4-DESC-DRAFT-${r}`);
  await dlg.getByRole("switch").last().click(); // noindex
  check("B2-01 dialog explains publish-only", (await dlg.innerText()).includes("หน้าร้านจะเปลี่ยนเมื่อกด “เผยแพร่”"));
  const t1 = await toast(page, /บันทึกฉบับร่างแล้ว/, () => dlg.getByRole("button", { name: /บันทึกร่าง/ }).click());
  check("B2-01 draft save toast says storefront unchanged", /ยังแสดงฉบับที่เผยแพร่/.test(t1), t1);
  const [db1] = await tt(shop.id, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.id, pageId))));
  check("B2-01 live columns unchanged after draft save", db1!.slug === slug && db1!.title === `QAB4 Live ${r}` && (db1!.seo as { title?: string }).title === `QAB4-SEO-LIVE-${r}` && !(db1!.seo as { noindex?: boolean }).noindex, { slug: db1!.slug, title: db1!.title, seo: db1!.seo });
  check("B2-01 draft_meta holds the edit", db1!.draftMeta?.slug === renamed && db1!.draftMeta?.seo.noindex === true && db1!.draftMeta?.title === `QAB4 Draft ${r}`, db1!.draftMeta);
  const sOld = await store(`/${slug}`);
  const sNew = await store(`/${renamed}`);
  // (robots is not asserted on the storefront: this trial tenant is "noindex, nofollow" site-wide; noindex is checked in the DB)
  check("B2-01 storefront keeps old URL + old <title>", sOld.status === 200 && !!sOld.title?.includes(`QAB4-SEO-LIVE-${r}`), sOld);
  check("B2-01 draft slug not live", sNew.status === 404, sNew);
  await page.keyboard.press("Escape").catch(() => {});
  const head = await page.locator("main").innerText();
  check("B2-01 editor flags unpublished edits", head.includes(`หน้าร้านยังใช้ /${slug}`) && head.includes("มีการแก้ไขที่ยังไม่เผยแพร่"), head.slice(0, 300));
  await page.screenshot({ path: shot("b4-editor-draft-1440") });

  // reload: editor shows the draft meta
  await go(page, `/t/${shop.slug}/pages/${pageId}`);
  await page.getByRole("button", { name: /ตั้งค่าหน้า & SEO/ }).click();
  check("B2-01 reload shows draft values", (await page.locator("#meta-slug").inputValue()) === renamed && (await page.locator("#seo-title").inputValue()) === `QAB4-SEO-DRAFT-${r}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("RESPONSIVE_B2-11 SEO dialog returns focus to its opener", await page.evaluate(() => document.activeElement?.textContent?.includes("ตั้งค่าหน้า & SEO") ?? false), await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));

  // ADMIN_B2-02 preview
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 60_000 }), page.getByRole("button", { name: /ดูตัวอย่าง/ }).click()]);
  await popup.waitForURL(/\/preview\?token=/, { timeout: 60_000 }).catch(() => {});
  const purl = new URL(popup.url());
  const tokenCheck = verifyPreviewToken(purl.searchParams.get("token"), { expectedTenantId: shop.id });
  check("B2-02 preview opens storefront /preview?token=", purl.host === `${shop.slug}.localhost:3000` && purl.pathname === "/preview", popup.url().slice(0, 90));
  check("B2-02 token is signed for this page + tenant", tokenCheck.ok && tokenCheck.pageId === pageId, tokenCheck);
  const prevStatus = (await hreq(`${shop.slug}.localhost:3000`, `${purl.pathname}${purl.search}`)).status;
  console.log(`INFO storefront preview route status ${prevStatus} (apps/web follow-up: 200 + draft once implemented)`);
  await popup.close();

  // publish
  await toast(page, /เผยแพร่แล้ว/, () => page.getByRole("button", { name: /^เผยแพร่$/ }).click());
  const [db2] = await tt(shop.id, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.id, pageId))));
  check("B2-01 publish moves meta live", db2!.slug === renamed && db2!.title === `QAB4 Draft ${r}` && (db2!.seo as { noindex?: boolean }).noindex === true && db2!.draftMeta === null, { slug: db2!.slug, seo: db2!.seo, draftMeta: db2!.draftMeta });
  const pNew = await store(`/${renamed}`);
  const pOld = await store(`/${slug}`);
  check("B2-01 storefront after publish: new URL + new <title>", pNew.status === 200 && !!pNew.title?.includes(`QAB4-SEO-DRAFT-${r}`), pNew);
  check("B2-01 storefront after publish: old URL gone", pOld.status === 404, pOld);

  // ADMIN_B2-03 reserved slugs per enabled module
  const tryCreate = async (tenantSlug: string, s: string) => {
    await go(page, `/t/${tenantSlug}/pages`);
    await page.getByRole("button", { name: /สร้างหน้าใหม่/ }).first().click();
    await page.locator("#np-title").fill(`QAB4 ${s} ${r}`);
    await page.locator("#np-slug").fill(s);
    await page.locator("#np-slug").blur();
    const before = page.url();
    const t = await toast(page, /สงวน|สร้างหน้าแล้ว|มีหน้า/, () => page.getByRole("dialog").locator('button[type="submit"]').click()).catch((e) => String(e.message).slice(0, 120));
    await page.waitForTimeout(1500);
    return { toast: t, navigated: page.url() !== before && /\/pages\/[0-9a-f-]{36}$/.test(page.url()), url: page.url() };
  };
  const salon = await tryCreate(T("salon").slug, "staff");
  check("B2-03 'staff' refused on booking tenant", /สงวน/.test(salon.toast) && !salon.navigated, salon);
  const clinic = await tryCreate(T("clinic").slug, "packages");
  check("B2-03 'packages' refused on clinic tenant", /สงวน/.test(clinic.toast) && !clinic.navigated, clinic);
  // the corporate template already ships a /services CMS page (module routes fall back to CMS pages when the module is off)
  const corp = await tryCreate(T("corporate").slug, "staff");
  check("B2-03 'staff' allowed on cms-only tenant", corp.navigated, corp);
  if (corp.navigated) created.push({ tenant: T("corporate").id, id: corp.url.split("/").pop()! });
  await ctx.close();
} finally {
  await browser.close();
  for (const p of created) await tt(p.tenant, (tx) => tx.delete(pages).where(and(eq(pages.tenantId, p.tenant), eq(pages.id, p.id))));
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
