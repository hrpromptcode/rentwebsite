/**
 * qa-a crawl (phase 3 visual QA): demo-shop, demo-cafe, demo-corporate — every page at the given widths, in one of three
 * modes (normal | reduce | nogl = --disable-3d-apis). Per page: scroll frames → contact sheet, console / hydration errors,
 * horizontal overflow, canvases (total / live in viewport per frame), small tap targets, low-res / broken images,
 * Thai mid-word breaks in headings, heading overflow, rough contrast; home: rough FPS while wheel-scrolling.
 *   cd tooling && pnpm exec tsx qa/redesign/qa-a-shots.ts [--only=shop,cafe,corp] [--w=1440,390] [--mode=normal|reduce|nogl]
 *        [--pages=home,products,...] [--frames=6] [--first] [--fps]
 * → screenshots/redesign-qa-a-<site>-<page>-<w>[-rm|-nogl].png (first viewport) + …-sheet.png ; report → screenshots/redesign-qa-a-report-<mode>.txt
 */
import "../../load-env";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
import { and, eq, getAdminDb, pages, tenants } from "@rentweb/db";
import { signPreviewToken } from "@rentweb/core/preview-token";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = (arg("only") ?? "shop,cafe,corp").split(",").filter(Boolean);
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const MODE = (arg("mode") ?? "normal") as "normal" | "reduce" | "nogl";
const PAGES = new Set((arg("pages") ?? "").split(",").filter(Boolean));
const MAX_FRAMES = Number(arg("frames") ?? 6);
const FIRST = process.argv.includes("--first");
const FPS = process.argv.includes("--fps");
const OUT = path.resolve(process.cwd(), "screenshots");
const SUF = MODE === "reduce" ? "-rm" : MODE === "nogl" ? "-nogl" : "";

type T = { name: string; path: string; auth?: boolean; cart?: boolean; order?: boolean; preview?: string; frames?: number };
const commerce = (products: string[], cats: string[]): T[] => [
  { name: "home", path: "/", frames: 22 },
  { name: "products", path: "/products", frames: 5 },
  { name: "products-sort", path: "/products?sort=price-asc", frames: 1 },
  { name: "search-empty", path: "/products?q=zzzzzz", frames: 2 },
  { name: "collections", path: "/collections", frames: 4 },
  ...cats.map((c) => ({ name: `col-${c}`, path: `/collections/${c}`, frames: 3 })),
  ...products.map((p, i) => ({ name: `p-${p}`, path: `/products/${p}`, frames: i === 0 ? 8 : 2 })),
  { name: "cart-empty", path: "/cart", frames: 2 },
  { name: "track", path: "/orders/track", frames: 2 },
  { name: "order-notfound", path: "/orders/00000000-0000-0000-0000-000000000000", frames: 2 },
  { name: "about", path: "/about", frames: 6 },
  { name: "contact", path: "/contact", frames: 5 },
  { name: "privacy", path: "/privacy", frames: 2 },
  { name: "terms", path: "/terms", frames: 2 },
  { name: "refund", path: "/refund", frames: 3 },
  { name: "login", path: "/account/login", frames: 2 },
  { name: "notfound", path: "/this-page-does-not-exist", frames: 2 },
  { name: "preview-home", path: "", preview: "home", frames: 2 },
  { name: "cart", path: "/cart", cart: true, frames: 3 },
  { name: "checkout", path: "/checkout", cart: true, frames: 5 },
  { name: "order", path: "", order: true, frames: 5 },
  { name: "account", path: "/account", auth: true, frames: 3 },
  { name: "account-orders", path: "/account/orders", auth: true, frames: 3 },
];
const SITES: Record<string, { host: string; product: string; variant?: string; targets: T[] }> = {
  shop: {
    host: "demo-shop",
    product: "linen-shirt-sand",
    variant: "M",
    targets: commerce(["linen-shirt-sand", "indigo-dress", "wide-pants", "organic-tee", "tote-pikul", "leather-clutch", "cushion-cover", "sofa-throw"], ["apparel", "bags", "home"]),
  },
  cafe: {
    host: "demo-cafe",
    product: "croissant",
    targets: commerce(["croissant", "almond-croissant", "cookies", "gf-brownie", "jp-cheesecake", "coconut-cake", "custom-cake", "latte"], ["pastry", "cakes", "drinks"]),
  },
  corp: {
    host: "demo-corporate",
    product: "",
    targets: [
      { name: "home", path: "/", frames: 26 },
      { name: "services", path: "/services", frames: 10 },
      { name: "work", path: "/work", frames: 10 },
      { name: "careers", path: "/careers", frames: 6 },
      { name: "about", path: "/about", frames: 6 },
      { name: "contact", path: "/contact", frames: 5 },
      { name: "privacy", path: "/privacy", frames: 2 },
      { name: "terms", path: "/terms", frames: 2 },
      { name: "refund", path: "/refund", frames: 2 },
      { name: "login", path: "/account/login", frames: 2 },
      { name: "notfound", path: "/this-page-does-not-exist", frames: 2 },
      { name: "products-off", path: "/products", frames: 1 },
      { name: "preview-about", path: "", preview: "about", frames: 2 },
      { name: "account", path: "/account", auth: true, frames: 3 },
      { name: "account-orders", path: "/account/orders", auth: true, frames: 2 },
    ],
  },
};

