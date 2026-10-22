/**
 * shared1 behaviour probes (run from tooling/: pnpm exec tsx qa/redesign/shared1-probe.ts [--only=pill,announcer,onboarding,platform])
 *  - pill: phone LINE pill peeks open, then collapses after ~5 s (data-peek)
 *  - announcer: after a client navigation the route announcer reads document.title (not the page h1)
 *  - onboarding: /onboarding?template=hotel preselects the hotel card (aria-pressed) and enables "ถัดไป"
 *  - platform: hero WordCycler → ParticleMorph HUD sync via onChange (FIG.0n advances), 0 console errors
 */
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "pill,announcer,onboarding,platform").split(",");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const errors: string[] = [];
const results: string[] = [];
const watch = (p: Page, t: string) => {
  p.on("console", (m) => {
    if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`[${t}] ${m.text().slice(0, 300)}`);
  });
  p.on("pageerror", (e) => errors.push(`[${t}] pageerror ${e.message.slice(0, 300)}`));
};

if (only.includes("pill")) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  watch(p, "pill");
  await stableGoto(p, "http://demo-cafe.localhost:3000/", "load");
  const t0 = Date.now();
  const early = await p.locator("[data-floating-chat]").getAttribute("data-peek");
  await p.waitForTimeout(Math.max(0, 7000 - (Date.now() - t0)));
  const late = await p.locator("[data-floating-chat]").getAttribute("data-peek");
  const w = await p.locator("[data-floating-chat]").evaluate((e) => Math.round(e.getBoundingClientRect().width));
  await p.screenshot({ path: "screenshots/redesign-qa-shared1-pill-collapsed-390.png" });
  results.push(`pill: early data-peek=${early} → after 7s data-peek=${late}, width ${w}px ${late === "false" && w <= 60 ? "PASS" : "FAIL"}`);
  await ctx.close();
}

if (only.includes("announcer")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  watch(p, "announcer");
  await stableGoto(p, "http://demo-shop.localhost:3000/", "load");
  await p.waitForTimeout(1500);
  await p.locator('header a[href="/cart"]').first().click();
  await p.waitForURL(/\/cart$/, { timeout: 60_000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const host = document.querySelector("next-route-announcer");
    const text = host?.shadowRoot?.querySelector("#__next-route-announcer__")?.textContent ?? "";
    return { text, title: document.title, h1: document.querySelector("main h1")?.textContent?.trim() ?? "" };
  });
  results.push(`announcer: "${r.text}" title "${r.title}" h1 "${r.h1}" ${r.text === r.title ? "PASS" : "FAIL"}`);
  await ctx.close();
}

if (only.includes("onboarding")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  watch(p, "onboarding");
  await stableGoto(p, "http://localhost:3001/onboarding?template=hotel", "load");
  if (/\/login/.test(p.url())) {
    results.push(`onboarding: redirected to ${new URL(p.url()).pathname}${new URL(p.url()).search}`);
    await p.fill("#email", "admin@rentweb.local");
    await p.fill("#password", "Admin1234!");
    await p.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await p.waitForURL(/\/onboarding\?template=hotel/, { timeout: 90_000 });
  }
  await p.waitForTimeout(2000);
  const pressed = await p.locator('[data-template-card="hotel"]').getAttribute("aria-pressed");
  const others = await p.locator('button[aria-pressed="true"]').count();
  const next = await p.getByRole("button", { name: /ถัดไป/ }).isEnabled().catch(() => false);
  await p.screenshot({ path: "screenshots/redesign-qa-shared1-onboarding-preselect-1440.png" });
  results.push(`onboarding: hotel aria-pressed=${pressed}, pressed buttons=${others}, next enabled=${next} ${pressed === "true" && others === 1 && next ? "PASS" : "FAIL"}`);
  await stableGoto(p, "http://localhost:3001/onboarding", "load");
  await p.waitForTimeout(1500);
  results.push(`onboarding (no param): pressed buttons=${await p.locator('button[aria-pressed="true"]').count()} (expect 0)`);
  await ctx.close();
}

if (only.includes("platform")) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  watch(p, "platform");
  await stableGoto(p, "http://localhost:3000/", "load");
  const figs: string[] = [];
  for (let i = 0; i < 4; i++) {
    figs.push((await p.locator("p.mono-label").first().textContent().catch(() => "")) ?? "");
    await p.waitForTimeout(2700);
  }
  await p.screenshot({ path: "screenshots/redesign-qa-shared1-platform-home-1440.png" });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  const wm = await p.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".rw-wordmark [data-gw-text]");
    const box = el?.closest<HTMLElement>(".rw-wordmark");
    return el && box ? { text: Math.round(el.getBoundingClientRect().width), box: box.clientWidth, fs: getComputedStyle(el).fontSize } : null;
  });
  await p.screenshot({ path: "screenshots/redesign-qa-shared1-platform-footer-1440.png" });
  results.push(`platform: HUD ${figs.map((f) => f.replace(/\s+/g, " ").trim()).join(" | ")} ${new Set(figs).size > 1 ? "PASS" : "FAIL"}; wordmark ${JSON.stringify(wm)}`);
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join("\n")}` : "0 console errors");
