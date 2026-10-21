import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const url = process.argv[2] ?? "http://demo-topup.localhost:3000/";
const w = Number(process.argv[3] ?? 390);
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768 });
await isolateHmr(ctx);
const p = await ctx.newPage();
p.on("response", (r) => r.status() >= 400 && console.log("HTTP", r.status(), r.url().slice(0, 200)));
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("console", m.type(), m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 300)));
await stableGoto(p, url, "load");
for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 700); await p.waitForTimeout(250); }
await p.waitForTimeout(1500);
await b.close();