async function previewUrl(slug: string, pageSlug: string): Promise<string> {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const [p] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, t!.id), eq(pages.slug, pageSlug))).limit(1);
  return `http://${slug}.localhost:3000/preview?token=${encodeURIComponent(signPreviewToken({ tenantId: t!.id, pageId: p!.id }))}`;
}

/** in-page audit of the current viewport (runs per frame) */
async function auditViewport(page: Page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
      return r;
    };
    const liveCanvases = [...document.querySelectorAll("canvas")].filter((c) => vis(c) && c.width > 2).length;
    // tap targets
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary")) {
      const r = vis(el);
      if (!r) continue;
      if (el.closest("p, li p, .prose, [data-inline-link]") && el.tagName === "A") continue; // inline text links
      if (el.closest("[aria-hidden=true]") || el.closest(".sr-only")) continue;
      const min = vw < 768 ? 43.5 : 23.5; // touch: 44 px · pointer (WCAG 2.2 AA): 24 px
      if (r.width < min || r.height < min) {
        // allow a parent label / hit area that is ≥ 44
        const host = el.closest("label") as HTMLElement | null;
        const hr = host?.getBoundingClientRect();
        if (hr && hr.width >= 44 && hr.height >= 44) continue;
        const name = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).name || el.tagName).trim().replace(/\s+/g, " ").slice(0, 28);
        small.push(`${el.tagName.toLowerCase()}"${name}"${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    // images
    const imgs: string[] = [];
    for (const im of document.querySelectorAll("img")) {
      const r = vis(im);
      if (!r || r.width < 60) continue;
      if (!im.complete || !im.currentSrc) continue;
      if (im.naturalWidth === 0) { imgs.push(`BROKEN ${im.currentSrc.slice(-60)}`); continue; }
      const fit = getComputedStyle(im).objectFit;
      const need = fit === "cover" ? Math.max(r.width, r.height * (im.naturalWidth / im.naturalHeight)) : r.width;
      if (im.naturalWidth < need * Math.min(devicePixelRatio, 2) * 0.75) imgs.push(`LOWRES ${im.naturalWidth}px for ${Math.round(need)}px ${decodeURIComponent(im.currentSrc).replace(/^.*?(photo-[\w-]+|[^/]+$)/, "$1").slice(0, 50)}`);
    }
    // headings: overflow + Thai mid-word break
    const heads: string[] = [];
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    for (const h of document.querySelectorAll<HTMLElement>("h1, h2, h3, .heading-display, [data-split]")) {
      const r = vis(h);
      if (!r) continue;
      const txt = (h.innerText || "").trim();
      if (!txt) continue;
      if (h.scrollWidth > h.clientWidth + 2 && getComputedStyle(h).overflowX !== "visible") heads.push(`OVERFLOW "${txt.slice(0, 30)}"`);
      if (r.right > vw + 1 || r.left < -1) heads.push(`OFFSCREEN "${txt.slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`);
      if (!/[฀-๿]/.test(txt)) continue;
      // map text nodes
      const nodes: { n: Text; start: number }[] = [];
      let all = "";
      const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
        const pe = n.parentElement;
        if (pe && (pe.closest(".sr-only") || getComputedStyle(pe).display === "none")) continue;
        nodes.push({ n, start: all.length });
        all += n.data;
      }
      const at = (off: number) => {
        for (let i = nodes.length - 1; i >= 0; i--) if (off >= nodes[i]!.start) return { node: nodes[i]!.n, o: Math.min(off - nodes[i]!.start, nodes[i]!.n.data.length) };
        return null;
      };
      const lh = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.2;
      for (const s of seg.segment(all)) {
        if (!s.isWordLike || s.segment.length < 3 || !/^[฀-๿]+$/.test(s.segment)) continue;
        const a = at(s.index), b = at(s.index + s.segment.length);
        if (!a || !b) continue;
        const rg = document.createRange();
        try { rg.setStart(a.node, a.o); rg.setEnd(b.node, b.o); } catch { continue; }
        const tops = [...rg.getClientRects()].filter((q) => q.width > 1).map((q) => q.top);
        if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > lh * 0.6) { heads.push(`BREAK "${s.segment}" in "${txt.replace(/\s+/g, " ").slice(0, 34)}"`); break; }
      }
    }
    // rough contrast on leaf text
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const parse = (s: string) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p[3] ?? 1 }; };
    const low: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("p, span, a, li, h1, h2, h3, h4, label, button, dt, dd, small, strong")) {
      if (low.length > 6) break;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1)) continue;
      const r = vis(el);
      if (!r) continue;
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) < 0.95) continue;
      if (el.closest("[data-active]")) continue; // active chip: bg is an absolutely positioned sibling pill
      const fg = parse(cs.color);
      if (!fg || fg.a < 0.5) continue;
      let bg: number[] | null = null;
      let imgBehind = false;
      for (let p: HTMLElement | null = el; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.backgroundImage !== "none" || p.tagName === "PICTURE" || p.querySelector(":scope > img, :scope > video, :scope > canvas")) { imgBehind = true; break; }
        const b = parse(ps.backgroundColor);
        if (b && b.a > 0.9) { bg = b.c; break; }
        if (Number(ps.opacity) < 0.95) { imgBehind = true; break; }
      }
      if (imgBehind || !bg) continue;
      const L1 = lum(fg.c), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need - 0.05) low.push(`${ratio.toFixed(2)} "${(el.textContent || "").trim().slice(0, 24)}" ${cs.color}/${`rgb(${bg.join(",")})`}`);
    }
    return { liveCanvases, small, imgs, heads, low, y: Math.round(scrollY) };
  });
}

