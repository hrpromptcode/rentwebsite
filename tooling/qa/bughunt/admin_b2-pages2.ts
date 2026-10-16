import { and, eq, inArray, like, pages } from "@rentweb/db";
import { adminState, anyToast, done, go, launch, newCtx, newPage, out, sget, tenantIdOf, tt } from "./admin_b2-lib";

const SLUG = process.argv[2] ?? "demo-shop";
const PAGE_ID = process.argv[3]!;
async function main() {
  const tid = await tenantIdOf(SLUG);
  const [row] = await tt(tid, (tx) => tx.select().from(pages).where(and(eq(pages.tenantId, tid), eq(pages.id, PAGE_ID))));
  const slug0 = row!.slug;
  out("published order", (row!.publishedSections as any[]).slice(0, 3).map((s) => s.type + (s.hidden ? "(hidden)" : "")));
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  await go(page, `/t/${SLUG}/pages/${PAGE_ID}`);
  // (b) rename slug in DRAFT only
  const newSlug = `${slug0}-renamed`;
  await page.getByRole("button", { name: "ตั้งค่าหน้า & SEO" }).click();
  await page.fill("#meta-slug", newSlug);
  const t1 = await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click());
  await page.waitForTimeout(1500);
  const a = await sget(SLUG, `/${slug0}`);
  const b = await sget(SLUG, `/${newSlug}`);
  out("after draft-only slug rename", { toast: t1, oldUrl: a.status, newUrl: b.status });
  // (f) noindex + og image (draft save)
  await page.getByRole("button", { name: "ตั้งค่าหน้า & SEO" }).click();
  await page.getByRole("dialog").getByRole("switch").last().click();
  await page.fill("#seo-og", "https://example.com/og.png");
  await anyToast(page, () => page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click());
  await page.waitForTimeout(1000);
  const c = await sget(SLUG, `/${newSlug}`);
  out("noindex/og on storefront", { robots: c.body.match(/<meta name="robots" content="([^"]*)"/)?.[1], og: c.body.match(/<meta property="og:image" content="([^"]*)"/)?.[1] });
  const sm = await sget(SLUG, `/sitemap.xml`);
  out("sitemap contains noindex page", sm.body.includes(newSlug));
  // (e) delete a section (spacer) then save
  await page.locator("ol.divide-y > li button", { hasText: "เว้นระยะ" }).first().click();
  await page.getByRole("button", { name: "ลบเซ็กชัน" }).click();
  const t2 = await anyToast(page, () => page.getByRole("button", { name: "บันทึกร่าง" }).first().click());
  const [r2] = await tt(tid, (tx) => tx.select().from(pages).where(eq(pages.id, PAGE_ID)));
  out("after section delete", { toast: t2, n: (r2!.sections as any[]).length, hasSpacer: (r2!.sections as any[]).some((s) => s.type === "spacer") });
  // (c) unpublish
  await page.getByRole("button", { name: "เพิ่มเติม" }).click();
  const t3 = await anyToast(page, () => page.getByRole("menuitem", { name: /ซ่อนจากหน้าร้าน/ }).click());
  await page.waitForTimeout(1500);
  const d = await sget(SLUG, `/${newSlug}`);
  out("after unpublish", { toast: t3, storefront: d.status });
  // (d) delete page
  await page.getByRole("button", { name: "เพิ่มเติม" }).click();
  await Promise.all([page.waitForURL(/\/pages$/, { timeout: 60_000 }).catch(() => {}), page.getByRole("menuitem", { name: /ลบหน้านี้/ }).click()]);
  await page.waitForTimeout(1500);
  const [r3] = await tt(tid, (tx) => tx.select({ id: pages.id }).from(pages).where(eq(pages.id, PAGE_ID)));
  out("after delete", { url: page.url(), dbRow: !!r3 });
  // delete leftover reserved-slug probe pages through the UI as well
  const left = await tt(tid, (tx) => tx.select({ id: pages.id, slug: pages.slug }).from(pages).where(and(eq(pages.tenantId, tid), inArray(pages.slug, ["staff", "packages", "uploads", "sitemap-xml", "robots-txt"]))));
  out("leftover probe pages", left.map((l) => l.slug));
  for (const l of left) {
    if (l.slug === "uploads") continue; // keep for storefront check
    await go(page, `/t/${SLUG}/pages/${l.id}`);
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    await Promise.all([page.waitForURL(/\/pages$/, { timeout: 60_000 }).catch(() => {}), page.getByRole("menuitem", { name: /ลบหน้านี้/ }).click()]);
  }
  out("admin errors", page.__errors.slice(0, 6));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
