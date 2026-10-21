/**
 * sections agent verification: scroll every demo home (and a few inner pages) like a user, screenshot each viewport
 * frame and compose a contact sheet per page; collect console / hydration errors and horizontal overflow.
 *   cd tooling && pnpm exec tsx qa/redesign/sections-shots.ts [--only=shop,topup] [--w=1440|390] [--frames=14] [--url=http://…]
 * → screenshots/redesign-sections-<name>-<w>-fNN.png + screenshots/redesign-sections-<name>-<w>.png (sheet)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = new Set((arg("only") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const MAX_FRAMES = Number(arg("frames") ?? 16);
const OUT = path.resolve(process.cwd(), "screenshots");
const KEEP_FRAMES = process.argv.includes("--keep");

const SITES = ["shop", "topup", "clinic", "restaurant", "salon", "corporate", "cafe", "course", "hotel", "events"];
const PAGES: [string, string][] = arg("url")
  ? [[arg("name") ?? "custom", arg("url")!]]
  : [
      ...SITES.map((k) => [k, `http://demo-${k}.localhost:3000/`] as [string, string]),
      ["corporate-services", "http://demo-corporate.localhost:3000/services"],
      ["corporate-work", "http://demo-corporate.localhost:3000/work"],
      ["corporate-about", "http://demo-corporate.localhost:3000/about"],
      ["corporate-contact", "http://demo-corporate.localhost:3000/contact"],
    ];

async function frames(page: Page, name: string, w: number): Promise<string[]> {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  for (let i = 0; i < MAX_FRAMES; i++) {
    const f = path.join(OUT, `redesign-sections-${name}-${w}-f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const before = await page.evaluate(() => window.scrollY);
    for (let k = 0; k < 4; k++) {
      await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(900);
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

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-unsafe-swiftshader"] });
const report: string[] = [];
for (const w of WIDTHS) {
  for (const [name, url] of PAGES) {
    if (ONLY.size && !ONLY.has(name) && !ONLY.has(name.split("-")[0]!)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
    await isolateHmr(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match|Warning:/i.test(m.text())) errors.push(m.text().slice(0, 240));
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
    try {
      const res = await stableGoto(page, url, "load");
      await page.waitForTimeout(2500);
      await page.mouse.move(w * 0.6, 300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const files = await frames(page, name, w);
      const out = path.join(OUT, `redesign-sections-${name}-${w}.png`);
      await sheet(files, out, w >= 768 ? 3 : 6);
      if (!KEEP_FRAMES) for (const f of files.slice(1)) fs.unlinkSync(f);
      const canv = await page.evaluate(() => [...document.querySelectorAll("[data-scene-status]")].map((e) => (e as HTMLElement).dataset.sceneStatus).join(","));
      const line = `${res?.status()} ${name} ${w} frames=${files.length} overflow=${overflow}px scenes=[${canv}] errors=${errors.length}${errors.length ? "\n    " + [...new Set(errors)].slice(0, 6).join("\n    ") : ""}`;
      report.push(line);
      console.log(line);
    } catch (e) {
      const line = `FAIL ${name} ${w} ${(e as Error).message.slice(0, 200)}`;
      report.push(line);
      console.log(line);
    }
    await page.close();
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "redesign-sections-report.txt"), report.join("\n") + "\n");
