import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * "Daybreak" home interaction checks (1440): hero pointer tilt + screen swap, CTA hover shine, pricing yearly toggle + hot card hover,
 * FAQ open, gallery hover label. → tooling/screenshots/pf-light-ix-*.png
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/platform-light-interact.ts
 */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await stableGoto(page, "http://localhost:3000/", "load");
  await page.waitForTimeout(1500);

  // hero: pointer to the top-left → the rig tilts; screens follow the word cycler
  await page.mouse.move(300, 200, { steps: 8 });
  await page.waitForTimeout(900);
  const stage = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".pf-stage");
    return { px: s?.style.getPropertyValue("--px"), py: s?.style.getPropertyValue("--py"), href: s?.getAttribute("href"), url: document.querySelector(".pf-browser__url")?.textContent };
  });
  await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-hero-tilt-a.png") });
  await page.mouse.move(1300, 760, { steps: 12 });
  await page.waitForTimeout(3200);
  const stage2 = await page.evaluate(() => ({ href: document.querySelector(".pf-stage")?.getAttribute("href"), url: document.querySelector(".pf-browser__url")?.textContent, inImgs: document.querySelectorAll(".pf-browser__screen img[data-state='in']").length }));
  await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-hero-tilt-b.png") });
  console.log("hero tilt", JSON.stringify(stage), "→", JSON.stringify(stage2));

  // CTA hover (shine + gradient shift)
  const cta = page.locator(".pf-hero .pf-btn[data-variant='primary']").first();
  await cta.hover();
  await page.waitForTimeout(450);
  const box = await cta.boundingBox();
  if (box) await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-cta-hover.png"), clip: { x: box.x - 30, y: box.y - 30, width: box.width + 260, height: box.height + 60 } });

  // pricing: yearly + hover the recommended plan
  await page.evaluate(() => document.getElementById("pricing")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(1200);
  await page.getByRole("radio", { name: "รายปี" }).click();
  await page.waitForTimeout(1500);
  const hot = page.locator("[data-hot='true']").first();
  const hb = await hot.boundingBox();
  if (hb) await page.mouse.move(hb.x + hb.width * 0.75, hb.y + hb.height * 0.3, { steps: 6 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-pricing-yearly.png") });

  // FAQ: open the 3rd question
  const q = page.locator("#faq-q-2");
  await q.scrollIntoViewIfNeeded();
  await q.click();
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById("faq-title")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(600);
  console.log("faq expanded", await q.getAttribute("aria-expanded"));
  await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-faq.png") });

  // gallery hover label
  await page.evaluate(() => document.getElementById("templates")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(2500);
  await page.mouse.move(720, 760, { steps: 10 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, "pf-light-ix-gallery-hover.png") });
  console.log("gallery", JSON.stringify(await page.evaluate(() => ({ status: document.querySelector("#templates [data-scene-status]")?.getAttribute("data-scene-status"), label: document.querySelector(".rw3d-gallery-label")?.getAttribute("data-visible") }))));
  await ctx.close();
} finally {
  await browser.close();
}
console.log("errors", errors.length, errors.slice(0, 5));