async function frames(page: Page, base: string, max: number) {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  const notes = { maxLive: 0, small: new Set<string>(), imgs: new Set<string>(), heads: new Set<string>(), low: new Set<string>() };
  for (let i = 0; i < max; i++) {
    const f = path.join(OUT, "_frames", `${base}-f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const a = await auditViewport(page).catch(() => null);
    if (a) {
      notes.maxLive = Math.max(notes.maxLive, a.liveCanvases);
      a.small.forEach((s) => notes.small.add(s));
      a.imgs.forEach((s) => notes.imgs.add(s));
      a.heads.forEach((s) => notes.heads.add(`${s} @${a.y}`));
      a.low.forEach((s) => notes.low.add(s));
    }
    if (FIRST || i === max - 1) break;
    const before = await page.evaluate(() => window.scrollY);
    for (let k = 0; k < 4; k++) {
      await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(1100);
    const after = await page.evaluate(() => window.scrollY);
    if (after - before < 20) break;
  }
  return { files, notes };
}

let sheetBrowser: Browser | null = null;
async function sheet(files: string[], out: string, cols: number) {
  const cells = files.map((f) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${path.basename(f)}</figcaption></figure>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1d1d1f;color:#bbb;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
  const tmp = path.join(OUT, "_frames", `.sheet-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  sheetBrowser ??= await chromium.launch();
  const p = await sheetBrowser.newPage({ viewport: { width: 1800, height: 900 } });
  await p.goto(pathToFileURL(tmp).href);
  await p.waitForLoadState("load");
  await p.screenshot({ path: out, fullPage: true });
  await p.close();
  fs.unlinkSync(tmp);
}

async function customerLogin(page: Page, base: string) {
  await stableGoto(page, `${base}/account/login`, "load");
  if (new URL(page.url()).pathname === "/account") return;
  await page.locator("#otp-target").waitFor({ timeout: 90_000 });
  await page.fill("#otp-target", "0819990011");
  await page.locator("form button[type=submit]").first().click();
  await page.locator("#otp-code").waitFor({ timeout: 60_000 });
  const code = (await page.locator("body").innerText()).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
  if (!code) throw new Error("no dev OTP code");
  await page.fill("#otp-code", code);
  if (await page.locator("#otp-name").count()) await page.fill("#otp-name", "คุณทดสอบ ดีไซน์");
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
}

async function addToCart(page: Page, base: string, product: string, variant?: string) {
  await stableGoto(page, `${base}/products/${product}`, "load");
  if (variant) await page.locator("button[aria-pressed]", { hasText: new RegExp(`^${variant}$`) }).first().click().catch(() => {});
  await page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click();
  await page.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() === "POST", { timeout: 90_000 });
  await page.waitForTimeout(800);
}

async function placeOrder(page: Page, base: string): Promise<string> {
  await stableGoto(page, `${base}/checkout`, "load");
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
  return page.url();
}

async function measureFps(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const p = page.evaluate(
    () =>
      new Promise<{ fps: number; long: number; worst: number }>((res) => {
        const ts: number[] = [];
        const t0 = performance.now();
        const tick = (t: number) => { ts.push(t); if (t - t0 < 5000) requestAnimationFrame(tick); else { const d = ts.slice(1).map((v, i) => v - ts[i]!); res({ fps: Math.round((ts.length - 1) / ((ts.at(-1)! - ts[0]!) / 1000)), long: d.filter((x) => x > 50).length, worst: Math.round(Math.max(...d)) }); } };
        requestAnimationFrame(tick);
      }),
  );
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(110); }
  return p;
}

