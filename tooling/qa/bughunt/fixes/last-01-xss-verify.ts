/**
 * last-01 verify: stored XSS through the product description is gone end to end. Temporarily stores hostile
 * descriptions on demo-shop's "wide-pants" (straight into the DB, i.e. bypassing the admin's write-time sanitize),
 * renders the real SSR product page and checks that nothing executes and the markup stays contained; the original
 * description is restored afterwards. Also checks the sanitizer output in a bare SSR-equivalent document.
 * Run: cd tooling && npx tsx qa/bughunt/fixes/last-01-xss-verify.ts
 */
import "../../../load-env";
import { chromium } from "@playwright/test";
import { getAdminDb, sql, withPlatform } from "@rentweb/db";
import { sanitizeHtml } from "../../../../packages/modules/commerce/src/lib/sanitize";
import { isolateHmr, stableGoto } from "./_dev-stable";

const SLUG = "wide-pants";
const URL_ = `http://demo-shop.localhost:3000/products/${SLUG}`;
let pass = 0;
let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  ok ? pass++ : fail++;
};

const PAYLOADS = [
  "<p>ok</p><img src=x onerror=window.__x=1 x=",
  "<p>a</p><svg/onload=window.__x=2><p>b</p>",
  '<a href="jav&#x09;ascript:window.__x=3">click</a><img src=x onerror=window.__x=4>',
  "<p title=\"&quot;><img src=x onerror=window.__x=5>\">t</p><iframe srcdoc=\"<script>parent.__x=6</script>\"></iframe>",
  "<style>*{}</style><script>window.__x=7</script><p>after</p>",
  '<!--><img src=x onerror=window.__x=8>--><a href="https://evil.example/">never closed',
];

async function main() {
  const db = getAdminDb();
  const rows = (await withPlatform(db, (tx) =>
    tx.execute(sql`select p.id, p.description from products p join tenants t on t.id = p.tenant_id where t.slug = 'demo-shop' and p.slug = ${SLUG}`),
  )) as unknown as { rows?: Array<{ id: string; description: string | null }> } & Array<{ id: string; description: string | null }>;
  const row = (rows.rows ?? rows)[0];
  if (!row) throw new Error(`product ${SLUG} not found on demo-shop`);
  const original = row.description;

  const b = await chromium.launch();
  try {
    // 1) sanitizer output in the markup SSR emits (div wrapper followed by more page content)
    for (const [i, p] of PAYLOADS.entries()) {
      const page = await b.newPage();
      let dialog = false;
      page.on("dialog", (d) => ((dialog = true), d.dismiss()));
      await page.setContent(`<!doctype html><html><body><div class="prose">${sanitizeHtml(p)}</div><p id="after">after</p></body></html>`, { waitUntil: "load" });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({
        x: (window as unknown as { __x?: number }).__x ?? 0,
        afterInLink: !!document.querySelector("a #after, a > #after"),
        bad: document.querySelectorAll("img,svg,script:not([src]),iframe,style").length,
      }));
      check(!r.x && !dialog && !r.afterInLink && r.bad === 0, `ssr-equivalent payload ${i + 1}: no execution, no foreign elements, nothing wraps the rest (x=${r.x} bad=${r.bad})`);
      await page.close();
    }

    // 2) the real storefront page with each payload stored raw in the DB
    const ctx = await b.newContext();
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    let dialogs = 0;
    page.on("dialog", (d) => (dialogs++, d.dismiss()));
    for (const [i, p] of PAYLOADS.entries()) {
      await withPlatform(db, (tx) => tx.execute(sql`update products set description = ${p} where id = ${row.id}`));
      const res = await stableGoto(page, URL_, "load");
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const box = document.querySelector("div.mt-4.leading-relaxed");
        return {
          x: (window as unknown as { __x?: number }).__x ?? 0,
          bad: box ? box.querySelectorAll("img,svg,script,iframe,style").length : -1,
          evilLinks: document.querySelectorAll('a[href="https://evil.example/"]').length,
          evilWrapsReviews: !!document.querySelector('a[href="https://evil.example/"] h2'),
          boxHtml: box?.innerHTML.slice(0, 160) ?? "",
        };
      });
      check(res?.status() === 200 && !r.x && r.bad === 0 && !r.evilWrapsReviews && r.evilLinks <= 1, `live ${URL_} payload ${i + 1}: status ${res?.status()}, no execution, description box clean (bad=${r.bad}) -> ${JSON.stringify(r.boxHtml)}`);
    }
    check(dialogs === 0, `no dialogs opened on the live page (${dialogs})`);
    await ctx.close();
  } finally {
    await withPlatform(db, (tx) => tx.execute(sql`update products set description = ${original} where id = ${row.id}`));
    console.log("restored original description");
    await b.close();
    await (db as unknown as { $client?: { end?: (o: unknown) => Promise<void> } }).$client?.end?.({ timeout: 2 });
  }
  console.log(`${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
