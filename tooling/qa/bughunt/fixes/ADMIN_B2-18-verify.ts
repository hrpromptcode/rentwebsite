/**
 * ADMIN_B2-18 storefront part (web_final packet): nav items with `external: true` open in a new tab with
 * rel="noopener noreferrer" in the desktop header (incl. dropdown children), the phone menu sheet and the footer;
 * items whose href fails the admin allow-list (javascript:, data:, vbscript:, //host, bare words, whitespace) render nothing.
 * Unit part: safeNav / navHrefKind. Live part: temporarily replaces the trial shop's header + footer navigation rows
 * (restored afterwards) and inspects the rendered anchors at 1440 and 390.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-18-verify.ts
 */
import { and, eq, navigation, type NavItem } from "@rentweb/db";
import { navHrefKind, safeNav } from "../../../../packages/storefront/src/shell/nav-href";
import { done, launch, newCtx, readCreds, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};

// ---- unit
const bad = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "evil.example", "java\tscript:x", "/a b", "/a\\b", "", "mailto:", "file:///etc/passwd"];
for (const h of bad) check(`unit: refused ${JSON.stringify(h)}`, navHrefKind(h) === null);
const good: Array<[string, string]> = [["/about", "internal"], ["#contact", "internal"], ["/เกี่ยวกับ", "internal"], ["https://example.com/qa", "web"], ["http://example.com", "web"], ["mailto:a@b.co", "app"], ["tel:+6621234567", "app"], ["sms:+66812345678", "app"], ["line://ti/p/@shop", "app"]];
for (const [h, k] of good) check(`unit: allowed ${h} as ${k}`, navHrefKind(h) === k);
const s = safeNav([
  { label: "Ext", href: "https://example.com", external: true },
  { label: "MailExt", href: "mailto:a@b.co", external: true },
  { label: "Int", href: "/x", external: true },
  { label: "JS", href: "javascript:alert(1)" },
  { label: "Group", href: "/g", children: [{ label: "C-ok", href: "/c", external: false }, { label: "C-bad", href: "data:x" }, { label: "C-ext", href: "https://c.example", external: true }] },
  { label: "", href: "/empty-label" },
]);
check("unit: safeNav drops bad items and keeps external only on http(s)", JSON.stringify(s) === JSON.stringify([
  { label: "Ext", href: "https://example.com", external: true },
  { label: "MailExt", href: "mailto:a@b.co" },
  { label: "Int", href: "/x" },
  { label: "Group", href: "/g", children: [{ label: "C-ok", href: "/c" }, { label: "C-ext", href: "https://c.example", external: true }] },
]), s);

// ---- live
const c = readCreds();
const shop = c.tenants.find((t: { key: string }) => t.key === "shop") as { slug: string; id: string };
const base = `http://${shop.slug}.localhost:3000`;
const header: NavItem[] = [
  { label: "WF Home", href: "/" },
  { label: "WF Ext", href: "https://example.com/wf-ext", external: true },
  { label: "WF JS", href: "javascript:alert(document.domain)" },
  { label: "WF Group", href: "/products", children: [{ label: "WF Child Ext", href: "https://example.com/wf-child", external: true }, { label: "WF Child Data", href: "data:text/html,boo" }, { label: "WF Child Int", href: "/products" }] },
  { label: "WF Proto", href: "//evil.example/x" },
];
const footer: NavItem[] = [
  { label: "WF Foot Ext", href: "https://example.com/wf-foot", external: true },
  { label: "WF Foot Int", href: "/products" },
  { label: "WF Foot VB", href: "vbscript:msgbox(1)" },
];
const before = await tt(shop.id, (tx) => tx.select().from(navigation).where(eq(navigation.tenantId, shop.id)));
const put = (location: string, items: NavItem[]) =>
  tt(shop.id, (tx) => tx.insert(navigation).values({ tenantId: shop.id, location, items }).onConflictDoUpdate({ target: [navigation.tenantId, navigation.location], set: { items } }));