fs.mkdirSync(path.join(OUT, "_frames"), { recursive: true });
const gpu = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"];
// Windows: a launch right after a close sometimes dies with 0xC0000142 (DLL init) → retry with a pause
const launch = async (): Promise<Browser> => {
  for (let i = 0; ; i++) {
    try {
      return await chromium.launch({ args: MODE === "nogl" ? ["--disable-3d-apis", "--disable-webgl"] : gpu });
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
  }
};
let sitesDone = 0;
let browser = await launch();
const reportFile = path.join(OUT, `redesign-qa-a-report-${MODE}-${ONLY.join("_")}-${WIDTHS.join("_")}${PAGES.size ? "-partial" : ""}.txt`);
const report: string[] = [];
const flush = () => fs.writeFileSync(reportFile, report.join("\n") + "\n");

for (const w of WIDTHS) {
  for (const key of ONLY) {
    const site = SITES[key]!;
    const base = `http://${site.host}.localhost:3000`;
    const newCtx = async () => {
      const c: BrowserContext = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768, reducedMotion: MODE === "reduce" ? "reduce" : "no-preference", locale: "th-TH" });
      await isolateHmr(c);
      await c.addInitScript({ content: "window.__name = (f) => f;" });
      return c;
    };
    // fresh browser per site: GPU memory from many WebGL pages crashed the renderer once (corp-services-390)
    if (sitesDone++ > 0) {
      await browser.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      browser = await launch();
    }
    let ctx = await newCtx();
    let orderUrl = "";
    let carted = false;
    let authed = false;
    const retried = new Set<string>();
    for (let ti = 0; ti < site.targets.length; ti++) {
      const t = site.targets[ti]!;
      if (PAGES.size && !PAGES.has(t.name) && !(PAGES.has("p-*") && t.name.startsWith("p-")) && !(PAGES.has("col-*") && t.name.startsWith("col-"))) continue;
      let page: Page;
      try {
        page = await ctx.newPage();
      } catch {
        await browser.close().catch(() => {});
        browser = await launch();
        ctx = await newCtx();
        authed = false;
        carted = false;
        page = await ctx.newPage();
      }
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`${m.text().slice(0, 220)} @ ${(m.location().url ?? "").replace(/^https?:\/\/[^/]+/, "").slice(0, 50)}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
      const tag = `${key}-${t.name}-${w}${SUF}`;
      try {
        if ((t.cart || t.order) && !carted) { await addToCart(page, base, site.product, site.variant); carted = true; }
        if (t.auth && !authed) { await customerLogin(page, base); authed = true; }
        let url = `${base}${t.path}`;
        if (t.preview) url = await previewUrl(site.host, t.preview);
        if (t.order) { orderUrl = await placeOrder(page, base); url = orderUrl; carted = false; }
        errors.length = 0;
        const res = await stableGoto(page, url, "load");
        await page.waitForTimeout(t.name === "home" ? 3200 : 1800);
        await page.mouse.move(w * 0.62, 320);
        let fps = "";
        if (FPS && t.name === "home") {
          const f = await measureFps(page);
          fps = ` fps=${f.fps} long>50ms=${f.long} worst=${f.worst}ms`;
          await stableGoto(page, url, "load");
          await page.waitForTimeout(3000);
          await page.mouse.move(w * 0.62, 320);
        }
        const { files, notes } = await frames(page, tag, FIRST ? 1 : Math.min(t.frames ?? MAX_FRAMES, Math.max(MAX_FRAMES, t.frames ?? 0)));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const canv = await page.evaluate(() => document.querySelectorAll("canvas").length);
        const h1 = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "(no h1)");
        fs.copyFileSync(files[0]!, path.join(OUT, `redesign-qa-a-${tag}.png`));
        if (files.length > 1) await sheet(files, path.join(OUT, `redesign-qa-a-${tag}-sheet.png`), w >= 768 ? 3 : 6);
        const lines = [`${res?.status()} ${tag} h1="${h1}" frames=${files.length} overflow=${overflow}px canvases=${canv} maxLiveInView=${notes.maxLive} errors=${errors.length}${fps}`];
        if (errors.length) lines.push(...[...new Set(errors)].slice(0, 4).map((e) => `    ERR ${e}`));
        if (notes.small.size) lines.push(`    TAP<44 (${notes.small.size}): ${[...notes.small].slice(0, 8).join(" ; ")}`);
        if (notes.imgs.size) lines.push(`    IMG: ${[...notes.imgs].slice(0, 6).join(" ; ")}`);
        if (notes.heads.size) lines.push(`    HEAD: ${[...notes.heads].slice(0, 6).join(" ; ")}`);
        if (notes.low.size) lines.push(`    CONTRAST: ${[...notes.low].slice(0, 5).join(" ; ")}`);
        report.push(...lines);
        console.log(lines.join("\n"));
      } catch (e) {
        const msg = (e as Error).message;
        // GPU / renderer crash (other agents crawl in parallel): fresh browser, retry the page once
        if (/crash|closed|disconnected/i.test(msg) && !retried.has(t.name)) {
          retried.add(t.name);
          console.log(`RETRY ${tag} after: ${msg.slice(0, 80)}`);
          await browser.close().catch(() => {});
          await new Promise((r) => setTimeout(r, 5000));
          browser = await launch();
          ctx = await newCtx();
          authed = false;
          carted = false;
          ti--;
          continue;
        }
        const line = `FAIL ${tag} ${msg.slice(0, 220)}`;
        report.push(line);
        console.log(line);
      }
      flush();
      await page.close().catch(() => {});
    }
    await ctx.close().catch(() => {});
  }
}
await browser.close();
await sheetBrowser?.close();
flush();
process.exit(0);
