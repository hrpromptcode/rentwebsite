import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * kit3d behaviour checks on /lab/3d:
 *  1. reduced motion → gallery CSS strip, tunnel static list, orb cue list, no errors
 *  2. no WebGL (--disable-3d-apis) → posters everywhere, gallery strip visible, links focusable
 *  3. context loss → that scene falls back to its poster ("lost")
 *  4. CurvedGallery interaction: hover label, drag rotation, Tab focus rotates + label, click navigates (hash)
 *  5. theme switch (porcelain light) re-colours scenes without errors
 *   pnpm --filter @rentweb/tooling exec tsx qa/redesign/kit3d-checks.ts [--only=1,2,3,4,5]
 */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const URL = "http://localhost:3000/lab/3d";
const only = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "1,2,3,4,5").split(","));
const GPU = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"];
const results: string[] = [];
const ok = (name: string, pass: boolean, info = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${info ? " — " + info : ""}`);

async function open(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await stableGoto(page, URL, "load");
  return { ctx, page, errors };
}
const status = (page: Page, id: string) => page.locator(`#${id}`).evaluate((s) => Array.from(s.querySelectorAll("[data-scene-status]"), (n) => n.getAttribute("data-scene-status")).join(","));
async function visit(page: Page, id: string, wait = 2500) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(wait);
}

