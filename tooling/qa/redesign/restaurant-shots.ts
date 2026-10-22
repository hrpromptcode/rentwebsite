/**
 * restaurant agent verification: screenshots of every restaurant route (demo-restaurant) at 1440 and 390, console /
 * hydration errors, horizontal overflow and canvas count; optional home contact sheet, flows and a reduced-motion pass.
 *   cd tooling && pnpm exec tsx qa/redesign/restaurant-shots.ts [--pages=menu,order,reserve,lookup,locked,table,about,contact] [--home] [--flows] [--w=1440,390] [--reduce] [--full]
 * → screenshots/redesign-restaurant-<page>-<w>[-reduce].png
 */
import "../../load-env";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PAGES = new Set((arg("pages") ?? "").split(",").filter(Boolean));
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const REDUCE = process.argv.includes("--reduce");
const HOME = process.argv.includes("--home");
const FLOWS = process.argv.includes("--flows");
const FULL = process.argv.includes("--full");
const OUT = path.resolve(process.cwd(), "screenshots");
const BASE = "http://demo-restaurant.localhost:3000";
const want = (p: string) => (!PAGES.size && !HOME && !FLOWS) || PAGES.has(p);

async function tableToken(): Promise<string> {
  const { and, asc, eq, getAdminDb, tenants, diningTables } = await import("@rentweb/db");
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-restaurant")).limit(1);
  if (!t) return "";
  const rows = await db.select({ name: diningTables.name, qrToken: diningTables.qrToken }).from(diningTables).where(and(eq(diningTables.tenantId, t.id), eq(diningTables.active, true))).orderBy(asc(diningTables.sort));
  return rows.find((r) => r.name === "A8")?.qrToken ?? rows[0]?.qrToken ?? "";
}

