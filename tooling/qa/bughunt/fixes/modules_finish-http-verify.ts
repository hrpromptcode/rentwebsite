import "../../../load-env";
import { request } from "node:http";
import { getDb, withPlatform, sql } from "@rentweb/db";
/**
 * modules_finish packet — plain-HTTP checks against the running dev server (127.0.0.1 + Host header). Prints PASS/FAIL.
 *  SS-13  module index routes (/products /collections /cart /checkout /services /staff /book /packages /menu /order /reserve)
 *         take <title>/description/og from the CMS page with the same slug when the module is off; keep the module title when on
 *  SS-07  /collections/<slug> keeps a meta description + og:title + og:description (category's or the site default)
 *  SS-09  catalog: page past the last → redirect to the last page; unknown ?category= → 404; unknown /collections/<x> → 404
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/modules_finish-http-verify.ts
 */
let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const get = (url: string) =>
  new Promise<{ status: number; body: string; location: string | null }>((resolve, reject) => {
    const u = new URL(url);
    const req = request({ host: "127.0.0.1", port: Number(u.port || 80), path: u.pathname + u.search, headers: { host: u.host }, timeout: 180_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, location: (res.headers.location as string | undefined) ?? null }));
    });
    req.on("error", reject);
    req.end();
  });
/** dev server: retry a compile error / 500 twice (other agents edit files concurrently) */
async function fetchPage(url: string) {
  let r = await get(url);
  for (let i = 0; i < 2 && r.status >= 500; i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    r = await get(url);
  }
  return r;
}
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const titleOf = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
const meta = (html: string, attr: "name" | "property", key: string) => {
  const v = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];
  return v === undefined ? null : decode(v);
};
const rows = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];

/** module key + the module page's own title ("" = label-driven / needs state; not checked when the module is on) */
const ROUTES: Record<string, { module: string; title: string }> = {
  products: { module: "commerce", title: "" },
  collections: { module: "commerce", title: "" },
  cart: { module: "commerce", title: "" },
  checkout: { module: "commerce", title: "" },
  services: { module: "booking", title: "บริการทั้งหมด" },
  staff: { module: "booking", title: "ทีมผู้ให้บริการ" },
  book: { module: "booking", title: "จองคิว" },
  packages: { module: "clinic", title: "คอร์สและแพ็กเกจ" },
  menu: { module: "restaurant", title: "เมนู" },
  order: { module: "restaurant", title: "สั่งกลับบ้าน" },
  reserve: { module: "restaurant", title: "จองโต๊ะ" },
};
const TENANTS = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];

