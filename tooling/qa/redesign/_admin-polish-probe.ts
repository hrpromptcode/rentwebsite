/** admin-polish probe: evaluate a JS expression on an admin page after login. tsx qa/redesign/_admin-polish-probe.ts <path> [w] */
import { chromium } from "@playwright/test";
import { isolateHmr } from "../bughunt/fixes/_dev-stable";
const A = "http://localhost:3001";
const path = process.argv[2] ?? "/t/demo-shop/dashboard";
const w = Number(process.argv[3] ?? 1440);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: w >= 1024 ? 900 : 844 } });
await isolateHmr(ctx);
const p = await ctx.newPage();
const errs: string[] = [];
p.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errs.push(m.text().slice(0, 1500)));
await p.goto(`${A}/login`, { waitUntil: "load", timeout: 120_000 });
await p.fill("#email", "admin@rentweb.local");
await p.fill("#password", "Admin1234!");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 }), p.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
await p.goto(`${A}${path}`, { waitUntil: "load", timeout: 120_000 });
await p.waitForTimeout(2500);
const out = await p.evaluate(() => {
  const odo = [...document.querySelectorAll(".rw-odo")].map((e) => `${(e as HTMLElement).dataset.state}:${e.querySelector(".sr-only")?.textContent}`);
  const imgs = [...document.querySelectorAll(".adm-sp-img")].map((e) => (e as HTMLImageElement).src || "empty");
  return { odo, imgs };
});
console.log(JSON.stringify(out, null, 1));
console.log("errors:", errs.length, errs.join("\n---\n").slice(0, 3000));
await b.close();
