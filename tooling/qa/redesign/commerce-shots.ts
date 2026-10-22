/**
 * commerce agent verification: screenshots of every commerce route (shop + cafe) at 1440 and 390, console / hydration
 * errors, horizontal overflow and canvas count; optional home contact sheets and a reduced-motion pass.
 *   cd tooling && pnpm exec tsx qa/redesign/commerce-shots.ts [--only=shop,cafe] [--pages=products,detail] [--w=1440,390] [--reduce] [--home] [--full]
 * → screenshots/redesign-commerce-<site>-<page>-<w>.png
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = (arg("only") ?? "shop,cafe").split(",").filter(Boolean);
const PAGES = new Set((arg("pages") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const REDUCE = process.argv.includes("--reduce");
const HOME = process.argv.includes("--home");
const FULL = process.argv.includes("--full");
const OUT = path.resolve(process.cwd(), "screenshots");
const SITE: Record<string, { product: string; collection: string; variant?: string }> = {
  shop: { product: "linen-shirt-sand", collection: "bags", variant: "M" },
  cafe: { product: "croissant", collection: "cakes" },
};

const want = (p: string) => !PAGES.size || PAGES.has(p);

async function shot(page: Page, file: string, full = FULL) {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, file), fullPage: full });
}

async function frames(page: Page, base: string, max = 14): Promise<string[]> {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  for (let i = 0; i < max; i++) {
    const f = path.join(OUT, `${base}-f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const before = await page.evaluate(() => window.scrollY);
    for (let k = 0; k < 4; k++) {
      await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => window.scrollY);
    if (after - before < 20) break;
  }
  return files;
}

async function sheet(files: string[], out: string, cols: number) {
  const cells = files.map((f) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${path.basename(f)}</figcaption></figure>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1d1d1f;color:#bbb;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
  const tmp = path.join(OUT, `.sheet-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
  await p.goto(pathToFileURL(tmp).href);
  await p.waitForLoadState("load");
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
  fs.unlinkSync(tmp);
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];

async function visit(ctx: BrowserContext, page: Page, errors: string[], key: string, name: string, url: string, after?: (p: Page) => Promise<void>) {
  const w = page.viewportSize()!.width;
  const tag = `${key}-${name}-${w}${REDUCE ? "-reduce" : ""}`;
  try {
    const before = errors.length;
    const res = await stableGoto(page, url, "load");
    await page.waitForTimeout(1200);
    if (after) await after(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const canv = await page.evaluate(() => document.querySelectorAll("canvas").length);
    await shot(page, `redesign-commerce-${tag}.png`);
    const errs = errors.slice(before);
    const line = `${res?.status()} ${tag} overflow=${overflow}px canvases=${canv} errors=${errs.length}${errs.length ? "\n    " + [...new Set(errs)].slice(0, 5).join("\n    ") : ""}`;
    report.push(line);
    console.log(line);
  } catch (e) {
    const line = `FAIL ${tag} ${(e as Error).message.slice(0, 200)}`;
    report.push(line);
    console.log(line);
  }
}

for (const w of WIDTHS) {
  for (const key of ONLY) {
    const cfg = SITE[key]!;
    const base = `http://demo-${key}.localhost:3000`;
    const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768, reducedMotion: REDUCE ? "reduce" : "no-preference", locale: "th-TH" });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`${m.text().slice(0, 200)} @ ${(m.location().url ?? "").replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

    if (HOME) {
      try {
        await stableGoto(page, `${base}/`, "load");
        await page.waitForTimeout(2500);
        await page.mouse.move(w * 0.6, 300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const files = await frames(page, `redesign-commerce-${key}-home-${w}`);
        await sheet(files, path.join(OUT, `redesign-commerce-${key}-home-${w}${REDUCE ? "-reduce" : ""}.png`), w >= 768 ? 3 : 6);
        for (const f of files.slice(1)) fs.unlinkSync(f);
        const line = `home ${key} ${w} frames=${files.length} overflow=${overflow}px errors=${errors.length}${errors.length ? "\n    " + [...new Set(errors)].slice(0, 6).join("\n    ") : ""}`;
        report.push(line);
        console.log(line);
      } catch (e) {
        console.log(`FAIL home ${key} ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (want("products")) await visit(ctx, page, errors, key, "products", `${base}/products`);
    if (want("collections")) await visit(ctx, page, errors, key, "collections", `${base}/collections`);
    if (want("collection")) await visit(ctx, page, errors, key, "collection", `${base}/collections/${cfg.collection}`);
    if (want("search")) await visit(ctx, page, errors, key, "search-empty", `${base}/products?q=zzzzzz`);
    if (want("detail")) await visit(ctx, page, errors, key, "detail", `${base}/products/${cfg.product}`);
    if (want("cartempty")) await visit(ctx, page, errors, key, "cart-empty", `${base}/cart`);
    if (want("track")) await visit(ctx, page, errors, key, "track", `${base}/orders/track`);
    if (want("ordernotfound")) await visit(ctx, page, errors, key, "order-notfound", `${base}/orders/00000000-0000-0000-0000-000000000000`);
    if (want("cart") || want("checkout") || want("order")) {
      // put a product in the cart through the real API (same cookies as the page)
      try {
        await stableGoto(page, `${base}/products/${cfg.product}`, "load");
        const pid = await page.evaluate(async (variant) => {
          const btn = variant ? [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((b) => b.textContent?.trim() === variant) : null;
          btn?.click();
          return null;
        }, cfg.variant ?? null);
        void pid;
        await page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click();
        await page.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() === "POST", { timeout: 45_000 });
        await page.waitForTimeout(800);
      } catch (e) {
        console.log(`add-to-cart failed ${(e as Error).message.slice(0, 120)}`);
      }
      if (want("cart")) await visit(ctx, page, errors, key, "cart", `${base}/cart`);
      if (want("checkout") || want("order")) await visit(ctx, page, errors, key, "checkout", `${base}/checkout`);
      if (want("order")) {
        try {
          await page.fill("#name", "คุณทดสอบ ระบบ");
          await page.fill("#phone", `08${String(Date.now()).slice(-8)}`);
          if (await page.locator("#line1").count()) {
            await page.fill("#line1", "99/1 ถนนสุขุมวิท");
            await page.fill("#subdistrict", "คลองเตย");
            await page.fill("#district", "คลองเตย");
            await page.selectOption("#province", "กรุงเทพมหานคร");
            await page.fill("#postalCode", "10110");
          }
          const btns = page.locator('button[type="submit"]', { hasText: "สั่งซื้อและชำระเงิน" });
          for (let i = 0; i < (await btns.count()); i++) if (await btns.nth(i).isVisible()) { await btns.nth(i).click(); break; }
          await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
          const orderUrl = page.url();
          await visit(ctx, page, errors, key, "order", orderUrl);
        } catch (e) {
          console.log(`order flow failed ${(e as Error).message.slice(0, 160)}`);
        }
      }
    }
    await page.close();
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "redesign-commerce-report.txt"), report.join("\n") + "\n");
