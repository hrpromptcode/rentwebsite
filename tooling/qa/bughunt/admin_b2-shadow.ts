import { and, eq, pages } from "@rentweb/db";
import { done, out, sget, tenantIdOf, tt } from "./admin_b2-lib";
async function main() {
  const cases: Array<[string, string]> = [["demo-shop", "uploads"], ["demo-salon", "staff"], ["demo-clinic", "packages"]];
  for (const [slug, ps] of cases) {
    const tid = await tenantIdOf(slug);
    const marker = `QAB2-SHADOW-${ps}`;
    const sections = [{ id: "qab2shadow", type: "text", props: { eyebrow: "", heading: marker, body: marker, align: "left", size: "normal" } }];
    const [ex] = await tt(tid, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, tid), eq(pages.slug, ps))));
    if (ex) await tt(tid, (tx) => tx.update(pages).set({ status: "published", sections, publishedSections: sections, publishedAt: new Date() }).where(eq(pages.id, ex.id)));
    else await tt(tid, (tx) => tx.insert(pages).values({ tenantId: tid, slug: ps, title: `QA B2 ${ps}`, kind: "page", status: "published", sections, publishedSections: sections, publishedAt: new Date(), seo: {} }));
    const r = await sget(slug, `/${ps}`);
    out(`${slug} /${ps} with published CMS page`, { status: r.status, showsCms: r.body.includes(marker), title: r.body.match(/<title>([^<]*)<\/title>/)?.[1] });
    // cleanup: delete the probe page
    await tt(tid, (tx) => tx.delete(pages).where(and(eq(pages.tenantId, tid), eq(pages.slug, ps))));
  }
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
