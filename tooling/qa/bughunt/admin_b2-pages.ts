import { and, eq, pages } from "@rentweb/db";
import { ADMIN, adminState, anyToast, done, go, launch, newCtx, newPage, out, rand, sget, shot, tenantIdOf, toast, tt } from "./admin_b2-lib";

const SLUG = process.argv[2] ?? "demo-shop";
async function main() {
  const tid = await tenantIdOf(SLUG);
  const r = rand();
  const pslug = `qa-b2-${r}`;
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  await go(page, `/t/${SLUG}/pages`);
  // create page
  await page.getByRole("button", { name: /สร้างหน้าใหม่|หน้าใหม่|สร้างหน้า/ }).first().click();
  await page.fill("#np-title", `QA B2 หน้า ${r}`);
  await page.fill("#np-slug", pslug);
  await Promise.all([page.waitForURL(/\/pages\/[0-9a-f-]{36}$/, { timeout: 90_000 }), page.getByRole("button", { name: "สร้างหน้า" }).last().click()]);
  await page.waitForLoadState("networkidle");
  const pageId = page.url().split("/").pop()!;
  out("created", { pslug, pageId });

  // add every section type
  await page.getByRole("button", { name: "เพิ่มเซ็กชัน" }).first().click();
  const dlg = page.getByRole("dialog");
  const names = (await dlg.locator("button.flex.min-h-14 span.block.truncate.text-sm").allInnerTexts());
  out("available section types", names);
  await page.keyboard.press("Escape");
  for (const n of names) {
    await page.getByRole("button", { name: "เพิ่มเซ็กชัน" }).first().click();
    await page.getByRole("dialog").locator("button.flex.min-h-14", { hasText: n }).first().click();
    await page.waitForTimeout(150);
  }
  const listCount = await page.locator("ol.divide-y > li").count();
  out("sections in list", listCount);
  // edit: text section body + hero heading
  await page.locator("ol.divide-y > li button", { hasText: "ข้อความ" }).first().click();
  await page.fill("#f-heading", `QAB2-TEXT-H-${r}`);
  await page.fill("#f-body", `QAB2-TEXT-BODY-${r}`);
  await page.locator("ol.divide-y > li button", { hasText: "ฮีโร่" }).first().click();
  await page.fill("#f-heading", `QAB2-HERO-${r}`);
  const t1 = await anyToast(page, () => page.getByRole("button", { name: "บันทึกร่าง" }).first().click());
  out("save draft toast", t1);
  const row1 = await tt(tid, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, tid), eq(pages.id, pageId))));
  out("db after draft", { status: row1[0]?.status, n: (row1[0]?.sections as any[])?.length, types: (row1[0]?.sections as any[])?.map((s) => s.type), published: (row1[0]?.publishedSections as any[] | null)?.length ?? null });
  const s1 = await sget(SLUG, `/${pslug}`);
  out("storefront while draft", { status: s1.status, hasMarker: s1.body.includes(`QAB2-HERO-${r}`) });

  // preview button target
  const prevHref = await page.getByRole("link", { name: "ดูตัวอย่าง" }).getAttribute("href");
  out("preview href", prevHref);

  // publish
  const t2 = await anyToast(page, () => page.getByRole("button", { name: "เผยแพร่" }).first().click());
  out("publish toast", t2);
  await page.waitForTimeout(1500);
  const s2 = await sget(SLUG, `/${pslug}`);
  out("storefront after publish", { status: s2.status, hero: s2.body.includes(`QAB2-HERO-${r}`), text: s2.body.includes(`QAB2-TEXT-BODY-${r}`), devMissing: (s2.body.match(/ยังไม่มีคอมโพเนนต์แสดงผล/g) ?? []).length, errs: (s2.body.match(/Error|ข้อผิดพลาด/g) ?? []).length });
  const sp = await browser.newPage();
  await sp.route(/_next\/(webpack-hmr|hmr)/, (rr) => rr.abort());
  const perr: string[] = [];
  sp.on("pageerror", (e) => perr.push(e.message.slice(0, 160)));
  sp.on("console", (m) => { if (m.type() === "error") perr.push("console: " + m.text().slice(0, 160)); });
  await sp.goto(`http://${SLUG}.localhost:3000/${pslug}`, { waitUntil: "networkidle", timeout: 120_000 });
  await sp.screenshot({ path: shot(`pages-all-${SLUG}`), fullPage: true });
  out("storefront browser errors", perr.slice(0, 8));

  // draft edit after publish -> storefront must keep published content
  await page.locator("ol.divide-y > li button", { hasText: "ฮีโร่" }).first().click();
  await page.fill("#f-heading", `QAB2-HERO2-${r}`);
  // hide text section
  const textLi = page.locator("ol.divide-y > li", { hasText: "ข้อความ" }).first();
  await textLi.getByRole("button", { name: "ซ่อน" }).click();
  // move hero down one
  const heroLi = page.locator("ol.divide-y > li", { hasText: "ฮีโร่" }).first();
  await heroLi.getByRole("button", { name: "เลื่อนลง" }).click();
  // SEO + title change in draft
  await page.getByRole("button", { name: "ตั้งค่าหน้า & SEO" }).click();
  await page.fill("#meta-title", `QA B2 DRAFT TITLE ${r}`);
  await page.fill("#seo-title", `QAB2-SEO-TITLE-${r}`);
  await page.fill("#seo-desc", `QAB2-SEO-DESC-${r}`);
  const t3 = await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click());
  out("seo save (draft) toast", t3);
  await page.waitForTimeout(1500);
  const s3 = await sget(SLUG, `/${pslug}`);
  const title3 = s3.body.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc3 = s3.body.match(/<meta name="description" content="([^"]*)"/)?.[1];
  out("storefront after DRAFT save (expect old content)", { status: s3.status, hero1: s3.body.includes(`QAB2-HERO-${r}`), hero2: s3.body.includes(`QAB2-HERO2-${r}`), textVisible: s3.body.includes(`QAB2-TEXT-BODY-${r}`), title: title3, desc: desc3 });
  // publish again
  const t4 = await anyToast(page, () => page.getByRole("button", { name: "เผยแพร่" }).first().click());
  out("publish2 toast", t4);
  await page.waitForTimeout(1500);
  const s4 = await sget(SLUG, `/${pslug}`);
  const i1 = s4.body.indexOf(`QAB2-HERO2-${r}`);
  out("storefront after publish2", { status: s4.status, hero2: i1 >= 0, textHidden: !s4.body.includes(`QAB2-TEXT-BODY-${r}`), title: s4.body.match(/<title>([^<]*)<\/title>/)?.[1], desc: s4.body.match(/<meta name="description" content="([^"]*)"/)?.[1], robots: s4.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] });

  // slug conflict: create page with same slug
  await go(page, `/t/${SLUG}/pages`);
  await page.getByRole("button", { name: /สร้างหน้าใหม่|หน้าใหม่|สร้างหน้า/ }).first().click();
  await page.fill("#np-title", `QA B2 dup ${r}`);
  await page.fill("#np-slug", pslug);
  const t5 = await anyToast(page, () => page.getByRole("button", { name: "สร้างหน้า" }).last().click());
  out("dup slug create toast", t5);
  await page.keyboard.press("Escape");
  // reserved slug
  for (const rs of (process.argv[3] === "noreserved" ? [] : ["checkout", "staff", "packages", "account", "uploads", "sitemap-xml", "robots-txt"])) {
    await go(page, `/t/${SLUG}/pages`);
    await page.getByRole("button", { name: /สร้างหน้าใหม่|หน้าใหม่|สร้างหน้า/ }).first().click();
    await page.fill("#np-title", `QA B2 ${rs} ${r}`);
    await page.fill("#np-slug", rs);
    const before = page.url();
    const tt5 = await anyToast(page, () => page.getByRole("button", { name: "สร้างหน้า" }).last().click(), 15_000);
    await page.waitForTimeout(2000);
    out(`reserved slug '${rs}'`, { toast: tt5, navigated: page.url() !== before ? page.url() : "no" });
  }
  out("console errors (admin)", page.__errors.slice(0, 10));
  out("pageId", pageId);
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
