import "../../../load-env";
import { request } from "node:http";
import { getDb, withPlatform, sql } from "@rentweb/db";
/**
 * web_visual SS-07 + SS-08 + SS-10 (tenant-site SEO). Plain HTTP against the running dev server. Prints PASS/FAIL.
 *  SS-07  CMS pages keep a meta description + og:title/og:description (site defaults when the page has none) and have exactly one <h1>
 *  SS-08  sitemap <loc> values are ASCII (percent-encoded), commerce tenants list /collections, every URL answers 200,
 *         a page with seo.noindex is left out (temporarily flips demo-corporate "careers", then restores it)
 *  SS-10  every page links an icon (<link rel="icon">)
 *   pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/SS-07-08-10-verify.ts
 */
let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
/** GET via 127.0.0.1 with the tenant Host header (Node on Windows cannot resolve *.localhost). */
const get = (url: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const u = new URL(url);
    const req = request({ host: "127.0.0.1", port: Number(u.port || 80), path: u.pathname + u.search, headers: { host: u.host }, timeout: 120_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
const meta = (html: string, attr: "name" | "property", key: string) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? null;

const CMS_PAGES = ["demo-corporate/about", "demo-corporate/contact", "demo-corporate/privacy", "demo-corporate/terms", "demo-corporate/work", "demo-corporate/careers", "demo-shop/about", "demo-shop/privacy", "demo-cafe/contact"];

async function main() {
  for (const target of ["demo-shop/", "demo-corporate/", ...CMS_PAGES]) {
    const [slug, ...rest] = target.split("/");
    const { status, body } = await get(`http://${slug}.localhost:3000/${rest.join("/")}`);
    const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
    const desc = meta(body, "name", "description");
    const ogTitle = meta(body, "property", "og:title");
    const ogDesc = meta(body, "property", "og:description");
    const icon = /<link rel="icon"/.test(body);
    const title = body.match(/<title>([^<]*)<\/title>/)?.[1];
    check(status === 200 && !!desc && !!ogTitle && !!ogDesc && h1 === 1 && icon, `SS-07/SS-10 ${target} ${status} title="${title}" desc=${desc ? "yes" : "NO"} og:title="${ogTitle}" og:desc=${ogDesc ? "yes" : "NO"} h1=${h1} icon=${icon}`);
  }

  const db = getDb();
  const flip = async (noindex: boolean | null) =>
    withPlatform(db, (tx) =>
      tx.execute(
        noindex === null
          ? sql`update pages set seo = seo - 'noindex' where slug = 'careers' and tenant_id = (select id from tenants where slug = 'demo-corporate')`
          : sql`update pages set seo = seo || ${JSON.stringify({ noindex })}::jsonb where slug = 'careers' and tenant_id = (select id from tenants where slug = 'demo-corporate')`,
      ),
    );
  const before = (await withPlatform(db, (tx) => tx.execute(sql`select seo from pages where slug = 'careers' and tenant_id = (select id from tenants where slug = 'demo-corporate')`))) as unknown as { rows?: { seo: Record<string, unknown> }[] } | { seo: Record<string, unknown> }[];
  const beforeSeo = (Array.isArray(before) ? before : before.rows ?? [])[0]?.seo ?? {};
  try {
    for (const slug of ["demo-shop", "demo-cafe", "demo-clinic", "demo-salon", "demo-restaurant", "demo-corporate"]) {
      const { status, body } = await get(`http://${slug}.localhost:3000/sitemap.xml`);
      const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
      const nonAscii = locs.filter((l) => /[^\x00-\x7F]/.test(l));
      const dup = locs.length - new Set(locs).size;
      const collections = locs.filter((l) => l.includes("/collections")).length;
      const statuses: { l: string; s: number }[] = [];
      for (const l of locs) statuses.push({ l, s: (await get(l.replace(/&amp;/g, "&"))).status });
      const broken = statuses.filter((x) => x.s !== 200);
      const commerce = slug === "demo-shop" || slug === "demo-cafe";
      check(status === 200 && locs.length > 1 && nonAscii.length === 0 && dup === 0 && (!commerce || collections > 1) && broken.length === 0, `SS-08 ${slug} sitemap ${status} urls=${locs.length} nonAscii=${nonAscii.length} dup=${dup} collections=${collections} broken=${JSON.stringify(broken.slice(0, 3))}`);
    }
    await flip(true);
    const sm = (await get(`http://demo-corporate.localhost:3000/sitemap.xml`)).body;
    const page = (await get(`http://demo-corporate.localhost:3000/careers`)).body;
    check(!sm.includes("/careers<") && /<meta name="robots" content="noindex/.test(page), `SS-08 noindex page excluded from sitemap=${!sm.includes("/careers<")} robots meta=${(page.match(/<meta name="robots" content="[^"]*"/) ?? ["none"])[0]}`);
  } finally {
    if ("noindex" in beforeSeo) await flip(beforeSeo.noindex as boolean);
    else await flip(null);
  }
  console.log(fails ? `FAIL ${fails}` : "PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
