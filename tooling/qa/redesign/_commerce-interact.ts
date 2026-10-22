/**
 * commerce agent: interaction checks (real motion, GPU Chromium) — gallery drag / zoom, variant pill, add-to-cart morph +
 * fly-to-cart, card quick-add, FLIP on sort + density toggle, category index hover. Screenshots → screenshots/redesign-commerce-ix-*.png
 *   cd tooling && pnpm exec tsx qa/redesign/_commerce-interact.ts [--site=shop]
 */
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const site = process.argv.find((a) => a.startsWith("--site="))?.slice(7) ?? "shop";
const base = `http://demo-${site}.localhost:3000`;
const OUT = path.resolve(process.cwd(), "screenshots");
const shot = (p: Page, n: string) => p.screenshot({ path: path.join(OUT, `redesign-commerce-ix-${site}-${n}.png`) });
const res: string[] = [];
const ok = (name: string, cond: boolean, note = "") => {
  res.push(`${cond ? "PASS" : "FAIL"} ${name}${note ? ` — ${note}` : ""}`);
  console.log(res.at(-1));
};

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH" });
await isolateHmr(ctx);
const page = await ctx.newPage();
const errors: string[] = [];
page.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 200)}`));

const product = site === "shop" ? "linen-shirt-sand" : "croissant";
await stableGoto(page, `${base}/products/${product}`, "load");
await page.waitForTimeout(1500);
const stage = page.locator('[aria-roledescription="carousel"][role="region"]');
const box = (await stage.boundingBox())!;
if (site === "shop") {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - i * 24, box.y + box.height / 2, { steps: 2 });
  await shot(page, "drag-mid");
  await page.mouse.up();
  await page.waitForTimeout(900);
  const counter = (await page.locator(".rwc-num", { hasText: "/" }).last().textContent())?.trim();
  ok("gallery drag flips to the next card", !!counter?.startsWith("02"), counter ?? "");
  await shot(page, "drag-after");
  await page.keyboard.press("ArrowLeft").catch(() => {});
}
await stage.click({ position: { x: box.width / 2, y: box.height / 2 } });
const dialog = page.getByRole("dialog");
await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
ok("click opens zoom dialog", await dialog.isVisible());
await page.mouse.click(720, 450);
await page.mouse.move(900, 300);
await page.waitForTimeout(400);
await shot(page, "zoom");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok("Esc closes zoom", !(await dialog.isVisible().catch(() => false)));

if (site === "shop") {
  await page.locator("button[aria-pressed]", { hasText: /^M$/ }).first().click();
  await page.waitForTimeout(250);
  await shot(page, "variant-pill");
  ok("variant M pressed", (await page.locator("button[aria-pressed=true]").allTextContents()).includes("M"));
}
await page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click();
await page.waitForTimeout(350);
await shot(page, "fly");
const fly = await page.locator(".rwc-fly").count();
await page.waitForTimeout(1200);
const done = await page.locator('.rwc-add[data-state="done"]').count();
ok("add: fly thumbnail + ✓ morph", fly > 0 && done > 0, `fly=${fly} done=${done}`);
await shot(page, "added");

// listing: quick add + hover + FLIP
await stableGoto(page, `${base}/products`, "load");
await page.waitForTimeout(1200);
const simple = page.locator("article", { has: page.locator('button[aria-label^="ใส่ตะกร้า"]') }).first();
await simple.scrollIntoViewIfNeeded();
await simple.hover();
await page.waitForTimeout(700);
await shot(page, "card-hover");
await simple.locator('button[aria-label^="ใส่ตะกร้า"]').click();
const toast = await page.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
ok("quick add → toast", toast);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
const firstBefore = await page.locator("article h3").first().textContent();
await page.selectOption('select[name="sort"]', "price_desc");
await page.waitForURL(/sort=price_desc/, { timeout: 30000 });
await page.waitForTimeout(250);
await shot(page, "flip-mid");
await page.waitForTimeout(1200);
const firstAfter = await page.locator("article h3").first().textContent();
ok("sort soft-navigates and re-orders", firstBefore !== firstAfter, `${firstBefore} → ${firstAfter}`);
await page.getByRole("button", { name: "มุมมองภาพใหญ่" }).click();
await page.waitForTimeout(250);
await shot(page, "density-mid");
await page.waitForTimeout(900);
await shot(page, "density");

if (site === "shop") {
  await stableGoto(page, `${base}/collections`, "load");
  await page.waitForTimeout(1200);
  const row = page.locator(".rwc-index-row").nth(1);
  const rb = (await row.boundingBox())!;
  await page.mouse.move(rb.x + rb.width * 0.4, rb.y + rb.height / 2, { steps: 6 });
  await page.waitForTimeout(800);
  await shot(page, "index-hover");
  ok("index hover preview shows", (await page.locator('[data-hover-preview][data-state="in"]').count()) > 0);
}

ok("no console errors", errors.length === 0, [...new Set(errors)].slice(0, 4).join(" | "));
await browser.close();