async function main() {
  const db = getDb();
  const mods = rows<{ slug: string; module_key: string }>(
    await withPlatform(db, (tx) => tx.execute(sql`select t.slug, m.module_key from tenant_modules m join tenants t on t.id = m.tenant_id where m.enabled and t.slug like 'demo-%'`)),
  );
  const pagesRows = rows<{ tslug: string; slug: string; title: string; seo: Record<string, unknown> | null }>(
    await withPlatform(db, (tx) => tx.execute(sql`select t.slug as tslug, p.slug, p.title, p.seo from pages p join tenants t on t.id = p.tenant_id where p.status = 'published' and t.slug like 'demo-%'`)),
  );
  const cats = rows<{ tslug: string; slug: string; name: string; description: string | null }>(
    await withPlatform(db, (tx) => tx.execute(sql`select t.slug as tslug, c.slug, c.name, c.description from categories c join tenants t on t.id = c.tenant_id where t.slug in ('demo-shop', 'demo-cafe')`)),
  );
  const on = (t: string, m: string) => mods.some((r) => r.slug === t && r.module_key === m);

  console.log("— SS-13 module routes vs CMS pages");
  let cmsCases = 0;
  for (const t of TENANTS) {
    for (const [slug, r] of Object.entries(ROUTES)) {
      const page = pagesRows.find((p) => p.tslug === t && p.slug === slug);
      const enabled = on(t, r.module);
      if (!enabled && !page) continue; // 404 — nothing to title
      if (enabled && !r.title) continue;
      const res = await fetchPage(`http://${t}.localhost:3000/${slug}`);
      if (res.status >= 300 && res.status < 400) continue;
      const title = titleOf(res.body);
      if (enabled) {
        check(res.status === 200 && title.startsWith(`${r.title} ·`), `${t}/${slug} (module on) → ${res.status} "${title}"`);
      } else {
        cmsCases++;
        const want = String((page!.seo ?? {}).title || page!.title);
        const desc = meta(res.body, "name", "description");
        const ogTitle = meta(res.body, "property", "og:title");
        check(
          res.status === 200 && (title === want || title.startsWith(`${want} ·`)) && !!desc && !!ogTitle?.startsWith(want),
          `${t}/${slug} (CMS page) → ${res.status} title "${title}" want "${want}", desc ${desc ? "yes" : "NO"}, og:title "${ogTitle}"`,
        );
      }
    }
  }
  const corp = await fetchPage("http://demo-corporate.localhost:3000/services");
  check(titleOf(corp.body).startsWith("บริการ ·"), `demo-corporate /services <title> "${titleOf(corp.body)}" (finding repro)`);
  check(cmsCases > 0, `${cmsCases} CMS-fallback route(s) checked`);
  const offNoPage = await fetchPage("http://demo-shop.localhost:3000/menu");
  check(offNoPage.status === 404, `demo-shop /menu (module off, no CMS page) → ${offNoPage.status}`);

  console.log("— SS-07 /collections/<slug>");
  for (const c of cats) {
    const res = await fetchPage(`http://${c.tslug}.localhost:3000/collections/${encodeURIComponent(c.slug)}`);
    const desc = meta(res.body, "name", "description");
    const ogTitle = meta(res.body, "property", "og:title");
    const ogDesc = meta(res.body, "property", "og:description");
    const okDesc = c.description ? desc === c.description : !!desc;
    check(
      res.status === 200 && titleOf(res.body).startsWith(c.name) && okDesc && !!ogTitle?.startsWith(c.name) && !!ogDesc,
      `${c.tslug}/collections/${c.slug} → ${res.status} desc "${(desc ?? "").slice(0, 40)}" og:title "${ogTitle}" og:desc ${ogDesc ? "yes" : "NO"}`,
    );
  }

  console.log("— SS-09 catalog edge cases");
  const p2 = await fetchPage("http://demo-shop.localhost:3000/products?page=2");
  check(p2.status >= 300 && p2.status < 400 && !/page=2/.test(p2.location ?? ""), `demo-shop /products?page=2 → ${p2.status} ${p2.location}`);
  const firstCat = cats.find((c) => c.tslug === "demo-shop")!;
  const c5 = await fetchPage(`http://demo-shop.localhost:3000/collections/${encodeURIComponent(firstCat.slug)}?page=5`);
  check(c5.status >= 300 && c5.status < 400 && !/page=5/.test(c5.location ?? ""), `demo-shop /collections/${firstCat.slug}?page=5 → ${c5.status} ${c5.location}`);
  const bogus = await fetchPage("http://demo-shop.localhost:3000/products?category=bogus-zz");
  check(bogus.status === 404 && !bogus.body.includes("ยังไม่มีสินค้าในร้าน"), `demo-shop /products?category=bogus-zz → ${bogus.status}`);
  const bogusCol = await fetchPage("http://demo-shop.localhost:3000/collections/bogus-zz");
  check(bogusCol.status === 404, `demo-shop /collections/bogus-zz → ${bogusCol.status}`);
  const noHit = await fetchPage("http://demo-shop.localhost:3000/products?q=zzzzqqq");
  check(noHit.status === 200 && noHit.body.includes("ไม่พบสินค้าที่ตรงกับเงื่อนไข") && !noHit.body.includes("ยังไม่มีสินค้าในร้าน"), `demo-shop /products?q=zzzzqqq → ${noHit.status}, filtered empty state`);

  console.log(fails ? `FAIL (${fails})` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  console.log("FAIL (error)");
  process.exit(1);
});
