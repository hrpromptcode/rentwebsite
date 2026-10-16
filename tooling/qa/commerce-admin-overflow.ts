import "../load-env";
import { chromium } from "@playwright/test";
import { desc, eq, getDb, orders, products, withTenant } from "@rentweb/db";
import { tenantIdBySlug } from "./stock";
/** Lists elements wider than a 390px viewport on commerce admin pages. Usage: tsx qa/commerce-admin-overflow.ts /orders/<id> /orders/new */
const admin = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const slug = process.env.QA_SLUG ?? "demo-shop";
const paths = process.argv.slice(2);
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${admin}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
  const tenantId = await tenantIdBySlug(slug);
  const latest = await withTenant(getDb(), tenantId, async (tx) => (await tx.select({ id: orders.id }).from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt)).limit(1))[0]?.id ?? "");
  const latestProduct = await withTenant(getDb(), tenantId, async (tx) => (await tx.select({ id: products.id }).from(products).where(eq(products.tenantId, tenantId)).orderBy(desc(products.createdAt)).limit(1))[0]?.id ?? "");
  for (const raw of paths) {
    const p = raw.replace(":latestOrder", latest).replace(":latestProduct", latestProduct);
    await page.goto(`${admin}/t/${slug}${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const rows: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && !el.closest("[data-nextjs-dialog-overlay],nextjs-portal")) {
          const kids = Array.from(el.children).some((c) => c.getBoundingClientRect().right > vw + 1);
          if (!kids) rows.push(`${Math.round(r.right)}px  <${el.tagName.toLowerCase()} class="${(el.className as string).toString().slice(0, 90)}"> ${(el.textContent ?? "").trim().slice(0, 30)}`);
        }
      }
      const widest = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.width > 0 && x.r.right > vw + 1)
        .sort((a, b) => b.r.right - a.r.right)
        .slice(0, 6)
        .map((x) => `${Math.round(x.r.left)}..${Math.round(x.r.right)}px w=${Math.round(x.r.width)} <${x.el.tagName.toLowerCase()} class="${(x.el.className as string).toString().slice(0, 100)}">`);
      const chain: string[] = [];
      let node: HTMLElement | null = (document.querySelector('table[class*="min-w-"]') as HTMLElement | null) ?? null;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        chain.push(`${Math.round(r.left)}..${Math.round(r.right)} w=${Math.round(r.width)} ox=${cs.overflowX} disp=${cs.display} minw=${cs.minWidth} <${node.tagName.toLowerCase()} class="${(node.className as string).toString().slice(0, 70)}">`);
        node = node.parentElement;
      }
      const exp: string[] = [];
      const tbl = document.querySelector<HTMLElement>('table[class*="min-w-"]');
      const wrap = tbl?.parentElement ?? null;
      exp.push(`baseline doc=${document.documentElement.scrollWidth} body=${document.body.scrollWidth}`);
      if (wrap) { const o = wrap.style.overflow; wrap.style.overflow = "hidden"; exp.push(`wrapper overflow:hidden → doc=${document.documentElement.scrollWidth}`); wrap.style.overflow = o; }
      if (tbl) { tbl.style.display = "none"; exp.push(`table hidden → doc=${document.documentElement.scrollWidth}`); tbl.style.display = ""; }
      if (wrap) { const o = wrap.style.margin; wrap.style.margin = "0"; exp.push(`wrapper margin:0 → doc=${document.documentElement.scrollWidth}`); wrap.style.margin = o; }
      return { scrollW: document.documentElement.scrollWidth, rows: [...widest, "-- deepest --", ...rows.slice(0, 8), "-- chain --", ...chain, "-- experiments --", ...exp] };
    });
    console.log(`\n== ${p} scrollWidth=${out.scrollW}`);
    for (const r of out.rows) console.log("  " + r);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
