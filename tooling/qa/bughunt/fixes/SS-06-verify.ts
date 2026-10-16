/** SS-06: corporate template must not link to the non-existent /blog route.
 *   cd tooling && npx tsx qa/bughunt/fixes/SS-06-verify.ts [--apply-demo]
 * --apply-demo brings the already-seeded demo-corporate in line with the fixed template (drops /blog nav items,
 * turns its sample posts into drafts so sitemap.xml stops listing 404 /blog/<slug> URLs). Prints PASS/FAIL. */
import "../../../load-env";
import http from "node:http";
import { and, eq, getAdminDb, navigation, posts, tenants, type NavItem } from "@rentweb/db";
import { getTemplate } from "@rentweb/templates";

let fail = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const get = (host: string, path: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: 3000, path, headers: { host } }, (res) => {
      const c: Buffer[] = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(c).toString("utf8") }));
    }).on("error", reject);
  });
const dropBlog = (items: NavItem[]): NavItem[] =>
  items.filter((i) => !(i.href === "/blog" || i.href?.startsWith("/blog/"))).map((i) => (i.children ? { ...i, children: dropBlog(i.children) } : i));

const corp = getTemplate("corporate")!;
check(!JSON.stringify(corp.navigation).includes("/blog"), "template navigation has no /blog");
check(!JSON.stringify(corp.pages).includes('"/blog'), "template pages have no /blog links");

const db = getAdminDb();
const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-corporate")).limit(1);
if (t && process.argv.includes("--apply-demo")) {
  const navs = await db.select().from(navigation).where(eq(navigation.tenantId, t.id));
  for (const n of navs) await db.update(navigation).set({ items: dropBlog(n.items as NavItem[]) }).where(eq(navigation.id, n.id));
  await db.update(posts).set({ status: "draft" }).where(and(eq(posts.tenantId, t.id), eq(posts.status, "published")));
  console.log("applied template fix to demo-corporate");
}
if (t) {
  const home = await get("demo-corporate.localhost:3000", "/");
  check(home.status === 200 && !/href="\/blog/.test(home.body), `demo-corporate home ${home.status}: no /blog links`);
  const sm = await get("demo-corporate.localhost:3000", "/sitemap.xml");
  check(sm.status === 200 && !sm.body.includes("/blog"), `demo-corporate sitemap.xml ${sm.status}: no /blog URLs`);
}
console.log(fail ? `FAIL ${fail} check(s)` : "PASS all");
process.exit(fail ? 1 : 0);
