/**
 * admin-polish verification: logs into the admin, visits the back-office screens at 1440×900 and 390×844, screenshots
 * the first viewport (+ optional full page), records console / hydration errors, horizontal overflow and small targets,
 * and captures the interactive states (command palette, tenant switcher, mobile drawer, dialog, toast, route skeleton).
 *   cd tooling && pnpm exec tsx qa/redesign/admin-polish-shots.ts [--only=dash-shop,palette] [--w=1440,390] [--reduce] [--full] [--tag=x]
 * → screenshots/redesign-qa-admin-<name>-<w>[-rm][-tag].png
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = (arg("only") ?? "").split(",").filter(Boolean);
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const REDUCE = process.argv.includes("--reduce");
const FULL = process.argv.includes("--full");
const TAG = arg("tag") ? `-${arg("tag")}` : "";
const OUT = path.resolve(process.cwd(), "screenshots");
const A = "http://localhost:3001";

type Target = { name: string; path: string; act?: (p: Page, w: number) => Promise<void>; full?: boolean };
const T: Target[] = [
  { name: "dash-shop", path: "/t/demo-shop/dashboard", full: true },
  { name: "dash-restaurant", path: "/t/demo-restaurant/dashboard" },
  { name: "dash-topup", path: "/t/demo-topup/dashboard" },
  { name: "dash-clinic", path: "/t/demo-clinic/dashboard" },
  { name: "dash-corporate", path: "/t/demo-corporate/dashboard" },
  { name: "dash-hotel", path: "/t/demo-hotel/dashboard" },
  { name: "dash-events", path: "/t/demo-events/dashboard" },
  { name: "customers", path: "/t/demo-shop/customers" },
  { name: "customers-empty", path: "/t/demo-corporate/customers" },
  { name: "orders", path: "/t/demo-shop/orders" },
  { name: "products", path: "/t/demo-shop/products" },
  { name: "payments", path: "/t/demo-shop/payments" },
  { name: "pages", path: "/t/demo-shop/pages" },
  { name: "media", path: "/t/demo-shop/media" },
  { name: "settings", path: "/t/demo-shop/settings" },
  { name: "team", path: "/t/demo-shop/settings/team" },
  { name: "rest-orders", path: "/t/demo-restaurant/restaurant/orders" },
  { name: "topup-orders", path: "/t/demo-topup/topup/orders" },
  { name: "bookings", path: "/t/demo-clinic/bookings" },
  { name: "events", path: "/t/demo-events/events" },
  { name: "rental", path: "/t/demo-hotel/rental/bookings" },
  { name: "console", path: "/console" },
  { name: "console-tenants", path: "/console/tenants" },
  {
    name: "palette",
    path: "/t/demo-shop/dashboard",
    act: async (p) => {
      await p.keyboard.press("Control+k");
      await p.getByRole("combobox", { name: "ค้นหาเมนู ร้าน หรือคำสั่ง" }).waitFor();
      await p.keyboard.type("ออเดอร์");
      await p.waitForTimeout(500);
    },
  },
  {
    name: "switcher",
    path: "/t/demo-shop/customers",
    act: async (p) => {
      await p.locator("header button").filter({ hasText: "Siam Atelier" }).first().click();
      await p.locator("[role=menu]").waitFor();
      await p.waitForTimeout(450);
    },
  },
  {
    name: "drawer",
    path: "/t/demo-shop/orders",
    act: async (p, w) => {
      if (w >= 1024) return;
      await p.getByRole("button", { name: "เปิดเมนู" }).click();
      await p.locator("[role=dialog] nav[aria-label='เมนูหลัก']").waitFor();
      await p.waitForTimeout(700);
    },
  },
  {
    name: "dialog",
    path: "/t/demo-shop/pages",
    act: async (p) => {
      const b = p.getByRole("button", { name: /หน้าใหม่|สร้างหน้า/ }).first();
      await b.click();
      await p.getByRole("dialog").waitFor();
      await p.waitForTimeout(600);
    },
  },
  {
    name: "toast",
    path: "/t/demo-shop/settings",
    act: async (p) => {
      await p.getByRole("button", { name: "บันทึก", exact: true }).first().click();
      await p.locator("[data-sonner-toast]").first().waitFor({ timeout: 20_000 });
      await p.waitForTimeout(500);
    },
  },
  {
    name: "skeleton",
    path: "/t/demo-shop/dashboard",
    act: async (p, w) => {
      await p.route(/_rsc=/, async (r) => {
        await new Promise((res) => setTimeout(res, 2500));
        await r.continue().catch(() => {});
      });
      if (w < 1024) {
        await p.goto(`${A}/t/demo-shop/customers`, { waitUntil: "commit" });
        await p.waitForTimeout(400);
      } else {
        await p.locator("aside a[href='/t/demo-shop/customers']").click();
        await p.waitForTimeout(900);
      }
    },
  },
];

const targets = ONLY.length ? T.filter((t) => ONLY.includes(t.name)) : T;
fs.mkdirSync(OUT, { recursive: true });

async function login(ctx: BrowserContext) {
  const p = await ctx.newPage();
  await p.goto(`${A}/login`, { waitUntil: "load", timeout: 120_000 });
  await p.fill("#email", "admin@rentweb.local");
  await p.fill("#password", "Admin1234!");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 }), p.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
  await p.close();
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];
for (const w of WIDTHS) {
  const h = w >= 1024 ? 900 : 844;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 1024 ? 2 : 1, isMobile: w < 1024, hasTouch: w < 1024, reducedMotion: REDUCE ? "reduce" : "no-preference" });
  await isolateHmr(ctx);
  await login(ctx);
  for (const t of targets) {
    const p = await ctx.newPage();
    const errs: string[] = [];
    p.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errs.push(m.text().slice(0, 220)));
    p.on("pageerror", (e) => errs.push(`pageerror ${e.message.slice(0, 220)}`));
    try {
      await stableGoto(p, `${A}${t.path}`, "load");
      await p.waitForTimeout(REDUCE ? 400 : 1600);
      if (t.act) await t.act(p, w);
      const m = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const tiny: string[] = [];
        document.querySelectorAll<HTMLElement>("a[href], button, [role=button], input:not([type=hidden]), select, textarea").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || el.closest("[aria-hidden=true]") || r.top > innerHeight) return;
          if (r.height < 36 || r.width < 36) tiny.push(`${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 18)}]${Math.round(r.width)}x${Math.round(r.height)}`);
        });
        return { sw: document.documentElement.scrollWidth, vw, h1: document.querySelectorAll("h1").length, tiny: tiny.slice(0, 6), tinyN: tiny.length };
      });
      const file = `redesign-qa-admin-${t.name}-${w}${REDUCE ? "-rm" : ""}${TAG}.png`;
      await p.screenshot({ path: path.join(OUT, file), fullPage: FULL || (!!t.full && w >= 1024) });
      const notes = [m.sw > m.vw + 1 ? `OVERFLOW ${m.sw}>${m.vw}` : "", m.h1 > 1 ? `h1×${m.h1}` : "", m.tinyN ? `small:${m.tinyN} ${m.tiny.slice(0, 3).join(" ")}` : "", errs.length ? `ERR ${[...new Set(errs)].slice(0, 2).join(" | ")}` : ""].filter(Boolean);
      report.push(`${w} ${t.name}: ${notes.join(" · ") || "ok"}`);
    } catch (e) {
      report.push(`${w} ${t.name}: FAILED ${(e as Error).message.split("\n")[0]!.slice(0, 200)}`);
    }
    await p.close();
  }
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));
