import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Walks the platform home like a person (wheel scroll, pointer sweeps, gallery drag, footer hover, back-to-top, client
 * navigation) and reads the Next.js dev indicator after every step; dumps the overlay text when an issue appears.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/redesign/_pf-issue-walk.ts [--w=1440] [--h=900] [--nohmr-guard] [--human]
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const w = Number(arg("w") ?? 1440);
const h = Number(arg("h") ?? (w < 768 ? 844 : 900));
const SHOTS = path.resolve(process.cwd(), "screenshots");
const READ = `(() => {
  const root = document.querySelector("nextjs-portal")?.shadowRoot;
  if (!root) return "no-portal";
  const b = root.querySelector("[data-issues-open]");
  return b ? (b.textContent || "").replace(/\\s+/g, " ").trim() : "";
})()`;
const OVERLAY = `(() => {
  const root = document.querySelector("nextjs-portal")?.shadowRoot;
  const d = root?.querySelector("[data-nextjs-dialog]") || root?.querySelector("[role=dialog]");
  if (!d) return "(no dialog)";
  const parts = [];
  const walk = function (n) { if (n.nodeType === 3) { const p = n.parentElement; if (p && p.tagName !== "STYLE" && n.textContent.trim()) parts.push(n.textContent.trim()); } n.childNodes.forEach(walk); };
  walk(d);
  return parts.join(" | ").slice(0, 4000);
})()`;

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const mobile = w < 768;
const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
if (!process.argv.includes("--nohmr-guard")) await isolateHmr(ctx);
if (process.argv.includes("--human")) await ctx.addInitScript({ content: 'Object.defineProperty(Navigator.prototype, "webdriver", { get: function () { return false; } });' });
const page = await ctx.newPage();
const msgs: string[] = [];
page.on("console", (m) => {
  if (m.type() === "debug" || /\[HMR\]|\[Fast Refresh\]|React DevTools/.test(m.text())) return;
  msgs.push(`[${m.type()}] ${m.text().slice(0, 500)}`);
});
page.on("pageerror", (e) => msgs.push(`[pageerror] ${e.message.slice(0, 500)}`));

let found = false;
async function check(step: string, p: Page = page) {
  const t = (await p.evaluate(READ).catch(() => "?")) as string;
  console.log(`${step.padEnd(28)} indicator="${t}" console=${msgs.length}`);
  if (t && !found) {
    found = true;
    await p.evaluate(`document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-issues-open]")?.click()`);
    await p.waitForTimeout(1500);
    console.log("OVERLAY:", await p.evaluate(OVERLAY));
    await p.screenshot({ path: path.join(SHOTS, `pf-issue-walk-${w}.png`) });
    await p.keyboard.press("Escape");
  }
}

try {
  await stableGoto(page, "http://localhost:3000/", "load");
  await page.waitForTimeout(2500);
  await check("loaded");
  if (process.argv.includes("--navonly")) {
    for (const href of ["/templates", "/", "/pricing", "/"]) {
      const a = page.locator(`header a[href="${href}"]`).first();
      if (await a.count()) await a.click().catch(() => {});
      await page.waitForTimeout(3000);
      await check(`nav ${href} (${page.url().replace("http://localhost:3000", "")})`);
    }
    for (const m of msgs) console.log("  ", m);
    process.exit(0);
  }
  // pointer sweep over the hero
  for (let i = 0; i < 12; i++) await page.mouse.move(100 + i * (w / 12), 200 + (i % 3) * 120, { steps: 4 });
  await check("hero sweep");
  // wheel scroll the whole page, sweeping the pointer as we go
  const total = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  let y = 0;
  let k = 0;
  while (y < total + 2000 && k < 400) {
    if (mobile) await page.evaluate((d) => window.scrollBy(0, d), 500);
    else await page.mouse.wheel(0, 420);
    y += 420;
    k++;
    if (k % 3 === 0) await page.mouse.move(80 + ((k * 137) % (w - 160)), 120 + ((k * 89) % (h - 240)), { steps: 3 });
    await page.waitForTimeout(110);
    if (k % 15 === 0) await check(`scroll ${k}`);
  }
  await page.waitForTimeout(1500);
  await check("bottom");
  // footer hover
  for (let i = 0; i < 10; i++) await page.mouse.move(60 + i * ((w - 120) / 10), h - 120, { steps: 5 });
  await check("footer hover");
  // gallery drag
  await page.evaluate(`document.querySelector("#templates")?.scrollIntoView()`);
  await page.waitForTimeout(1500);
  const box = await page.locator("#templates canvas").first().boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await check("gallery drag");
  // back to top
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await page.waitForTimeout(1200);
  const btt = page.getByRole("button", { name: /กลับขึ้นด้านบน/ }).first();
  if (await btt.count()) await btt.click().catch(() => {});
  await page.waitForTimeout(2000);
  await check("back to top");
  // client navigation
  for (const href of ["/pricing", "/templates", "/features", "/"]) {
    const a = page.locator(`header a[href="${href}"]`).first();
    if (await a.count()) await a.click().catch(() => {});
    else await page.goto(`http://localhost:3000${href}`);
    await page.waitForTimeout(3000);
    await check(`nav ${href}`);
  }
  console.log(`console (${msgs.length}):`);
  for (const m of msgs) console.log("  ", m);
} finally {
  await ctx.close();
  await browser.close();
}
