import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * kit3d lab verification: screenshots of each plate on /lab/3d at 1440×900 and 390×844, console/hydration errors,
 * scene status per plate and a rough FPS reading (rAF counter in the lab page, window.__rwFps).
 *   pnpm --filter @rentweb/tooling exec tsx qa/redesign/kit3d-shots.ts [--only=gallery,tunnel] [--w=1440] [--preset=midnight] [--gpu]
 * → tooling/screenshots/redesign-kit3d-<plate>-<w>.png
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = new Set((arg("only") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const PRESET = arg("preset");
const SHOTS = path.resolve(process.cwd(), "screenshots");
const URL = "http://localhost:3000/lab/3d";
const VPS: Record<number, { width: number; height: number }> = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };

const browser = await chromium.launch({
  args: !process.argv.includes("--swiftshader") ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-unsafe-webgpu"] : ["--ignore-gpu-blocklist"],
});

async function plates(page: Page): Promise<string[]> {
  return page.$$eval("main > section[id]", (els) => els.map((e) => e.id));
}

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: VPS[w] ?? { width: w, height: 900 }, deviceScaleFactor: 1 });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) errors.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
  await stableGoto(page, URL, "load");
  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!g) return "no-webgl2";
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(`[${w}] renderer: ${renderer}`);
  if (PRESET) {
    await page.selectOption('select[aria-label="preset"]', PRESET);
    await page.waitForTimeout(400);
  }
  const ids = await plates(page);
  for (const id of ids) {
    if (ONLY.size && ![...ONLY].some((o) => id.includes(o))) continue;
    const el = page.locator(`#${id}`);
    if (id === "tunnel") {
      // sticky scroll scene: shoot the viewport at two scroll depths
      for (const f of [0.3, 0.62]) {
        await el.evaluate((s, frac) => {
          const r = s.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + r.top + r.height * frac, behavior: "instant" as ScrollBehavior });
        }, f);
        await page.waitForTimeout(3200);
        const status = await el.evaluate((s) => Array.from(s.querySelectorAll("[data-scene-status]"), (n) => n.getAttribute("data-scene-status")).join(","));
        const fps = await page.evaluate(() => (window as unknown as { __rwFps?: number }).__rwFps ?? -1);
        const file = path.join(SHOTS, `redesign-kit3d-tunnel-${Math.round(f * 100)}-${w}.png`);
        await page.screenshot({ path: file });
        console.log(`[${w}] tunnel@${f}: status=${status} fps=${fps} → ${path.basename(file)}`);
      }
      continue;
    }
    await el.scrollIntoViewIfNeeded();
    // let the scene mount (idle callback), load textures, fade in
    await page.waitForTimeout(3200);
    const fps = await page.evaluate(() => (window as unknown as { __rwFps?: number }).__rwFps ?? -1);
    const status = await el.evaluate((s) => Array.from(s.querySelectorAll("[data-scene-status]"), (n) => n.getAttribute("data-scene-status")).join(","));
    const file = path.join(SHOTS, `redesign-kit3d-${id}-${w}.png`);
    await el.screenshot({ path: file, animations: "allow" });
    console.log(`[${w}] ${id}: status=${status} fps=${fps} → ${path.basename(file)}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`[${w}] horizontal overflow: ${overflow}px`);
  console.log(`[${w}] errors: ${errors.length ? "\n  " + errors.join("\n  ") : "none"}`);
  await page.close();
  await ctx.close();
}
await browser.close();
