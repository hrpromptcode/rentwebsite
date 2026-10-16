import "../../load-env";
import { chromium, type Page } from "@playwright/test";
import { and, eq, getDb, gt, products, tenants, withPlatform } from "@rentweb/db";

/** responsive_a11y: focus-visible audit on stateful pages (checkout with item, product page, booking wizard). Element + its label/card are compared focused vs blurred. */
const STYLE = `(el) => { const t = [el, el.closest('label'), el.parentElement].filter(Boolean); return t.map(n => { const cs = getComputedStyle(n); return [cs.outlineStyle, cs.outlineWidth, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|'); }).join('#'); }`;

async function audit(page: Page, label: string, max = 60) {
  const order: { idx: string; desc: string; s: string }[] = [];
  await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
    const r = (await page.evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return null; if (!a.dataset.kbd) a.dataset.kbd = String(${i}); const rect = a.getBoundingClientRect(); return { idx: a.dataset.kbd, desc: a.tagName.toLowerCase() + (a.type ? '[' + a.type + ']' : '') + ' ' + (a.getAttribute('aria-label') || (a.closest('label') || a).textContent || '').replace(/[\\n\\t ]+/g, ' ').trim().slice(0, 30) + ' [' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ']', s: (${STYLE})(a) }; })()`)) as { idx: string; desc: string; s: string } | null;
    if (!r || order.some((o) => o.idx === r.idx)) break;
    order.push(r);
  }
  await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await page.waitForTimeout(150);
  const none: string[] = [];
  for (const o of order) {
    const base = await page.evaluate(`(() => { const el = document.querySelector('[data-kbd="${o.idx}"]'); return el ? (${STYLE})(el) : null; })()`);
    if (base === o.s && !/nextjs-portal/.test(o.desc)) none.push(o.desc);
  }
  console.log(`[${label}] ${order.length} stops, NO focus indicator on ${none.length}: ${none.join(" ;; ")}`);
}

async function main() {
  const db = getDb();
  const prod = await withPlatform(db, (tx) => tx.select({ id: products.id, slug: products.slug }).from(products).innerJoin(tenants, eq(tenants.id, products.tenantId)).where(and(eq(tenants.slug, "demo-shop"), eq(products.status, "active"), eq(products.hasVariants, false), gt(products.stock, 5))));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const S = "http://demo-shop.localhost:3000";
  await page.goto(S + "/products/" + prod[0]!.slug, { waitUntil: "networkidle" });
  await page.evaluate(async (pid) => (await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: pid, quantity: 1 }) })).status, prod[0]!.id);
  await audit(page, "shop product");
  await page.goto(S + "/checkout", { waitUntil: "networkidle" });
  await audit(page, "shop checkout", 80);
  await page.goto(S + "/products", { waitUntil: "networkidle" });
  await audit(page, "shop products list", 40);
  for (const [slug, route] of [["demo-salon", "/book"], ["demo-restaurant", "/reserve"], ["demo-clinic", "/contact"], ["demo-cafe", "/account/login"]]) {
    await page.goto(`http://${slug}.localhost:3000${route}`, { waitUntil: "networkidle" });
    await audit(page, `${slug} ${route}`, 60);
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
