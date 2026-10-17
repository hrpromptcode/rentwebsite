import "../../../load-env";
import { chromium, type Page } from "@playwright/test";
import { origin, newCtx, gotoRetry } from "../responsive_b2-lib";

/**
 * RESPONSIVE_B2-10 verify (keyboard only, demo-salon /book @390 + clinic /book @1440):
 *  - after choosing a service / staff / day with Enter, focus is on the new step heading ("ขั้นตอนที่ n จาก N: …")
 *  - calendar: role=grid with role=row per week (+ header row of columnheaders), Thai day labels with status,
 *    exactly one day in the Tab order, ArrowRight / ArrowDown / PageDown move focus by day / week / month
 * Run from tooling/: MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/fixes/RESPONSIVE_B2-10-verify.ts
 */
let fails = 0;
const res = (ok: boolean, msg: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};
const active = (p: Page) => p.evaluate(`(() => { const el = document.activeElement; return { tag: el ? el.tagName.toLowerCase() : "none", text: el ? (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60) : "", date: el && el.getAttribute("data-date") }; })()`) as Promise<{ tag: string; text: string; date: string | null }>;
async function tabTo(page: Page, pred: string, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(() => { const el = document.activeElement; return !!el && (${pred}); })()`)) return i + 1;
  }
  return -1;
}
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

async function run(slug: string, w: number, mock = false) {
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, w, "no-preference");
  const page = await ctx.newPage();
  if (mock) {
    // client-side check only: stub availability (every weekday free, 3 slots a day) so the day → time step can be driven
    await page.route("**/api/booking/days**", async (route) => {
      const month = new URL(route.request().url()).searchParams.get("month")!;
      const [y, m] = month.split("-").map(Number) as [number, number];
      const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const days = Array.from({ length: n }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const wd = new Date(date + "T00:00:00Z").getUTCDay(); return { date, available: wd !== 0, count: wd !== 0 ? 3 : 0 }; });
      await route.fulfill({ json: { month, days } });
    });
    await page.route("**/api/booking/slots**", async (route) => {
      const date = new URL(route.request().url()).searchParams.get("date")!;
      const slots = ["10:00", "13:00", "15:30"].map((t) => ({ start: `${date}T${t}:00+07:00`, end: `${date}T${t}:00+07:00`, available: true, remaining: 1 }));
      await route.fulfill({ json: { slots } });
    });
  }
  let daysApiFailed = false;
  page.on("response", async (r) => {
    if (r.url().includes("/api/booking/days")) {
      if (r.status() >= 500) daysApiFailed = true;
      const j = (await r.json().catch(() => null)) as { days?: { date: string; available: boolean }[] } | null;
      console.log(`     (days API ${r.status()} ${new URL(r.url()).searchParams.get("month")}: ${j?.days?.filter((d) => d.available).length ?? "?"} available of ${j?.days?.length ?? "?"})`);
    }
  });
  await gotoRetry(page, origin(slug) + "/book");
  await page.waitForTimeout(1500);
  const tag = `${slug} @${w}${mock ? " (availability stubbed)" : ""}`;

  await tabTo(page, `el.closest("main") && el.tagName === "BUTTON" && /นาที/.test(el.innerText)`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  let a = await active(page);
  res(a.tag === "h3" && /^ขั้นตอนที่ 2 จาก \d+/.test(a.text), `${tag} after choosing a service focus → ${a.tag} '${a.text}'`);

  const hasStaff = /ผู้ให้บริการ|ช่าง|แพทย์/.test(a.text);
  if (hasStaff) {
    await tabTo(page, `el.closest("main") && el.tagName === "BUTTON" && /ใครก็ได้/.test(el.innerText)`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    a = await active(page);
    res(a.tag === "h3" && /^ขั้นตอนที่ 3 จาก \d+/.test(a.text), `${tag} after choosing staff focus → ${a.tag} '${a.text}'`);
  }

  await page.waitForFunction(() => !document.querySelector("[role=grid] .animate-pulse"), undefined, { timeout: 30_000 });
  const g = (await page.evaluate(`(() => { const g = document.querySelector("[role=grid]"); const rows = [...g.querySelectorAll(":scope > [role=row]")]; const b = [...g.querySelectorAll("button[role=gridcell]")]; return { rows: rows.length, headers: g.querySelectorAll("[role=columnheader]").length, cellsPerRow: rows.map(r => r.querySelectorAll(":scope > [role=gridcell], :scope > [role=columnheader]").length), tabbable: b.filter(x => x.tabIndex === 0).length, thai: b.filter(x => /^[ก-๙]+ \\d{1,2} [ก-๙]+ 25\\d\\d, (ว่าง|เต็ม|จองไม่ได้)$/.test(x.getAttribute("aria-label") || "")).length, total: b.length, sample: b.slice(16, 18).map(x => x.getAttribute("aria-label")) }; })()`)) as { rows: number; headers: number; cellsPerRow: number[]; tabbable: number; thai: number; total: number; sample: string[] };
  res(g.rows >= 5 && g.headers === 7 && g.cellsPerRow.every((n) => n === 7), `${tag} grid rows=${g.rows} (incl. header) columnheaders=${g.headers} cells/row=${JSON.stringify(g.cellsPerRow)}`);
  res(g.thai === g.total, `${tag} Thai day labels ${g.thai}/${g.total} e.g. ${JSON.stringify(g.sample)}`);
  res(g.tabbable === 1, `${tag} days in the Tab order: ${g.tabbable}`);

  const n = await tabTo(page, `el.closest("[role=grid]")`, 10);
  a = await active(page);
  res(n > 0 && !!a.date, `${tag} Tab reaches the calendar in ${n} stop(s) → '${a.text}'`);
  const start = a.date!;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const r1 = await active(page);
  res(!!r1.date && r1.date > start, `${tag} ArrowRight ${start} → ${r1.date}`);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  const r2 = await active(page);
  res(!!r2.date && r2.date >= addDays(r1.date!, 7), `${tag} ArrowDown ${r1.date} → ${r2.date}`);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(150);
  const r3 = await active(page);
  res(r3.date === r1.date || (!!r3.date && r3.date < r2.date!), `${tag} ArrowUp ${r2.date} → ${r3.date}`);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(2500);
  const r4 = await active(page);
  res(!!r4.date && r4.date.slice(0, 7) > r3.date!.slice(0, 7), `${tag} PageDown ${r3.date} → ${r4.date} (next month shown: ${await page.locator("[role=grid]").getAttribute("aria-labelledby").then((id) => page.locator(`[id="${id}"]`).innerText())})`);
  await page.keyboard.press("PageUp");
  await page.waitForFunction(() => !document.querySelector("[role=grid] .animate-pulse"), undefined, { timeout: 30_000 });
  const r5 = await active(page);
  res(!!r5.date && r5.date.slice(0, 7) === r3.date!.slice(0, 7), `${tag} PageUp → ${r5.date}`);

  // choose an available day with Enter
  const avail = (await page.evaluate(`[...document.querySelectorAll("[role=grid] button[role=gridcell]:not([aria-disabled])")].map(b => b.getAttribute("data-date"))`)) as string[];
  if (avail.length) {
    await page.locator(`[role=grid] button[data-date="${avail[0]}"]`).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1800);
    a = await active(page);
    res(a.tag === "h3" && /^ขั้นตอนที่ \d+ จาก \d+: เลือกเวลา/.test(a.text), `${tag} after choosing a day focus → ${a.tag} '${a.text}'`);
  } else if (daysApiFailed) console.log(`SKIP ${tag} choose-a-day step: /api/booking/days answered 5xx, so no day is bookable (service-side, outside this packet)`);
  else res(false, `${tag} no available day in this month`);
  await browser.close();
}

async function main() {
  await run("demo-salon", 390);
  await run("demo-clinic", 1440);
  await run("demo-salon", 390, true);
  console.log(fails ? `FAIL (${fails})` : "PASS (all)");
}
main().catch((e) => { console.error(e); process.exit(1); });
