/** qa-c: room card without photos (owner just added a type) → tonal plate, not a grey box. cd tooling && pnpm exec tsx qa/redesign/_qac-emptyroom.ts */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768 });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
  await stableGoto(page, "http://demo-hotel.localhost:3000/rooms", "load");
  await page.waitForTimeout(2500);
  // no photo-less type in the demo right now → swap the first card's media for the same markup SwapMedia renders without a photo
  if (!(await page.locator(".rw-room-empty").count()))
    await page.evaluate(() => {
      const m = document.querySelector(".rw-room-media");
      if (!m) return;
      m.classList.add("rw-room-empty");
      m.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" class="absolute top-[38%] left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 opacity-60"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>';
    });
  const el = page.locator(".rw-room-empty").first();
  const n = await page.locator(".rw-room-empty").count();
  if (n) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const card = el.locator("xpath=ancestor::*[self::article or self::li][1]");
    await (await card.count() ? card : el).screenshot({ path: `../tooling/screenshots/redesign-qa-c-hotel-rooms-empty-${w}.png` });
  }
  console.log(`${w}: empty plates=${n} errors=${errs.length} ${errs.join(" | ")}`);
  await ctx.close();
}
await b.close();
