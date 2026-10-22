/**
 * topup agent verification (phase 2 hi-end redesign): screenshots of every top-up route on demo-topup at 1440 + 390,
 * console / hydration errors, horizontal overflow, live canvases per page.
 *   cd tooling && pnpm exec tsx qa/redesign/topup-shots.ts [--only=home,games,game,steam,status,order,wallet,account] [--w=1440,390]
 *        [--reduce] [--full] [--frames=12] [--tag=x]
 * Signed-in pages log in with the dev OTP (test phone below, a demo-only customer). Orders come from the last journey run
 * (qa/topup-journey-results.json) — run tooling/qa/topup-journey.ts first.
 * → screenshots/redesign-topup-<page>-<w>[-reduce].png (full page) or -fNN frames + a contact sheet
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = new Set((arg("only") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const REDUCE = process.argv.includes("--reduce");
const FULL = process.argv.includes("--full");
const MAX_FRAMES = Number(arg("frames") ?? 12);
const TAG = arg("tag") ? `-${arg("tag")}` : "";
const BASE = "http://demo-topup.localhost:3000";
const OUT = path.resolve(process.cwd(), "screenshots");
// demo-only customers for signed-in screenshots (a fresh random phone per login: the dev OTP endpoint rate-limits repeats)
const testPhone = () => `086${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

type Orders = { apiOrder: { number: string; k: string }; stockOrder: { number: string; k: string }; walletOrder: { number: string; k: string }; manualOrder: { number: string; k: string } };
let orders: Orders | null = null;
try {
  orders = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "qa/topup-journey-results.json"), "utf8")).orders as Orders;
} catch {
  /* no journey run yet */
}

const PAGES: Array<{ name: string; path: string; login?: boolean }> = [
  { name: "home", path: "/" },
  { name: "games", path: "/games" },
  { name: "game", path: "/games/rov" },
  { name: "game-in", path: "/games/rov", login: true },
  { name: "steam", path: "/games/steam-wallet", login: true },
  { name: "roblox", path: "/games/roblox" },
  { name: "status", path: "/topup/status" },
  ...(orders ? [{ name: "status-found", path: `/topup/status?number=${orders.apiOrder.number}` }] : []),
  { name: "status-miss", path: "/topup/status?number=TP-999999" },
  ...(orders
    ? [
        { name: "order-code", path: `/topup/${orders.stockOrder.number}?k=${encodeURIComponent(orders.stockOrder.k)}` },
        { name: "order-manual", path: `/topup/${orders.manualOrder.number}?k=${encodeURIComponent(orders.manualOrder.k)}` },
        { name: "order-public", path: `/topup/${orders.apiOrder.number}` },
      ]
    : []),
  { name: "wallet", path: "/wallet", login: true },
  { name: "account", path: "/account/topups", login: true },
  { name: "games-empty", path: "/games?q=zzzz" },
];

async function login(ctx: BrowserContext) {
  const p = await ctx.newPage();
  await stableGoto(p, `${BASE}/account/login?next=${encodeURIComponent("/wallet")}`);
  await p.getByLabel("เบอร์โทรศัพท์").fill(testPhone());
  await p.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const code = ((await p.getByText(/รหัสของคุณคือ/).locator("span").textContent({ timeout: 60_000 })) ?? "").trim();
  await p.locator("#otp-code").fill(code);
  const name = p.locator("#otp-name");
  if (await name.count()) await name.fill("ทดสอบ ดีไซน์").catch(() => {});
  await p.getByRole("button", { name: "ยืนยัน" }).click();
  await p.waitForURL((u) => u.pathname.startsWith("/wallet"), { timeout: 120_000 });
  await p.close();
}

async function frames(page: Page, name: string): Promise<string[]> {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  for (let i = 0; i < MAX_FRAMES; i++) {
    const f = path.join(OUT, `redesign-topup-${name}-f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const before = await page.evaluate(() => window.scrollY);
    for (let k = 0; k < 4; k++) {
      await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => window.scrollY);
    if (after - before < 20) break;
  }
  return files;
}

async function sheet(files: string[], out: string, cols: number) {
  const cells = files.map((f) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${path.basename(f)}</figcaption></figure>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1d1d1f;color:#bbb;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
  const tmp = path.join(OUT, `.sheet-topup-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
  await p.goto(pathToFileURL(tmp).href);
  await p.waitForLoadState("load");
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
  fs.unlinkSync(tmp);
  if (!process.argv.includes("--keep")) for (const f of files) fs.unlinkSync(f);
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];
for (const w of WIDTHS) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: REDUCE ? "reduce" : "no-preference" });
  await isolateHmr(ctx);
  const wanted = PAGES.filter((pg) => !ONLY.size || ONLY.has(pg.name) || ONLY.has(pg.name.split("-")[0]!));
  let loggedIn = false;
  // signed-out pages first, then log in once for the rest
  for (const pg of [...wanted.filter((x) => !x.login), ...wanted.filter((x) => x.login)]) {
    if (pg.login && !loggedIn) {
      await login(ctx);
      loggedIn = true;
    }
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(m.text().slice(0, 240));
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
    const name = `${pg.name}-${w}${REDUCE ? "-reduce" : ""}${TAG}`;
    try {
      const res = await stableGoto(page, `${BASE}${pg.path}`, "load");
      await page.waitForTimeout(3000);
      if (!mobile) await page.mouse.move(w * 0.62, 380);
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        canvases: document.querySelectorAll("canvas").length,
        scenes: Array.from(document.querySelectorAll("[data-scene-status]")).map((e) => e.getAttribute("data-scene-status")).join(","),
        h1: Array.from(document.querySelectorAll("h1")).map((h) => (h.getAttribute("aria-label") ?? h.textContent ?? "").trim().slice(0, 50)).join(" | "),
      }));
      if (FULL || pg.login || pg.name.startsWith("order") || pg.name.startsWith("status")) {
        // operational pages: one full-page shot (no scroll choreography to capture)
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `redesign-topup-${name}.png`), fullPage: true });
      } else {
        const files = await frames(page, name);
        await sheet(files, path.join(OUT, `redesign-topup-${name}.png`), mobile ? 6 : 3);
      }
      report.push(`${name}: HTTP ${res?.status()} overflow=${info.overflow}px canvases=${info.canvases} scenes=[${info.scenes}] h1="${info.h1}" errors=${errors.length}${errors.length ? `\n    ${[...new Set(errors)].slice(0, 4).join("\n    ")}` : ""}`);
    } catch (e) {
      report.push(`${name}: CRASH ${(e as Error).message.split("\n")[0]}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));