async function frames(page: Page, base: string, max = 18): Promise<string[]> {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  for (let i = 0; i < max; i++) {
    const f = path.join(OUT, `${base}-f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const before = await page.evaluate(() => window.scrollY);
    for (let k = 0; k < 4; k++) {
      await page.mouse.wheel(0, Math.round((vh * 0.85) / 4));
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(1100);
    const after = await page.evaluate(() => window.scrollY);
    if (after - before < 20) break;
  }
  return files;
}

async function sheet(files: string[], out: string, cols: number) {
  const cells = files.map((f) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${path.basename(f)}</figcaption></figure>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1d1d1f;color:#bbb;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style></body></html>`;
  const tmp = path.join(OUT, `.sheet-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
  await p.goto(pathToFileURL(tmp).href);
  await p.waitForLoadState("load");
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
  fs.unlinkSync(tmp);
}

const token = await tableToken();
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];
const sfx = REDUCE ? "-reduce" : "";

async function measure(page: Page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    canvases: document.querySelectorAll("canvas").length,
    scenes: [...document.querySelectorAll("[data-scene-status]")].map((e) => (e as HTMLElement).dataset.sceneStatus).join(","),
  }));
}

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768, reducedMotion: REDUCE ? "reduce" : "no-preference", locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(`${m.text().slice(0, 200)} @ ${(m.location().url ?? "").replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

  const log = (tag: string, status: number | undefined, m: { overflow: number; canvases: number; scenes: string }, before: number) => {
    const errs = errors.slice(before);
    const line = `${status ?? "-"} ${tag} overflow=${m.overflow}px canvases=${m.canvases} scenes=[${m.scenes}] errors=${errs.length}${errs.length ? "\n    " + [...new Set(errs)].slice(0, 5).join("\n    ") : ""}`;
    report.push(line);
    console.log(line);
  };

  const visit = async (name: string, url: string, after?: (p: Page) => Promise<void>) => {
    const tag = `${name}-${w}${sfx}`;
    try {
      const before = errors.length;
      const res = await stableGoto(page, url, "load");
      await page.waitForTimeout(1800);
      if (after) await after(page);
      const m = await measure(page);
      await page.screenshot({ path: path.join(OUT, `redesign-restaurant-${tag}.png`), fullPage: FULL });
      log(tag, res?.status(), m, before);
    } catch (e) {
      const line = `FAIL ${tag} ${(e as Error).message.slice(0, 200)}`;
      report.push(line);
      console.log(line);
    }
  };

  if (HOME) {
    try {
      const before = errors.length;
      await stableGoto(page, `${BASE}/`, "load");
      await page.waitForTimeout(2600);
      await page.mouse.move(w * 0.6, 300);
      const m = await measure(page);
      const files = await frames(page, `redesign-restaurant-home-${w}`);
      await sheet(files, path.join(OUT, `redesign-restaurant-home-${w}${sfx}.png`), w >= 768 ? 3 : 6);
      fs.copyFileSync(files[0]!, path.join(OUT, `redesign-restaurant-home-${w}${sfx}-top.png`));
      if (!process.argv.includes("--keep")) for (const f of files) fs.unlinkSync(f);
      log(`home-${w}${sfx} frames=${files.length}`, 200, m, before);
    } catch (e) {
      console.log(`FAIL home ${(e as Error).message.slice(0, 200)}`);
    }
  }
  if (want("menu")) {
    await visit("menu", `${BASE}/menu`);
    await visit("menu-scrolled", `${BASE}/menu`, async (p) => {
      await p.mouse.wheel(0, w >= 768 ? 1500 : 1300);
      await p.waitForTimeout(1500);
    });
  }
  if (want("order")) await visit("order", `${BASE}/order`);
  if (want("reserve")) await visit("reserve", `${BASE}/reserve`);
  if (want("lookup")) await visit("lookup", `${BASE}/orders/r/lookup`);
  if (want("locked")) {
    await visit("order-locked", `${BASE}/orders/r/R-1001?p=0800000000`);
    await visit("reservation-locked", `${BASE}/reservations/RS-1001?p=0800000000`);
  }
  if (want("table") && token) await visit("table", `${BASE}/t/${token}`);
  if (want("about")) await visit("about", `${BASE}/about`);
  if (want("contact")) await visit("contact", `${BASE}/contact`);

  if (FLOWS) {
    // modifier sheet + cart sheet on /menu
    await visit("flow-modifier", `${BASE}/menu`, async (p) => {
      await p.getByRole("button", { name: /แกงเขียวหวานไก่บ้าน/ }).click();
      await p.waitForTimeout(900);
    });
    await visit("flow-cart", `${BASE}/menu`, async (p) => {
      await p.getByRole("button", { name: /ข้าวเหนียวมะม่วง/ }).click();
      await p.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
      await p.waitForTimeout(1400);
      await p.screenshot({ path: path.join(OUT, `redesign-restaurant-flow-cartbar-${w}${sfx}.png`) });
      await p.locator("[data-rw-cartbar] button").click();
      await p.waitForTimeout(900);
    });
    // pickup checkout step
    await visit("flow-pickup", `${BASE}/order`, async (p) => {
      await p.locator("[data-rw-cartbar] button").click();
      await p.getByRole("dialog").getByRole("button", { name: /ดำเนินการต่อ/ }).click();
      await p.waitForTimeout(900);
    });
    // place a cash pickup order → tracker
    try {
      const before = errors.length;
      await p2Pickup(page);
      await page.waitForTimeout(1800);
      const m = await measure(page);
      await page.screenshot({ path: path.join(OUT, `redesign-restaurant-tracker-${w}${sfx}.png`), fullPage: FULL });
      log(`tracker-${w}${sfx}`, 200, m, before);
    } catch (e) {
      console.log(`FAIL tracker ${(e as Error).message.slice(0, 200)}`);
    }
    // reservation → confirmation (then cancel it)
    try {
      const before = errors.length;
      const d = new Date(Date.now() + (40 + (Date.now() % 20)) * 86400000).toISOString().slice(0, 10);
      await stableGoto(page, `${BASE}/reserve?date=${d}&time=19:00&size=2&zone=${encodeURIComponent("ในบ้าน")}`, "load");
      await page.waitForTimeout(1200);
      await page.getByText("ว่าง สามารถจองได้").waitFor({ timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `redesign-restaurant-reserve-filled-${w}${sfx}.png`), fullPage: FULL });
      await page.locator("#res-name").fill("คุณภาพหน้าจอ");
      await page.locator("#res-phone").fill("0891112233");
      await page.getByRole("button", { name: /ยืนยันการจอง/ }).click();
      await page.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 30000 });
      await page.waitForTimeout(2200);
      const m = await measure(page);
      await page.screenshot({ path: path.join(OUT, `redesign-restaurant-reservation-${w}${sfx}.png`), fullPage: FULL });
      log(`reservation-${w}${sfx}`, 200, m, before);
      await page.getByRole("button", { name: "ยกเลิกการจอง" }).click();
      await page.getByRole("button", { name: "แตะอีกครั้งเพื่อยืนยันยกเลิก" }).click();
      await page.getByText("ยกเลิกแล้ว").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `redesign-restaurant-reservation-cancelled-${w}${sfx}.png`) });
    } catch (e) {
      console.log(`FAIL reservation ${(e as Error).message.slice(0, 200)}`);
    }
  }
  await page.close();
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "redesign-restaurant-report.txt"), report.join("\n") + "\n");
process.exit(0);

async function p2Pickup(page: Page) {
  await stableGoto(page, `${BASE}/order`, "load");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /ปอเปี๊ยะทอดผัก/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /เพิ่มในออเดอร์/ }).click();
  await page.locator("[data-rw-cartbar] button").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /ดำเนินการต่อ/ }).click();
  await dlg.getByRole("radiogroup", { name: "เวลารับอาหาร" }).getByRole("radio").first().click();
  await dlg.locator("#pickup-name").fill("คุณภาพหน้าจอ");
  await dlg.locator("#pickup-phone").fill("0891112233");
  await dlg.locator("label", { hasText: "เงินสดเมื่อมารับ" }).click();
  await dlg.getByRole("button", { name: /ยืนยันสั่งอาหาร/ }).click();
  await page.waitForURL(/\/orders\/r\/R-\d+\?p=/, { timeout: 30000 });
}
