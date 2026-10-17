/**
 * ADMIN_B2-10 LINE links (web_final packet): one helper (`lineChat`, packages/storefront/src/line.ts) used by the floating
 * chat button, the footer LINE icon and the contact section.
 * Unit: "@oa" → line.me/R/ti/p/%40oa, personal "somchai.k" → line.me/ti/p/~somchai.k, full LINE URLs kept, junk → no link.
 * Live: sets the trial shop's settings.contact.lineId to a personal id / an @OA / a full URL (restored afterwards), with a
 * temporary page holding a contact section, and reads the three hrefs on the storefront at 390 and 1440.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-10-verify.ts
 */
import { and, eq, pages, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { lineChat } from "../../../../packages/storefront/src/line";
import { done, launch, newCtx, rand, readCreds, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};

// ---- unit
const cases: Array<[{ lineId?: string; lineUrl?: string }, string | null, string | null]> = [
  [{ lineId: "@shop" }, "https://line.me/R/ti/p/%40shop", "@shop"],
  [{ lineId: " @shop " }, "https://line.me/R/ti/p/%40shop", "@shop"],
  [{ lineId: "qab2plain" }, "https://line.me/ti/p/~qab2plain", "qab2plain"],
  [{ lineId: "somchai.k_99" }, "https://line.me/ti/p/~somchai.k_99", "somchai.k_99"],
  [{ lineId: "~somchai" }, "https://line.me/ti/p/~somchai", "somchai"],
  [{ lineId: "https://line.me/R/ti/p/@abc" }, "https://line.me/R/ti/p/@abc", "@abc"],
  [{ lineId: "http://line.me/ti/p/~abc" }, "https://line.me/ti/p/~abc", "abc"],
  [{ lineId: "https://lin.ee/xYz123" }, "https://lin.ee/xYz123", "LINE"],
  [{ lineId: "https://page.line.me/shop" }, "https://page.line.me/shop", "LINE"],
  [{ lineId: "line://ti/p/@abc" }, "line://ti/p/@abc", "@abc"],
  [{ lineId: "https://evil.example/x" }, null, null],
  [{ lineId: "javascript:alert(1)" }, null, "javascript:alert(1)"],
  [{ lineId: "ร้านฉัน" }, null, "ร้านฉัน"],
  [{ lineId: "@ร้านฉัน" }, null, "@ร้านฉัน"],
  [{ lineId: "@shop", lineUrl: "https://lin.ee/abc" }, "https://lin.ee/abc", "@shop"],
  [{ lineUrl: "https://line.me/R/ti/p/%40fromurl" }, "https://line.me/R/ti/p/%40fromurl", "@fromurl"],
  [{ lineId: "@shop", lineUrl: "javascript:alert(1)" }, "https://line.me/R/ti/p/%40shop", "@shop"],
  [{}, null, null],
  [{ lineId: "   " }, null, null],
];
for (const [input, href, display] of cases) {
  const r = lineChat(input);
  check(`unit ${JSON.stringify(input)} → ${href}`, (r?.href ?? null) === href && (display === null ? r === null || r.href === null : r?.display === display), r);
}

// ---- live
const c = readCreds();
const shop = c.tenants.find((t: { key: string }) => t.key === "shop") as { slug: string; id: string };
const base = `http://${shop.slug}.localhost:3000`;
const slug = `qa-wf-line-${rand()}`;
const [orig] = await tt(shop.id, (tx) => tx.select({ s: tenants.settings, th: tenants.theme }).from(tenants).where(eq(tenants.id, shop.id)));
const origSettings = orig!.s as Record<string, any>;
const origTheme = orig!.th as Record<string, any>;
// the shop's preset uses the "big" footer (no social icons): switch to each icon-bearing footer variant per case
const setLine = async (contact: Record<string, unknown>, footer: string) => {
  const s = { ...origSettings, contact: { ...(origSettings.contact ?? {}), lineUrl: undefined, ...contact } };
  const th = { ...origTheme, layout: { ...(origTheme.layout ?? {}), footer } };
  await tt(shop.id, (tx) => tx.update(tenants).set({ settings: s, theme: th }).where(eq(tenants.id, shop.id)));
  await invalidateTenant(shop.id);
  await new Promise((r) => setTimeout(r, 3000)); // other processes poll the invalidation log every 2 s
};
const sections = [{ id: "qawfct1", type: "contact", props: { heading: "QAWF ติดต่อเรา", body: "", showForm: false } }];
const [pg] = await tt(shop.id, (tx) => tx.insert(pages).values({ tenantId: shop.id, slug, title: "QAWF LINE", kind: "page", status: "published", sections, publishedSections: sections, publishedAt: new Date() }).returning({ id: pages.id }));

const browser = await launch();
try {
  const live: Array<[string, Record<string, unknown>, string, string]> = [
    ["personal id without @", { lineId: "qawfplain" }, "https://line.me/ti/p/~qawfplain", "columns"],
    ["official account", { lineId: "@qawfoa" }, "https://line.me/R/ti/p/%40qawfoa", "simple"],
    ["full line.me URL", { lineId: "https://line.me/ti/p/~qawfurl" }, "https://line.me/ti/p/~qawfurl", "centered"],
  ];
  for (const [name, contact, want, footer] of live) {
    await setLine(contact, footer);
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await newCtx(browser, { viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
      await isolateHmr(ctx);
      const page = await ctx.newPage();
      await page.goto(`${base}/${slug}`, { waitUntil: "load", timeout: 120_000 });
      const got = await page.evaluate(() => {
        const href = (el: Element | null) => el?.getAttribute("href") ?? null;
        return {
          floating: href(Array.from(document.querySelectorAll("a")).find((a) => /LINE/.test(a.textContent ?? "") && getComputedStyle(a).position === "fixed") ?? document.querySelector("[data-floating-chat] a, a[data-floating-chat]")),
          footer: href(document.querySelector('footer a[aria-label="LINE"]')),
          contact: href(Array.from(document.querySelectorAll("#contact a")).find((a) => (a.textContent ?? "").includes("LINE")) ?? null),
          contactText: Array.from(document.querySelectorAll("#contact a")).find((a) => (a.textContent ?? "").includes("LINE"))?.textContent ?? null,
        };
      });
      check(`[${vp.width}] ${name} (footer ${footer}): floating chat, footer icon and contact section all link to ${want}`, got.floating === want && got.footer === want && got.contact === want, got);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await tt(shop.id, (tx) => tx.update(tenants).set({ settings: origSettings, theme: origTheme }).where(eq(tenants.id, shop.id)));
  await invalidateTenant(shop.id);
  await tt(shop.id, (tx) => tx.delete(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.id, pg!.id))));
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
