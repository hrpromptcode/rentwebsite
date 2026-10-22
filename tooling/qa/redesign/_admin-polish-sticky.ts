/** admin-polish: sticky-header check — for each path report table containers (data-fit, trapped) and thead/tbody overlap, plus a shot. */
import { chromium } from "@playwright/test";
import { isolateHmr } from "../bughunt/fixes/_dev-stable";
const A = "http://localhost:3001";
const paths = process.argv.slice(2);
const b = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await isolateHmr(ctx);
const p = await ctx.newPage();
const errs: string[] = [];
p.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errs.push(m.text().slice(0, 600)));
p.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 600)));
await p.goto(`${A}/login`, { waitUntil: "load", timeout: 120_000 });
await p.fill("#email", "admin@rentweb.local");
await p.fill("#password", "Admin1234!");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 }), p.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
let i = 0;
for (const path of paths) {
  await p.goto(`${A}${path}`, { waitUntil: "load", timeout: 120_000 });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main [data-slot="table-container"]')].map((el) => {
      const th = el.querySelector("thead th");
      const tr = el.querySelector("tbody tr");
      const thb = th?.getBoundingClientRect();
      const trb = tr?.getBoundingClientRect();
      return { fit: el.dataset.fit, thTop: thb && Math.round(thb.top), thBottom: thb && Math.round(thb.bottom), rowTop: trb && Math.round(trb.top), overlap: !!(thb && trb && thb.bottom > trb.top + 1) };
    }),
  );
  console.log(path, JSON.stringify(out));
  await p.screenshot({ path: `screenshots/redesign-qa-admin-sticky-${i++}.png` });
  // scroll check: page scroll 400 → sticky th of fit tables sits at topbar
  await p.mouse.wheel(0, 500);
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => [window.scrollY, ...[...document.querySelectorAll<HTMLElement>('main [data-slot="table-container"][data-fit="1"] thead th:first-child')].map((t) => Math.round(t.getBoundingClientRect().top))]);
  console.log("  after scroll th tops:", JSON.stringify(s));
}
console.log("errors:", errs.length, errs.join("\n---\n").slice(0, 3000));
await b.close();
