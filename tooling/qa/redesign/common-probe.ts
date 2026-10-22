/**
 * common agent: print full console / page errors for one URL (optionally after admin login).
 *   cd tooling && pnpm exec tsx qa/redesign/common-probe.ts <url> [--admin] [--w=390]
 */
import { chromium } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const url = process.argv[2]!;
const admin = process.argv.includes("--admin");
const w = Number(process.argv.find((a) => a.startsWith("--w="))?.slice(4) ?? 1440);
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 } });
await isolateHmr(ctx);
const page = await ctx.newPage();
const out: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") out.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => out.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
if (admin) {
  await stableGoto(page, "http://localhost:3001/login", "load");
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
  out.length = 0;
}
await stableGoto(page, url, "load");
await page.waitForTimeout(2500);
console.log(out.join("\n\n").slice(0, 6000) || "no errors");
await browser.close();
