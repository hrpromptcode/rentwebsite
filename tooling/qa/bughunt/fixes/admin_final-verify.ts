import "../../../load-env";
import path from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";

/**
 * admin_final packet browser checks (admin dev server http://localhost:3001, superadmin owns every demo tenant).
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/bughunt/fixes/admin_final-verify.ts shots <path ...>   # 1440 + 390 screenshots
 *   … admin_final-verify.ts kpi                     # KPI labels: no ellipsis / clipped text, values aligned per row (390 + 1440)
 *   … admin_final-verify.ts labels                  # image-URL inputs have a <label for> (accessible name from a label element)
 *   … admin_final-verify.ts focus                   # clinic dialogs: Esc returns focus to the opener, not <body>
 *   … admin_final-verify.ts payments                # Settings > Payments: status card, opt-in checkbox, validation, save probe
 *   … admin_final-verify.ts checklist               # dashboard checklist payments item follows paymentSetupStatus()
 */
const base = "http://localhost:3001";
const SHOTS = path.resolve("screenshots");
const STATE = path.resolve("qa/bughunt/fixes/_admin_final-state.json");
mkdirSync(SHOTS, { recursive: true });
const log = (...a: unknown[]) => console.log(...a);
let failures = 0;
export const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};

async function storage(browser: Browser) {
  if (existsSync(STATE) && Date.now() - statSync(STATE).mtimeMs < 6 * 3600_000) return STATE;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await stableGoto(page, `${base}/login`);
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}

export async function ctxAt(browser: Browser, width: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768, storageState: await storage(browser) });
  await isolateHmr(ctx);
  return ctx;
}

export async function go(page: Page, p: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await stableGoto(page, `${base}${p}`);
      if ((res?.status() ?? 0) < 500) return res;
    } catch (e) {
      if (i === 2) throw e;
    }
    await page.waitForTimeout(8000);
  }
  return null;
}

const shotName = (p: string, w: number, tag = "") => path.join(SHOTS, `admin_final${tag}${p.replace(/[^a-z0-9]+/gi, "_")}-${w}.png`);

async function shots(browser: Browser, paths: string[], full = true) {
  for (const w of [1440, 390]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const p of paths) {
      const res = await go(page, p);
      await page.waitForTimeout(800);
      const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
      await page.screenshot({ path: shotName(p, w), fullPage: full, animations: "disabled" });
      log(`${w} ${p} status=${res?.status()} scrollWidth=${sw} -> ${path.basename(shotName(p, w))}`);
    }
    await ctx.close();
  }
}

/** KPI cards (KpiCard renders `.card` with an icon tile + text column). */
const KPI_MEASURE = `(() => [...document.querySelectorAll('[data-slot=kpi-card]')].map(c => {
  const label = c.querySelector('[data-slot=kpi-label]'); const value = c.querySelector('[data-slot=kpi-value]');
  const lr = label.getBoundingClientRect(); const vr = value.getBoundingClientRect(); const cr = c.getBoundingClientRect();
  const cs = getComputedStyle(label); const lh = parseFloat(cs.lineHeight) || 20;
  return { text: label.textContent, lines: Math.round(label.scrollHeight / lh), clipped: label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1, ellipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap', top: Math.round(cr.top), valueTop: Math.round(vr.top), right: Math.round(cr.right), vw: innerWidth };
}))()`;

async function kpi(browser: Browser) {
  const PATHS = ["/t/demo-restaurant/restaurant/orders?tab=history", "/t/demo-restaurant/restaurant/orders", "/t/demo-restaurant/restaurant/tables", "/t/demo-restaurant/restaurant/reservations", "/t/demo-restaurant/restaurant/menu", "/t/demo-clinic/clinic/visits", "/t/demo-clinic/bookings", "/t/demo-salon/bookings", "/t/demo-shop/dashboard", "/t/demo-restaurant/dashboard", "/t/demo-clinic/dashboard"];
  for (const w of [390, 1440]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const p of PATHS) {
      await go(page, p);
      await page.waitForTimeout(600);
      const cards = (await page.evaluate(KPI_MEASURE)) as Array<{ text: string; lines: number; clipped: boolean; ellipsis: boolean; top: number; valueTop: number; right: number; vw: number }>;
      if (!cards.length) {
        log(`INFO ${w} ${p}: no KPI cards`);
        continue;
      }
      const bad = cards.filter((c) => c.clipped || c.ellipsis || c.right > c.vw);
      const rows = new Map<number, number[]>();
      for (const c of cards) rows.set(c.top, [...(rows.get(c.top) ?? []), c.valueTop]);
      const misaligned = [...rows.values()].filter((v) => Math.max(...v) - Math.min(...v) > 1);
      check(!bad.length && !misaligned.length, `${w} ${p}: ${cards.length} KPI cards, labels ${cards.map((c) => `${c.text}(${c.lines})`).join(" · ")}${bad.length ? ` CLIPPED ${JSON.stringify(bad)}` : ""}${misaligned.length ? ` VALUES MISALIGNED ${JSON.stringify(misaligned)}` : ""}`);
      if (p.includes("tab=history") || p.endsWith("/clinic/visits")) await page.screenshot({ path: shotName(p, w, "-kpi"), animations: "disabled" });
    }
    await ctx.close();
  }
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (mode === "shots") await shots(browser, rest.map((p) => (p.startsWith("/") ? p : `/${p}`)));
    else if (mode === "kpi") await kpi(browser);
    else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser.close();
  }
  log(failures ? `${failures} FAILED` : "ALL PASS");
  if (failures) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
