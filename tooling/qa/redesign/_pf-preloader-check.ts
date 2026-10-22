import path from "node:path";
import { chromium } from "@playwright/test";
import { isolateHmr } from "../bughunt/fixes/_dev-stable";

/** Hard load of "/" as a person (webdriver hidden): the first-visit preloader must still run after the FirstLoadOnly wrap. */
const SHOTS = path.resolve(process.cwd(), "screenshots");
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
await isolateHmr(ctx);
await ctx.addInitScript({ content: 'Object.defineProperty(Navigator.prototype, "webdriver", { get: function () { return false; } });' });
const page = await ctx.newPage();
const errs: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);
const state = await page.evaluate(() => ({ flag: (window as unknown as { __rwPreloader?: string }).__rwPreloader ?? null, css: !!document.getElementById("rw-preloader-css"), overlay: (() => { const o = document.querySelector(".rw-preloader"); return o ? getComputedStyle(o).display : "missing"; })() }));
await page.screenshot({ path: path.join(SHOTS, "pf-preloader-check-1440.png") });
await page.waitForTimeout(3500);
const after = await page.evaluate(() => ({ flag: (window as unknown as { __rwPreloader?: string }).__rwPreloader ?? null, preloaded: document.documentElement.hasAttribute("data-preloaded") }));
console.log("during", JSON.stringify(state), "after", JSON.stringify(after), "errors", errs.length, errs.join(" | "));
await browser.close();
