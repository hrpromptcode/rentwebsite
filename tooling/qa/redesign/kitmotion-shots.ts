/**
 * kitmotion lab verification: screenshots of /lab/motion at 1440×900 and 390×844 (+ reduced motion + forced
 * preloader), console / hydration errors, accessible-name and duplicate-text checks for the split / roll components.
 * Run from tooling/: pnpm exec tsx qa/redesign/kitmotion-shots.ts [--only=desktop|mobile|reduce|preloader|checks]
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "screenshots";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const errors: string[] = [];
function watch(page: Page, tag: string) {
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`[${tag}] console.${m.type()}: ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message.slice(0, 400)}`));
}

async function ctxFor(browser: Browser, w: number, h: number, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...extra });
  await isolateHmr(ctx);
  return ctx;
}

async function wheelTo(page: Page, selector: string, offset = 0) {
  const y = await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel as string);
      return el ? el.getBoundingClientRect().top + window.scrollY + (off as number) : 0;
    },
    [selector, offset] as const,
  );
  // wheel in steps so Lenis + reveals behave like a user scroll
  for (let i = 0; i < 60; i++) {
    const cur = await page.evaluate(() => window.scrollY);
    const d = y - cur;
    if (Math.abs(d) < 8) break;
    await page.mouse.wheel(0, Math.max(-700, Math.min(700, d)));
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(1300);
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/redesign-kitmotion-${name}.png` });
  console.log("shot", name);
}

async function desktop(browser: Browser) {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  watch(page, "1440");
  await stableGoto(page, `${BASE}/lab/motion`, "load");
  await page.waitForTimeout(2200);
  await page.mouse.move(720, 450);
  await page.mouse.move(900, 300, { steps: 8 });
  await page.waitForTimeout(800);
  await shoot(page, "hero-1440");
  await wheelTo(page, "section[aria-label='ตัวเลข']", -200);
  await shoot(page, "stats-1440");
  await wheelTo(page, "#text", -40);
  await shoot(page, "text-1440");
  await wheelTo(page, "#text .rw-scrub", -300);
  await shoot(page, "scrub-1440");
  await wheelTo(page, ".rw-drop", -260);
  // hover a roll link
  const roll = page.getByRole("link", { name: "Collections" });
  await roll.hover();
  await page.waitForTimeout(500);
  await shoot(page, "letterdrop-roll-1440");
  await wheelTo(page, "#media", -40);
  await page.mouse.move(500, 420, { steps: 6 });
  await page.waitForTimeout(600);
  await shoot(page, "media-1440");
  await wheelTo(page, "[data-hover-preview-root]", -200);
  const row = page.locator("[data-preview-src]").nth(1);
  const box = await row.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 10 });
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2, { steps: 10 });
    await page.waitForTimeout(700);
  }
  await shoot(page, "hoverpreview-1440");
  await wheelTo(page, "#story", 300);
  await shoot(page, "story-a-1440");
  await wheelTo(page, "#story", 1500);
  await shoot(page, "story-b-1440");
  await wheelTo(page, "#track", 200);
  await shoot(page, "track-a-1440");
  await wheelTo(page, "#track", 1400);
  await page.mouse.move(700, 500, { steps: 5 });
  await page.waitForTimeout(400);
  await shoot(page, "track-b-1440");
  await wheelTo(page, "footer", -900);
  await shoot(page, "cards-1440");
  await wheelTo(page, "footer", -200);
  await page.mouse.move(700, 700, { steps: 6 });
  await page.waitForTimeout(800);
  await shoot(page, "footer-1440");
  // overflow check
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`[1440] horizontal overflow ${overflow}px`);
  await page.close();
  await ctx.close();
}

async function mobile(browser: Browser) {
  const ctx = await ctxFor(browser, 390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, "390");
  await stableGoto(page, `${BASE}/lab/motion`, "load");
  await page.waitForTimeout(2000);
  await shoot(page, "hero-390");
  for (const [sel, name, off] of [
    ["section[aria-label='ตัวเลข']", "stats-390", -120],
    ["#text", "text-390", -20],
    ["#media", "media-390", -20],
    ["#story", "story-390", 200],
    ["#track", "track-390", 0],
    ["footer", "footer-390", -100],
  ] as const) {
    await page.evaluate(([s, o]) => {
      const el = document.querySelector(s as string);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + (o as number));
    }, [sel, off] as const);
    await page.waitForTimeout(1500);
    await shoot(page, name);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`[390] horizontal overflow ${overflow}px`);
  await page.close();
  await ctx.close();
}

async function reduce(browser: Browser) {
  const ctx = await ctxFor(browser, 1440, 900, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  watch(page, "reduce");
  await stableGoto(page, `${BASE}/lab/motion`, "load");
  await page.waitForTimeout(1200);
  await shoot(page, "reduce-hero-1440");
  // every split unit must be fully visible with no transform
  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-split-unit],[data-drop-unit],[data-gw-unit]")).filter((u) => {
      const cs = getComputedStyle(u);
      return cs.opacity !== "1" || (cs.transform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(cs.transform));
    }).length,
  );
  if (hidden) errors.push(`[reduce] ${hidden} split units not in their final state`);
  const lenis = await page.evaluate(() => document.documentElement.classList.contains("lenis"));
  if (lenis) errors.push("[reduce] Lenis is active under reduced motion");
  await page.evaluate(() => document.querySelector("#story")?.scrollIntoView());
  await page.waitForTimeout(600);
  await shoot(page, "reduce-story-1440");
  await page.close();
  await ctx.close();
}

async function preloader(browser: Browser) {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  watch(page, "preloader");
  await page.goto(`${BASE}/lab/motion?preloader=force`, { waitUntil: "commit" });
  await page.waitForSelector("html[data-preloader='on']", { timeout: 60_000 }).catch(() => {});
  await page.waitForFunction(() => Number(document.querySelector("[data-pl-count]")?.textContent ?? 0) >= 55, null, { timeout: 10_000, polling: 16 }).catch(() => {});
  await shoot(page, "preloader-1440");
  await page.waitForTimeout(1600);
  const still = await page.evaluate(() => document.documentElement.dataset.preloader ?? null);
  if (still === "on") errors.push("[preloader] still on after 2s");
  await shoot(page, "preloader-after-1440");
  await page.close();
  await ctx.close();
}

async function checks(browser: Browser) {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  watch(page, "checks");
  await stableGoto(page, `${BASE}/lab/motion`, "load");
  await page.waitForTimeout(1500);
  const expectCount = async (label: string, n: number, loc: ReturnType<Page["locator"]>) => {
    const c = await loc.count();
    if (c !== n) errors.push(`[checks] ${label}: expected ${n}, got ${c}`);
    else console.log("ok", label, c);
  };
  await expectCount('heading "เว็บไซต์ที่ขยับ อย่างมีจังหวะ"', 1, page.getByRole("heading", { level: 1, name: "เว็บไซต์ที่ขยับ อย่างมีจังหวะ", exact: true }));
  await expectCount('getByText h1 exact', 1, page.getByText("เว็บไซต์ที่ขยับ อย่างมีจังหวะ", { exact: true }));
  await expectCount('link "เริ่มดูตัวอย่าง"', 1, page.getByRole("link", { name: "เริ่มดูตัวอย่าง", exact: true }));
  await expectCount('getByText "เริ่มดูตัวอย่าง"', 1, page.getByText("เริ่มดูตัวอย่าง", { exact: true }));
  await expectCount('link "VIEW STORIES"', 1, page.getByRole("link", { name: "VIEW STORIES", exact: true }));
  await expectCount('getByText "1,250"', 1, page.getByText("1,250", { exact: true }));
  await expectCount('button "กลับขึ้นด้านบน"', 1, page.getByRole("button", { name: "กลับขึ้นด้านบน", exact: true }));
  await expectCount('button "BACK TO TOP"', 1, page.getByRole("button", { name: "BACK TO TOP", exact: true }));
  await expectCount('heading "pe-o-ple"', 1, page.getByRole("heading", { name: "pe-o-ple", exact: true }));
  // clicking a RollText label by its text must hit the link (no interceptor)
  await page.getByText("Collections", { exact: true }).click({ timeout: 10_000 }).then(
    () => console.log("ok click Collections"),
    (e) => errors.push(`[checks] click Collections: ${String(e).slice(0, 200)}`),
  );
  await page.waitForTimeout(1500);
  // StickyStory title buttons are buttons with the full title
  await expectCount('button "คลินิกความงาม"', 1, page.getByRole("button", { name: /คลินิกความงาม/ }));
  // back to top works
  await page.getByRole("button", { name: "กลับขึ้นด้านบน" }).click();
  await page.waitForTimeout(2200);
  const y = await page.evaluate(() => window.scrollY);
  if (y > 5) errors.push(`[checks] back to top left scrollY=${y}`);
  await page.close();
  await ctx.close();
}

async function theme(browser: Browser) {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  watch(page, "theme");
  await stableGoto(page, `${BASE}/lab/motion`, "load");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "candy" }).click();
  await page.waitForTimeout(800);
  await shoot(page, "theme-candy-hero-1440");
  await page.getByRole("button", { name: "porcelain" }).click();
  await wheelTo(page, "#story", 300);
  await shoot(page, "theme-porcelain-story-1440");
  await page.close();
  await ctx.close();
}

/** existing storefront pages that use the upgraded TextReveal / Magnetic / Reveal: no console / hydration errors */
async function tenants(browser: Browser) {
  for (const key of ["shop", "salon", "events"]) {
    const ctx = await ctxFor(browser, 1440, 900);
    const page = await ctx.newPage();
    watch(page, `demo-${key}`);
    await stableGoto(page, `http://demo-${key}.localhost:3000/`, "load");
    await page.waitForTimeout(2500);
    const h1 = await page.locator("h1").first().getAttribute("aria-label").catch(() => null);
    console.log(key, "h1 aria-label:", h1);
    await shoot(page, `tenant-${key}-1440`);
    await page.close();
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (!only || only === "checks") await checks(browser);
    if (!only || only === "desktop") await desktop(browser);
    if (!only || only === "mobile") await mobile(browser);
    if (!only || only === "reduce") await reduce(browser);
    if (!only || only === "preloader") await preloader(browser);
    if (!only || only === "theme") await theme(browser);
    if (only === "tenants") await tenants(browser);
  } finally {
    await browser.close();
  }
  console.log(errors.length ? `\nERRORS (${errors.length}):\n${errors.join("\n")}` : "\nno errors");
})();
