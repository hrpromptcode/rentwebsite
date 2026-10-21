import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
const site = process.argv[2] ?? "topup";
const w = Number(process.argv[3] ?? 390);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  const log: string[] = [];
  p.on("console", (m) => { if (m.type() === "error") log.push(`error: ${m.text().slice(0, 200)}`); });
  p.on("response", (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
  for (const path of (process.argv[4] ?? "/").split(",")) {
    log.push(`--- ${path}`);
    await stableGoto(p, `http://demo-${site}.localhost:3000${path}`, "load");
    await p.waitForTimeout(2000);
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(150); }
    await p.waitForTimeout(1500);
  }
  console.log(log.join("\n"));
  await b.close();
})();