if (only.has("1")) {
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page, errors } = await open(browser, { reducedMotion: "reduce" });
  await visit(page, "gallery");
  ok("RM gallery → poster + visible strip", (await status(page, "gallery")) === "poster" && (await page.locator("#gallery .rw3d-strip").getAttribute("data-mode")) === "strip");
  await page.locator("#gallery").screenshot({ path: path.join(SHOTS, "redesign-kit3d-rm-gallery-1440.png") });
  await visit(page, "tunnel");
  const tunnelH = await page.locator("#tunnel .rw3d-tunnel").evaluate((e) => e.getBoundingClientRect().height);
  const listVisible = await page.locator("#tunnel ol").evaluate((e) => e.getBoundingClientRect().height > 50);
  ok("RM tunnel → short static list", tunnelH < 1800 && listVisible, `height ${Math.round(tunnelH)}px`);
  await page.locator("#tunnel").screenshot({ path: path.join(SHOTS, "redesign-kit3d-rm-tunnel-1440.png") });
  await visit(page, "breath");
  ok("RM breathing orb → cue list", (await page.locator("#breath .rw3d-breath-list li").count()) === 3);
  await visit(page, "morph");
  const ms = await status(page, "morph");
  ok("RM particle morph → static frame or poster", ms === "live" || ms === "poster", ms);
  ok("RM no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("2")) {
  const browser = await chromium.launch({ args: ["--disable-3d-apis", "--disable-webgl", "--disable-webgl2"] });
  const { ctx, page, errors } = await open(browser);
  const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl"));
  await visit(page, "gallery");
  ok("noGL gallery → poster + strip", !webgl && (await status(page, "gallery")) === "poster" && (await page.locator("#gallery .rw3d-strip").getAttribute("data-mode")) === "strip", `webgl=${webgl}`);
  await page.locator("#gallery").screenshot({ path: path.join(SHOTS, "redesign-kit3d-nogl-gallery-1440.png") });
  await visit(page, "objects-pastry", 1500);
  ok("noGL objects → poster", (await status(page, "objects-pastry")) === "poster");
  await visit(page, "tunnel", 1500);
  ok("noGL tunnel → poster (CSS rings)", (await status(page, "tunnel")) === "poster");
  await page.screenshot({ path: path.join(SHOTS, "redesign-kit3d-nogl-tunnel-1440.png") });
  await visit(page, "ticket", 1500);
  await page.locator("#ticket").screenshot({ path: path.join(SHOTS, "redesign-kit3d-nogl-ticket-1440.png") });
  ok("noGL canvases mounted = 0", (await page.locator("canvas").count()) === 0);
  ok("noGL no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("3")) {
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page, errors } = await open(browser);
  await visit(page, "morph", 3000);
  const before = await status(page, "morph");
  await page.locator("#morph canvas").evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext("webgl2") as WebGL2RenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await page.waitForTimeout(800);
  const after = await status(page, "morph");
  ok("context loss → fallback", before === "live" && after === "lost", `${before} → ${after}`);
  ok("context loss no page errors", errors.filter((e) => !/context/i.test(e)).length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("4")) {
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page, errors } = await open(browser);
  await visit(page, "gallery", 3500);
  const box = (await page.locator("#gallery .rw3d-gallery").boundingBox())!;
  // hover a card near the centre of the band
  const label = page.locator("#gallery .rw3d-gallery-label");
  for (const fx of [0.5, 0.4, 0.6, 0.33, 0.67]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.42, { steps: 4 });
    await page.waitForTimeout(700);
    if ((await label.getAttribute("data-visible")) === "true") break;
  }
  const labelVisible = (await label.getAttribute("data-visible")) === "true";
  const labelText = await label.locator("strong").textContent();
  ok("hover shows DOM label", labelVisible && !!labelText, labelText ?? "");
  await page.locator("#gallery").screenshot({ path: path.join(SHOTS, "redesign-kit3d-gallery-hover-1440.png") });
  // drag
  const imgBefore = await page.locator("#gallery canvas").screenshot();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.42);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(box.x + box.width * (0.7 - i * 0.03), box.y + box.height * 0.42, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const imgAfter = await page.locator("#gallery canvas").screenshot();
  ok("drag rotates the ring", !imgBefore.equals(imgAfter));
  ok("drag did not navigate", !page.url().includes("#open-"));
  // keyboard: focus a link in the mirror
  await page.mouse.move(5, 5);
  await page.locator('#gallery a[data-gallery-index="3"]').focus();
  await page.waitForTimeout(1500);
  const focusLabel = await label.locator("strong").textContent();
  const focusVis = (await label.getAttribute("data-focus")) === "true";
  ok("focus rotates + labels the card", focusVis && focusLabel === "บ้านริม", `${focusLabel}`);
  await page.locator("#gallery").screenshot({ path: path.join(SHOTS, "redesign-kit3d-gallery-focus-1440.png") });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  ok("Enter on focused link navigates", page.url().endsWith("#open-restaurant"), page.url());
  // click on the canvas card (reset the hash first so the assertion is meaningful)
  await page.evaluate(() => history.replaceState(null, "", location.pathname));
  await page.locator("#gallery").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.mouse.click(box.x + box.width * 0.5, (await page.locator("#gallery .rw3d-gallery").boundingBox())!.y + box.height * 0.42);
  await page.waitForTimeout(500);
  ok("click on a card navigates", /#open-/.test(page.url()), page.url());
  ok("interaction no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("5")) {
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page, errors } = await open(browser);
  await page.selectOption('select[aria-label="preset"]', "porcelain");
  await page.waitForTimeout(600);
  for (const id of ["gallery", "morph", "objects-clinic", "backdrop-aurora", "backdrop-mesh", "tunnel", "cards-orbit", "breath"]) {
    if (id === "tunnel") {
      await page.locator("#tunnel").evaluate((s) => window.scrollTo({ top: window.scrollY + s.getBoundingClientRect().top + s.getBoundingClientRect().height * 0.4, behavior: "instant" as ScrollBehavior }));
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SHOTS, `redesign-kit3d-light-${id}-1440.png`) });
      continue;
    }
    await visit(page, id, 3000);
    await page.locator(`#${id}`).screenshot({ path: path.join(SHOTS, `redesign-kit3d-light-${id}-1440.png`) });
  }
  // live re-theme while a scene is mounted
  await visit(page, "backdrop-aurora", 2000);
  const a = await page.locator("#backdrop-aurora canvas").screenshot();
  await page.selectOption('select[aria-label="preset"]', "neon");
  await page.waitForTimeout(800);
  const b = await page.locator("#backdrop-aurora canvas").screenshot();
  ok("live theme switch recolours the canvas", !a.equals(b));
  ok("theme no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("6")) {
  // unmount far away + remount: must come back live (r3f force-loses the context on unmount; must not count as "lost")
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page, errors } = await open(browser);
  await visit(page, "gallery", 3000);
  const s1 = await status(page, "gallery");
  await visit(page, "posters", 2500);
  const canvases = await page.locator("canvas").count();
  await visit(page, "gallery", 3500);
  const s2 = await status(page, "gallery");
  ok("remount after scrolling away is live", s1 === "live" && s2 === "live", `${s1} → ${s2}, canvases while away: ${canvases}`);
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.goBack({ waitUntil: "load" });
  await visit(page, "gallery", 3500);
  ok("back navigation renders live", (await status(page, "gallery")) === "live");
  ok("remount no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  await browser.close();
}

if (only.has("7")) {
  // ParticleMorph shapes via the controlled plate buttons
  const browser = await chromium.launch({ args: GPU });
  const { ctx, page } = await open(browser);
  await visit(page, "morph-controlled", 3000);
  const buttons = page.locator("#morph-controlled button");
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    await buttons.nth(i).click();
    await page.waitForTimeout(2600);
    await page.locator("#morph-controlled").screenshot({ path: path.join(SHOTS, `redesign-kit3d-morph-shape${i}-1440.png`) });
  }
  ok("morph shapes captured", n > 0, `${n}`);
  await ctx.close();
  await browser.close();
}

console.log(results.join("\n"));
