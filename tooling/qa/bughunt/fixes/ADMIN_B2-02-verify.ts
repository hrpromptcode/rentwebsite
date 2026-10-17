/**
 * ADMIN_B2-02 storefront draft preview (web_final packet).
 *  - a PUBLISHED page whose draft differs: admin "ดูตัวอย่าง" popup renders the DRAFT heading + draft title banner inside
 *    the tenant shell (header/footer present), while the live URL still serves the published heading;
 *  - preview is noindex + not cacheable; bad / tampered / expired / other-tenant / unknown-page / missing tokens → 404;
 *  - a never-published draft page previews too (live URL 404).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-02-verify.ts
 */
import { and, eq, pages } from "@rentweb/db";
import { signPreviewToken } from "@rentweb/core/preview-token";
import { done, go, hreq, launch, newCtx, newPage, rand, readCreds, shot, stateFor, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const c = readCreds();
const T = (key: string) => c.tenants.find((t: { key: string }) => t.key === key) as { slug: string; id: string };
const shop = T("shop");
const cafe = T("cafe");
const host = `${shop.slug}.localhost:3000`;
const r = rand();
const slug = `qa-wf-prev-${r}`;
const draftSlug = `qa-wf-draft-${r}`;
const text = (id: string, heading: string) => [{ id, type: "text", props: { eyebrow: "", heading, body: "", align: "left", size: "normal" } }];
const LIVE = `QAWF-LIVE-${r}`;
const DRAFT = `QAWF-DRAFT-${r}`;
const NEVER = `QAWF-NEVER-${r}`;

const [p1] = await tt(shop.id, (tx) =>
  tx.insert(pages).values({
    tenantId: shop.id, slug, title: `QAWF Live ${r}`, kind: "page", status: "published",
    sections: text("qawf1", DRAFT), publishedSections: text("qawf1", LIVE),
    draftMeta: { title: `QAWF Draft Title ${r}`, slug, showInNav: false, seo: {} }, publishedAt: new Date(),
  }).returning({ id: pages.id }),
);
const [p2] = await tt(shop.id, (tx) =>
  tx.insert(pages).values({ tenantId: shop.id, slug: draftSlug, title: `QAWF Never ${r}`, kind: "page", status: "draft", sections: text("qawf2", NEVER) }).returning({ id: pages.id }),
);
const pageId = p1!.id;
const neverId = p2!.id;
const pv = (token: string) => hreq(host, `/preview?token=${encodeURIComponent(token)}`);

const browser = await launch();
try {
  // live page = published version
  const live = await hreq(host, `/${slug}`);
  check("live URL serves the PUBLISHED heading", live.status === 200 && live.body.includes(LIVE) && !live.body.includes(DRAFT), { status: live.status });

  // HTTP checks on the preview route
  const good = await pv(signPreviewToken({ tenantId: shop.id, pageId }));
  check("preview 200 with the DRAFT heading only", good.status === 200 && good.body.includes(DRAFT) && !good.body.includes(LIVE), { status: good.status });
  check("preview banner names the draft title", good.body.includes(`QAWF Draft Title ${r}`) && good.body.includes("ยังไม่เผยแพร่"));
  const robots = good.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
  check("preview sends noindex,nofollow", /noindex/.test(robots) && /nofollow/.test(robots), robots);
  const cc = String(good.headers["cache-control"] ?? "");
  check("preview response is not cacheable", /no-store/.test(cc) || /private/.test(cc), cc);
  check("preview keeps the tenant shell (header + footer)", /data-site-header/.test(good.body) && /<footer/.test(good.body));

  const tok = signPreviewToken({ tenantId: shop.id, pageId });
  const tampered = tok.slice(0, -2) + (tok.endsWith("AA") ? "BB" : "AA");
  const cases: Array<[string, string | null]> = [
    ["tampered signature", tampered],
    ["expired token", signPreviewToken({ tenantId: shop.id, pageId, now: Date.now() - 31 * 60_000 })],
    ["other tenant's token on this host", signPreviewToken({ tenantId: cafe.id, pageId })],
    ["unknown page id", signPreviewToken({ tenantId: shop.id, pageId: "00000000-0000-4000-8000-000000000000" })],
    ["garbage token", "not-a-token"],
    ["missing token", null],
  ];
  for (const [name, t] of cases) {
    const res = t === null ? await hreq(host, "/preview") : await pv(t);
    check(`404 for ${name}`, res.status === 404 && !res.body.includes(DRAFT), res.status);
  }
  const never = await pv(signPreviewToken({ tenantId: shop.id, pageId: neverId }));
  const neverLive = await hreq(host, `/${draftSlug}`);
  check("never-published page previews (live URL 404)", never.status === 200 && never.body.includes(NEVER) && neverLive.status === 404, { preview: never.status, live: neverLive.status });

  // end to end from the admin button
  const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await newCtx(browser, { storageState: st, viewport: vp });
    await isolateHmr(ctx);
    const page = await newPage(ctx);
    await go(page, `/t/${shop.slug}/pages/${pageId}`);
    const btn = page.getByRole("button", { name: /ดูตัวอย่าง/ }).or(page.getByRole("link", { name: /ดูตัวอย่าง/ })).first();
    // the phone editor opens the first section in a sheet; close it to reach the toolbar
    await page.waitForTimeout(1500);
    if (await page.getByRole("dialog").isVisible().catch(() => false)) await page.keyboard.press("Escape");
    const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 60_000 }), btn.click()]);
    await popup.waitForLoadState("load", { timeout: 120_000 });
    await popup.getByText(DRAFT).first().waitFor({ timeout: 60_000 }).catch(() => {});
    const body = await popup.locator("body").innerText();
    check(`[${vp.width}] admin ดูตัวอย่าง popup shows the draft heading`, body.includes(DRAFT) && !body.includes(LIVE), popup.url().slice(0, 70));
    const banner = popup.locator("[data-preview-banner]");
    const bb = await banner.boundingBox();
    const hb = await popup.locator("[data-site-header]").first().boundingBox();
    check(`[${vp.width}] banner visible below the header`, !!bb && bb.height > 0 && (!hb || bb.y >= hb.y + hb.height - 1), { bb, hb });
    await popup.evaluate(() => window.scrollTo(0, 400));
    await popup.waitForTimeout(400);
    const bb2 = await banner.boundingBox();
    check(`[${vp.width}] banner stays on screen while scrolling`, !!bb2 && bb2.y >= 0 && bb2.y < 200, bb2);
    const ovf = await popup.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`[${vp.width}] no horizontal overflow`, ovf <= 0, ovf);
    await popup.evaluate(() => window.scrollTo(0, 0));
    await popup.screenshot({ path: shot(`web_final-preview-${vp.width}`) });
    const liveP = await ctx.newPage();
    await liveP.goto(`http://${host}/${slug}`, { waitUntil: "load" });
    const liveBody = await liveP.locator("main").innerText();
    check(`[${vp.width}] live page in the browser still shows the published heading`, liveBody.includes(LIVE) && !liveBody.includes(DRAFT));
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const id of [pageId, neverId]) await tt(shop.id, (tx) => tx.delete(pages).where(and(eq(pages.tenantId, shop.id), eq(pages.id, id))));
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