type A = { text: string; href: string | null; target: string | null; rel: string | null };
const anchors = (root: string) => `Array.from(document.querySelectorAll(${JSON.stringify(root)})).map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") }))`;
const find = (list: A[], text: string) => list.find((a) => a.text === text);
const isNewTab = (a?: A) => !!a && a.target === "_blank" && /noopener/.test(a.rel ?? "") && /noreferrer/.test(a.rel ?? "");
const isSameTab = (a?: A) => !!a && a.target === null;

const browser = await launch();
try {
  await put("header", header);
  await put("footer", footer);
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await newCtx(browser, { viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "load", timeout: 120_000 });
    const all = (await page.evaluate(anchors("a"))) as A[];
    check(`[${vp.width}] no javascript:/data:/vbscript:/protocol-relative anchors anywhere`, !all.some((a) => /^(javascript|data|vbscript):|^\/\//i.test(a.href ?? "") || /WF (JS|Proto|Child Data|Foot VB)/.test(a.text)), all.filter((a) => /WF/.test(a.text)));
    const foot = (await page.evaluate(anchors("footer a"))) as A[];
    check(`[${vp.width}] footer external item opens in a new tab with noopener noreferrer`, isNewTab(find(foot, "WF Foot Ext")), find(foot, "WF Foot Ext"));
    check(`[${vp.width}] footer internal item stays in the tab`, isSameTab(find(foot, "WF Foot Int")), find(foot, "WF Foot Int"));
    if (vp.width >= 768) {
      const head = (await page.evaluate(anchors("header nav a"))) as A[];
      check("[1440] header external item: target=_blank rel=noopener noreferrer", isNewTab(find(head, "WF Ext")), find(head, "WF Ext"));
      check("[1440] header dropdown external child: new tab", isNewTab(find(head, "WF Child Ext")), find(head, "WF Child Ext"));
      check("[1440] header internal items stay in the tab", isSameTab(find(head, "WF Home")) && isSameTab(find(head, "WF Child Int")), [find(head, "WF Home"), find(head, "WF Child Int")]);
      check("[1440] header renders the group but not the bad items", !!find(head, "WF Group") && !find(head, "WF JS") && !find(head, "WF Proto") && !find(head, "WF Child Data"), head.map((a) => a.text));
    } else {
      await page.getByRole("button", { name: "เปิดเมนู" }).first().click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor({ timeout: 30_000 });
      await sheet.getByRole("button", { name: "WF Group" }).click();
      await page.waitForTimeout(300);
      const m = (await page.evaluate(anchors('[role="dialog"] a'))) as A[];
      check("[390] menu sheet external item: new tab + noopener noreferrer", isNewTab(find(m, "WF Ext")), find(m, "WF Ext"));
      check("[390] menu sheet external child: new tab", isNewTab(find(m, "WF Child Ext")), find(m, "WF Child Ext"));
      check("[390] menu sheet internal items stay in the tab", isSameTab(find(m, "WF Home")) && isSameTab(find(m, "WF Child Int")));
      check("[390] menu sheet hides the bad items", !find(m, "WF JS") && !find(m, "WF Proto") && !find(m, "WF Child Data"), m.map((a) => a.text));
      const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 30_000 }).catch(() => null), sheet.getByRole("link", { name: "WF Ext" }).click()]);
      check("[390] tapping the external item opens a new page (storefront tab kept)", !!popup && page.url().startsWith(base), { popup: popup?.url() ?? null, page: page.url() });
      await popup?.close().catch(() => {});
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const loc of ["header", "footer"]) {
    const orig = before.find((r) => r.location === loc);
    if (orig) await put(loc, orig.items as NavItem[]);
    else await tt(shop.id, (tx) => tx.delete(navigation).where(and(eq(navigation.tenantId, shop.id), eq(navigation.location, loc))));
  }
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
