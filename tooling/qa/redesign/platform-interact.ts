import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * Interaction checks for the platform pages (filters, preset playground, pricing toggle, FAQ, mobile menu, 404 links).
 *   cd tooling && pnpm exec tsx qa/redesign/platform-interact.ts
 */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const results: string[] = [];
const ok = (name: string, pass: boolean, extra = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
const errors: string[] = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));

  // /templates filter
  await stableGoto(page, "http://localhost:3000/templates", "load");
  const visible = () => page.locator("[data-tpl-card]:not([hidden])").count();
  const all = await visible();
  await page.getByRole("button", { name: /^จองคิว/ }).click();
  await page.waitForTimeout(1200);
  const booking = await visible();
  ok("templates filter จองคิว", all === 10 && booking === 3, `${all} → ${booking}`);
  await page.getByRole("button", { name: /^ทั้งหมด/ }).click();
  await page.waitForTimeout(1200);
  ok("templates filter ทั้งหมด", (await visible()) === 10);
  await page.getByRole("button", { name: /^ขายของ/ }).click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, "redesign-platform-templates-filter-1440.png") });
  ok("templates demo links open new tab", (await page.locator('a[target="_blank"][href*="demo-shop"]').count()) >= 1);

  // /templates/shop preset playground
  await stableGoto(page, "http://localhost:3000/templates/shop", "load");
  const before = await page.locator("ul[aria-label^='ชุดสี'] li").first().textContent();
  await page.getByRole("radio", { name: /แคนดี้/ }).click();
  await page.waitForTimeout(500);
  const after = await page.locator("ul[aria-label^='ชุดสี'] li").first().textContent();
  ok("preset playground recolours palette", before !== after, `${before?.trim()} → ${after?.trim()}`);
  const glow = await page.evaluate(() => getComputedStyle(document.querySelector(".pf-devices")!).getPropertyValue("--dev-glow").trim());
  ok("preset playground recolours device glow", glow.length > 0, glow);
  ok("template CTA ใช้เทมเพลตนี้", (await page.getByRole("link", { name: "ใช้เทมเพลตนี้" }).count()) >= 1);

  // /pricing toggle + FAQ
  await stableGoto(page, "http://localhost:3000/pricing", "load");
  await page.getByRole("radio", { name: "รายปี" }).click();
  await page.waitForTimeout(1500);
  const yearlyText = await page.locator("#plans").innerText();
  ok("pricing yearly toggle", /฿3,900|฿9,900/.test(yearlyText) && /\/ปี/.test(yearlyText));
  const q = page.getByRole("button", { name: /เปลี่ยนแพ็กเกจได้ไหม/ });
  await q.click();
  ok("billing FAQ expands", (await q.getAttribute("aria-expanded")) === "true");
  const signupLinks = await page.locator('a[href*="/signup?plan="]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  ok("plan CTAs → signup?plan=", signupLinks.length >= 3, signupLinks.slice(0, 3).join(" "));

  // home: hero CTAs + header links
  await stableGoto(page, "http://localhost:3000/", "load");
  ok("hero signup CTA", (await page.getByRole("link", { name: "เริ่มทดลองฟรี 14 วัน" }).getAttribute("href"))?.endsWith("/signup") === true);
  ok("header CTA", (await page.getByRole("link", { name: "เริ่มฟรี 14 วัน" }).first().getAttribute("href"))?.endsWith("/signup") === true);
  ok("header login", (await page.getByRole("link", { name: "เข้าสู่ระบบ" }).first().getAttribute("href"))?.endsWith("/login") === true);
  ok("single h1 on home", (await page.locator("h1").count()) === 1);
  await page.close();
  await ctx.close();

  // mobile menu
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await isolateHmr(m);
  const mp = await m.newPage();
  await stableGoto(mp, "http://localhost:3000/features", "load");
  await mp.getByRole("button", { name: "เมนู" }).click();
  await mp.waitForTimeout(900);
  await mp.screenshot({ path: path.join(SHOTS, "redesign-platform-menu-390.png") });
  const open = await mp.locator("#pf-mobile-menu").getAttribute("data-open");
  ok("mobile menu opens", open === "true");
  const current = await mp.locator('#pf-mobile-menu a[aria-current="page"]').textContent().catch(() => null);
  ok("mobile menu marks current page", !!current && current.includes("ฟีเจอร์"), current ?? "");
  await mp.keyboard.press("Escape");
  await mp.waitForTimeout(400);
  ok("mobile menu closes on Escape", (await mp.locator("#pf-mobile-menu").getAttribute("data-open")) === "false");
  await mp.close();
  await m.close();
} finally {
  await browser.close();
}
for (const r of results) console.log(r);
console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 6)) console.log("  ", e);
