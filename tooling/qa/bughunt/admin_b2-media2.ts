import { and, desc, eq, media, pages } from "@rentweb/db";
import { adminState, anyToast, done, go, hreq, launch, newCtx, newPage, out, rand, tenantIdOf, tt } from "./admin_b2-lib";
const SLUG = "demo-shop";
async function main() {
  const tid = await tenantIdOf(SLUG);
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  await go(page, `/t/${SLUG}/media`);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 120, height: 80 } });
  const pad = (n: number) => Buffer.concat([png, Buffer.alloc(n - png.length, 0)]);
  const count = async () => (await tt(tid, (tx) => tx.select({ id: media.id }).from(media).where(eq(media.tenantId, tid)))).length;
  for (const [label, files] of [["2 x 4 MB (8 MB total)", 2], ["3 x 4 MB (12 MB total)", 3]] as const) {
    const c0 = await count();
    const t = await anyToast(page, () => page.locator('input[type="file"]').setInputFiles(Array.from({ length: files }, (_, i) => ({ name: `qa-b2-4mb-${i}.png`, mimeType: "image/png", buffer: pad(4 * 1024 * 1024) }))), 90_000);
    out(label, { toast: t, added: (await count()) - c0 });
    await page.reload({ waitUntil: "networkidle" });
  }
  // in-use delete: newest small png
  const t2 = await anyToast(page, () => page.locator('input[type="file"]').setInputFiles({ name: "qa-b2-inuse.png", mimeType: "image/png", buffer: png }));
  const [m] = await tt(tid, (tx) => tx.select().from(media).where(eq(media.tenantId, tid)).orderBy(desc(media.createdAt)).limit(1));
  out("uploaded", { toast: t2, url: m!.url });
  // put it in a published page as hero image
  const r = rand();
  const sections = [{ id: "qab2img", type: "image-text", props: { heading: "QAB2 IMG", body: "x", image: { url: m!.url, alt: "qa" } } }];
  const [pg] = await tt(tid, (tx) => tx.insert(pages).values({ tenantId: tid, slug: `qa-b2-img-${r}`, title: "QA B2 img", kind: "page", status: "published", sections, publishedSections: sections, publishedAt: new Date(), seo: {} }).returning({ id: pages.id }));
  const s1 = await hreq(`${SLUG}.localhost:3000`, `/qa-b2-img-${r}`);
  const img1 = await hreq(`${SLUG}.localhost:3000`, m!.url);
  out("page uses image", { page: s1.status, refsImage: s1.body.includes(m!.url.split("/").pop()!), image: img1.status });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(`เปิด qa-b2-inuse`) }).first().click();
  const dlg = page.getByRole("dialog");
  out("detail dialog text", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 200));
  out("delete in-use", await anyToast(page, () => dlg.getByRole("button", { name: /ลบ/ }).first().click()));
  const img2 = await hreq(`${SLUG}.localhost:3000`, m!.url);
  const s2 = await hreq(`${SLUG}.localhost:3000`, `/qa-b2-img-${r}`);
  out("after delete", { image: img2.status, pageStillRefs: s2.body.includes(m!.url.split("/").pop()!) });
  await tt(tid, (tx) => tx.delete(pages).where(eq(pages.id, pg!.id)));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
