import "../../load-env";
import { writeFile } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";

/** Link crawl (2 levels) for demo-shop/cafe/corporate: status, console errors, broken images, SEO meta. */
const tenants = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = tenants.length ? tenants : ["demo-shop", "demo-cafe", "demo-corporate"];
const MAX = Number(process.env.MAX ?? 70);
const ONLY_META = process.env.ONLY_META === "1";

type Row = { url: string; from: string; status: number; title: string; desc: string | null; ogTitle: string | null; ogImage: string | null; canonical: string | null; h1: number; errors: string[]; brokenImgs: string[]; notFoundText: boolean };

async function collectLinks(page: Page, origin: string, scope = "body") {
  return page.evaluate(([o, s]) => {
    const out: string[] = [];
    document.querySelectorAll(`${s} a[href]`).forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href.startsWith(o)) out.push(href.split("#")[0]!);
    });
    return [...new Set(out)];
  }, [origin, scope] as const);
}

async function visit(page: Page, url: string, from: string): Promise<Row> {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); };
  const onPageErr = (e: Error) => errors.push(`pageerror: ${e.message.slice(0, 200)}`);
  const onReqFail = (r: { url(): string; failure(): { errorText: string } | null }) => { const f = r.failure()?.errorText ?? ""; if (!f.includes("ERR_ABORTED")) errors.push(`requestfailed: ${r.url().slice(0, 120)} ${f}`); };
  const onResp = (r: { url(): string; status(): number; request(): { resourceType(): string } }) => { if (r.status() >= 400 && r.url() !== url && !r.url().includes("_rsc=")) errors.push(`http${r.status()}: ${r.request().resourceType()} ${r.url().slice(0, 140)}`); };
  page.on("console", onConsole); page.on("pageerror", onPageErr); page.on("requestfailed", onReqFail); page.on("response", onResp);
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    status = res?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
  } catch (e) { errors.push(`navigation: ${(e as Error).message.slice(0, 160)}`); }
  const meta = await page.evaluate(`(() => {
    const m = (sel) => document.querySelector(sel)?.getAttribute("content") ?? null;
    const broken = [];
    document.querySelectorAll("img").forEach((i) => { if (i.complete && i.naturalWidth === 0 && i.getAttribute("src")) broken.push(i.currentSrc || i.src); });
    return {
      title: document.title, desc: m('meta[name="description"]'), ogTitle: m('meta[property="og:title"]'), ogImage: m('meta[property="og:image"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null, h1: document.querySelectorAll("h1").length, broken,
      nf: /ไม่พบหน้า|404/.test(document.body.innerText.slice(0, 3000)),
    };
  })()`).then((x) => x as { title: string; desc: string | null; ogTitle: string | null; ogImage: string | null; canonical: string | null; h1: number; broken: string[]; nf: boolean }).catch(() => ({ title: "", desc: null, ogTitle: null, ogImage: null, canonical: null, h1: 0, broken: [], nf: false }));
  page.off("console", onConsole); page.off("pageerror", onPageErr); page.off("requestfailed", onReqFail); page.off("response", onResp);
  return { url, from, status, title: meta.title, desc: meta.desc, ogTitle: meta.ogTitle, ogImage: meta.ogImage, canonical: meta.canonical, h1: meta.h1, errors, brokenImgs: meta.broken, notFoundText: meta.nf };
}

async function main() {
  const browser = await chromium.launch();
  const all: Record<string, Row[]> = {};
  for (const slug of TARGETS) {
    const origin = `http://${slug}.localhost:3000`;
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const rows: Row[] = [];
    const seen = new Set<string>();
    const home = await visit(page, origin + "/", "(start)");
    rows.push(home); seen.add(origin + "/");
    const lvl1 = new Map<string, string>();
    for (const [scope, label] of [["header", "header"], ["footer", "footer"], ["main", "main"], ["body", "body"]] as const)
      for (const l of await collectLinks(page, origin, scope)) if (!lvl1.has(l)) lvl1.set(l, `home:${label}`);
    // mobile nav
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await mctx.newPage();
    await mp.goto(origin + "/", { waitUntil: "load", timeout: 90_000 });
    await mp.waitForTimeout(1000);
    const menuBtn = mp.locator('header button[aria-label]').filter({ hasNot: mp.locator('[data-cart]') });
    const labels = await menuBtn.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    console.log(`[${slug}] mobile header buttons:`, labels);
    const burger = mp.locator('header button[aria-label*="เมนู"], header button[aria-label*="menu" i]').first();
    if (await burger.count()) {
      await burger.click(); await mp.waitForTimeout(800);
      const ml = await collectLinks(mp, origin, "body");
      for (const l of ml) if (!lvl1.has(l)) lvl1.set(l, "home:mobile-nav");
      const navLinks = await mp.locator('[role="dialog"] a[href], nav a[href]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
      console.log(`[${slug}] mobile nav links:`, navLinks.join(" "));
    } else console.log(`[${slug}] NO mobile menu button found`);
    await mctx.close();
    const queue: Array<[string, string]> = [...lvl1.entries()];
    let i = 0;
    while (i < queue.length && rows.length < MAX) {
      const [url, from] = queue[i++]!;
      if (seen.has(url)) continue; seen.add(url);
      const r = await visit(page, url, from);
      rows.push(r);
      console.log(`${r.status} ${url.replace(origin, "")} <- ${from} | ${r.title}${r.errors.length ? " | ERR " + r.errors.slice(0, 3).join(" ; ") : ""}${r.brokenImgs.length ? " | BROKEN " + r.brokenImgs.slice(0, 2).join(",") : ""}`);
      if (from.startsWith("home:")) {
        const more = await collectLinks(page, origin, "body");
        for (const l of more) if (!seen.has(l) && !queue.some(([u]) => u === l)) queue.push([l, url.replace(origin, "")]);
      }
    }
    all[slug] = rows;
    await ctx.close();
  }
  await writeFile("qa/bughunt/storefront_shop-crawl.json", JSON.stringify(all, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
