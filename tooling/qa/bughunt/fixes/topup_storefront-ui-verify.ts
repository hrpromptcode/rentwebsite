/**
 * Browser checks for the top-up storefront fix packet (tooling/qa/bughunt/fixes/topup_storefront.md).
 *   cd tooling && node_modules/.bin/tsx qa/bughunt/fixes/topup_storefront-ui-verify.ts [phase...]
 * phases (default all): wallet frozen mobile contrast empty ratelimit
 * ratelimit OTP-logs-in RL_PHONE and places PromptPay orders on /games/rov until the hourly cap refuses one (≤ 11 submits).
 * ONE browser context at a time. Needs the web dev server (:3000) and the signed-in storage state of the QA customer
 * 0899523004 (qa/bughunt/responsive_b2-state-demo-topup.json). Screenshots → tooling/screenshots/fix-topup-sf-*.png
 * Prints PASS/FAIL per check; exit 1 on any FAIL. The frozen phase restores wallets.frozen=false in a finally block.
 */
import "../../../load-env";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { sql, getAdminDb } from "@rentweb/db";
import { isolateHmr, stableGoto } from "./_dev-stable";

const ORIGIN = "http://demo-topup.localhost:3000";
const EMPTY_ORIGIN = "http://qa-topup-empty-5huc8.localhost:3000";
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const CUSTOMER_PHONE = "0899523004";
const STATE = path.resolve("qa/bughunt/responsive_b2-state-demo-topup.json");
const SHOTS = path.resolve("screenshots");
const K1040 = "0z4QW77KqrI22D158okUjOAV";
const all = ["wallet", "frozen", "mobile", "contrast", "empty", "ratelimit"];
const RL_PHONE = "0899517017"; // dedicated QA customer for the rate-limit phase (never the shared 0899523004)
const phases = new Set(process.argv.slice(2).length ? process.argv.slice(2) : all);

const rowsOf = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
const admin = getAdminDb();
const q = async (s: string) => rowsOf(await admin.execute(sql.raw(s)));

let failed = 0;
const check = (id: string, ok: boolean, label: string) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${label}`);
};

let browser: Browser;
type SavedState = Awaited<ReturnType<BrowserContext["storageState"]>>;
async function withCtx(width: number, signedIn: boolean | SavedState, fn: (ctx: BrowserContext, page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768, reducedMotion: "reduce", storageState: signedIn === true ? STATE : signedIn || undefined });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
  try {
    await fn(ctx, page);
  } finally {
    if (errs.length) console.log(`INFO pageerrors: ${JSON.stringify(errs.slice(0, 3))}`);
    await ctx.close().catch(() => {});
  }
}
const hydrated = (page: Page, selector: string) =>
  page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, selector, { timeout: 90_000 });
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `fix-topup-sf-${name}.png`), fullPage });

/** Contrast of every visible text element under `root` against its composited background (canvas-resolved colours, opacity applied). */
const CONTRAST_FN = `(rootSel) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bottom) => { const a = top[3]; return [top[0]*a + bottom[0]*(1-a), top[1]*a + bottom[1]*(1-a), top[2]*a + bottom[2]*(1-a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
  const bgOf = (el) => { const chain = []; let n = el; while (n && n.nodeType === 1) { chain.push(getComputedStyle(n).backgroundColor); n = n.parentElement; } let bg = rgba(getComputedStyle(document.body).backgroundColor); if (bg[3] < 1) bg = [255,255,255,1]; for (let i = chain.length - 1; i >= 0; i--) { const c = rgba(chain[i]); if (c[3] > 0) bg = over(c, bg); } return bg; };
  const opacityOf = (el) => { let o = 1, n = el; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; } return o; };
  const out = [];
  const root = document.querySelector(rootSel) || document.body;
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const own = [...el.childNodes].filter((t) => t.nodeType === 3 && t.textContent.trim()).map((t) => t.textContent.trim()).join(" ");
    if (!own) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const st = getComputedStyle(el); if (st.visibility === "hidden" || st.display === "none") continue;
    const bg = bgOf(el); let fg = rgba(st.color); fg = [fg[0], fg[1], fg[2], fg[3] * opacityOf(el)]; const fgc = over(fg, bg);
    const L1 = lum(fgc), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fs = parseFloat(st.fontSize), fw = parseInt(st.fontWeight, 10) || 400; const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    out.push({ text: own.slice(0, 40), ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, fs, fw });
  }
  return out;
}`;

async function phaseWallet() {
  await withCtx(390, true, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/wallet`, "load");
    if (page.url().includes("/account/login")) return check("SETUP", false, "storage state is signed out — refresh qa/bughunt/responsive_b2-state-demo-topup.json");
    await hydrated(page, "#custom-amount");
    const input = page.locator("#custom-amount");
    const submit = page.locator('form:has(#custom-amount) button[type="submit"]');
    const cases: Array<[string, (btn: string, err: string | null, disabled: boolean) => boolean, string]> = [
      ["1e3", (b, e, d) => !!e && e.includes("ไม่ถูกต้อง") && d, "exponent rejected inline, submit disabled"],
      ["๑๐๐", (b, e, d) => !e && b.includes("฿100") && !d, "Thai digits → ฿100"],
      ["1,500", (b, e, d) => !e && b.includes("฿1,500") && !d, "thousands separator → ฿1,500"],
      ["20.555", (b, e, d) => !!e && e.includes("ทศนิยม") && d, "3 decimals rejected"],
      ["100.005", (b, e, d) => !!e && d, "100.005 rejected (was ฿100.01)"],
      ["0.5", (_b, _e, d) => d, "below minimum keeps submit disabled"],
      ["abc", (_b, e, d) => !!e && d, "letters rejected"],
      ["200000", (_b, e, d) => !!e && e.includes("สูงสุด") && d, "above ฿100,000 cap rejected"],
    ];
    for (const [v, ok, label] of cases) {
      await input.fill(v);
      const btn = (await submit.innerText()).trim();
      const err = await page.locator("#custom-amount-error").textContent({ timeout: 1500 }).catch(() => null);
      const disabled = await submit.isDisabled();
      check("STOREFRONT-14", ok(btn, err, disabled), `"${v}": ${label} — btn="${btn}" err="${err ?? ""}" disabled=${disabled}`);
    }
    check("STOREFRONT-14", (await input.getAttribute("aria-invalid")) === "true", "aria-invalid set while the error shows");
    await shot(page, "wallet-amount-error-390");

    // STOREFRONT-13: create a ฿20 pending top-up, then cancel it
    await input.fill("20");
    await submit.click();
    await page.waitForURL(/\/wallet\?topup=/, { timeout: 90_000 });
    const topupId = new URL(page.url()).searchParams.get("topup")!;
    const cancelBtn = page.getByRole("button", { name: "ยกเลิกรายการ" });
    await cancelBtn.waitFor({ timeout: 60_000 });
    const box = await cancelBtn.boundingBox();
    check("STOREFRONT-13", !!box && box.height >= 44, `cancel button tap target ${box?.width}x${box?.height}`);
    await cancelBtn.click();
    await page.waitForURL(/cancelled=1/, { timeout: 90_000 });
    const notice = await page.getByText("ยกเลิกรายการเติมเงินแล้ว").count();
    const [row] = await q(`select wt.status topup_status, p.status payment_status, p.failure_reason from wallet_topups wt join payments p on p.id = wt.payment_id where wt.tenant_id='${T}' and wt.id='${topupId}'`);
    const ev = await q(`select count(*)::int n from events_outbox where tenant_id='${T}' and type='payment.cancelled' and payload->>'refId'='${topupId}'`).catch(() => [{ n: "n/a" }]);
    check("STOREFRONT-13", row?.payment_status === "cancelled" && row?.topup_status === "cancelled" && notice > 0, `after ยกเลิกรายการ: ${JSON.stringify(row)} notice=${notice} payment.cancelled events=${ev[0]?.n}`);
    // re-opening the cancelled top-up shows a closed notice, not a payable panel
    await stableGoto(page, `${ORIGIN}/wallet?topup=${topupId}`, "load");
    const panel = await page.getByText("ชำระเงินเพื่อเติมกระเป๋า").count();
    const closed = await page.getByText("ถูกยกเลิกแล้ว").count();
    check("STOREFRONT-13", panel === 0 && closed > 0, `reopen cancelled top-up: payment panel=${panel} closedNotice=${closed}`);
    const garbage = await page.goto(`${ORIGIN}/wallet?topup=not-a-uuid`, { waitUntil: "load" });
    check("STOREFRONT-13", garbage?.status() === 200, `/wallet?topup=not-a-uuid → ${garbage?.status()} (was a uuid SQL error)`);
  });
  await withCtx(1440, true, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/wallet`, "load");
    await hydrated(page, "#custom-amount");
    await page.locator("#custom-amount").fill("1e3");
    await shot(page, "wallet-amount-error-1440");
  });
}

async function phaseFrozen() {
  const [w] = await q(`select w.id, w.frozen from wallets w join customers c on c.id = w.customer_id and c.tenant_id = w.tenant_id where w.tenant_id='${T}' and c.phone='${CUSTOMER_PHONE}'`);
  if (!w) return check("SETUP", false, "QA customer wallet not found");
  const wasFrozen = w.frozen === true;
  await q(`update wallets set frozen = true where tenant_id='${T}' and id='${w.id}'`);
  try {
    for (const width of [390, 1440]) {
      await withCtx(width, true, async (_ctx, page) => {
        await stableGoto(page, `${ORIGIN}/wallet`, "load");
        const banner = await page.getByText("กระเป๋าเงินถูกระงับชั่วคราว").count();
        const form = await page.locator("#custom-amount").count();
        check("STOREFRONT-15/ADMIN-14", banner > 0 && form === 0, `${width}px /wallet frozen: banner=${banner} topupForm=${form}`);
        await shot(page, `wallet-frozen-${width}`);
        await stableGoto(page, `${ORIGIN}/games/rov`, "load");
        await hydrated(page, "#topup-form");
        const radio = page.locator('input[name="paymentMethod"][value="wallet"]');
        const disabled = await radio.isDisabled().catch(() => null);
        const checked = await radio.isChecked().catch(() => null);
        const label = (await page.locator('label:has(input[name="paymentMethod"][value="wallet"])').first().innerText().catch(() => "")).replace(/\s+/g, " ");
        const selected = await page.locator('input[name="paymentMethod"]:checked').getAttribute("value").catch(() => null);
        check("STOREFRONT-15/ADMIN-14", disabled === true && checked === false && label.includes("ระงับ") && selected !== "wallet", `${width}px /games/rov wallet option disabled=${disabled} checked=${checked} selected=${selected} label="${label}"`);
        if (width === 390) await shot(page, "game-wallet-frozen-390");
      });
    }
  } finally {
    await q(`update wallets set frozen = ${wasFrozen} where tenant_id='${T}' and id='${w.id}'`);
  }
}

async function phaseMobile() {
  // STOREFRONT-10: footer reachable on every game page at 390; bar still pinned while the form is in view
  await withCtx(390, false, async (_ctx, page) => {
    for (const slug of ["genshin", "steam-wallet", "roblox", "rov"]) {
      await stableGoto(page, `${ORIGIN}/games/${slug}`, "load");
      await hydrated(page, "#topup-form");
      const bar = page.locator("#topup-form div.sticky.lg\\:hidden").first();
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(300);
      const mid = await bar.boundingBox();
      const vh = page.viewportSize()!.height;
      check("STOREFRONT-10", !!mid && mid.y + mid.height <= vh && mid.y > vh - 220, `${slug}: bar pinned near the viewport bottom mid-form (y=${mid?.y} h=${mid?.height} vh=${vh})`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
      const covered = await page.evaluate(() => {
        const links = [...document.querySelectorAll("footer a")] as HTMLElement[];
        return links
          .map((a) => {
            const r = a.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= innerHeight || !r.width) return null;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            // the floating site header overlapping links at the very top of the viewport is not this finding (they scroll into view)
            return hit && (a === hit || a.contains(hit) || hit.closest("header")) ? null : `${a.innerText.trim().slice(0, 30)}@${Math.round(r.top)} by ${(hit as HTMLElement | null)?.className?.toString().slice(0, 50)}`;
          })
          .filter(Boolean);
      });
      const lastRow = await page.evaluate(() => {
        const links = [...document.querySelectorAll("footer a")] as HTMLElement[];
        const last = links.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
        return last ? { text: last.innerText.trim().slice(0, 30), bottom: Math.round(last.getBoundingClientRect().bottom), vh: innerHeight } : null;
      });
      check("STOREFRONT-10", covered.length === 0 && !!lastRow && lastRow.bottom <= lastRow.vh, `${slug}: footer links uncovered at max scroll (covered=${JSON.stringify(covered)} last=${JSON.stringify(lastRow)})`);
      if (slug === "genshin") await shot(page, "genshin-bottom-390");
    }

    // STOREFRONT-19: guest + otpRequiredFirstOrder → the bar explains and offers the OTP login
    await stableGoto(page, `${ORIGIN}/games/rov`, "load");
    await hydrated(page, "#topup-form");
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(300);
    const bar = page.locator("#topup-form div.sticky.lg\\:hidden").first();
    const text = (await bar.innerText()).replace(/\s+/g, " ");
    const otp = bar.locator('a[href^="/account/login"]');
    const ob = await otp.boundingBox();
    const deadBtn = await bar.locator("button[disabled]").count();
    check("STOREFRONT-19", text.includes("OTP") && (await otp.count()) === 1 && !!ob && ob.height >= 44 && deadBtn === 0, `guest bar="${text}" otpLink=${await otp.getAttribute("href")} ${ob?.width}x${ob?.height} disabledButtons=${deadBtn}`);
    const top = await page.locator("#topup-form").getByText("ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก").first().boundingBox();
    check("STOREFRONT-19", !!top && top.y < 900, `OTP notice now above step 1 (y=${top?.y})`);
    await shot(page, "rov-guest-otp-390");
  });
  await withCtx(1440, false, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/games/rov`, "load");
    await hydrated(page, "#topup-form");
    const aside = page.locator("#topup-form aside");
    const link = aside.locator('a[href^="/account/login"]');
    check("STOREFRONT-19", (await link.count()) === 1 && (await aside.locator("button[disabled]").count()) === 0, `1440 guest summary offers OTP link (${await link.innerText().catch(() => "-")})`);
    await shot(page, "rov-guest-otp-1440");
  });
  await withCtx(390, true, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/games/rov`, "load");
    await hydrated(page, "#topup-form");
    const bar = page.locator("#topup-form div.sticky.lg\\:hidden").first();
    const btn = bar.locator('button[type="submit"]');
    check("STOREFRONT-19", (await btn.count()) === 1 && (await bar.locator('a[href^="/account/login"]').count()) === 0, `signed-in bar keeps the เติมเลย submit (${(await btn.innerText().catch(() => "-")).trim()})`);
  });
}

async function phaseContrast() {
  for (const width of [1440, 390]) {
    await withCtx(width, false, async (_ctx, page) => {
      await stableGoto(page, `${ORIGIN}/games/roblox`, "load");
      await hydrated(page, "#topup-form");
      const res = (await page.evaluate(`(${CONTRAST_FN})('[aria-label="แพ็กเกจ"]')`)) as Array<{ text: string; ratio: number; need: number; fs: number }>;
      const bad = res.filter((r) => r.ratio < r.need);
      const soldOut = res.filter((r) => r.text.includes("หมดชั่วคราว"));
      check("STOREFRONT-18", bad.length === 0 && soldOut.length > 0, `${width}px /games/roblox package tiles: ${res.length} texts, min=${Math.min(...res.map((r) => r.ratio))}, below AA=${JSON.stringify(bad.slice(0, 6))}, soldOut=${JSON.stringify(soldOut.slice(0, 1))}`);
      if (width === 1440) await shot(page, "roblox-soldout-1440");
      if (width === 390) {
        await page.locator('[aria-label="แพ็กเกจ"]').scrollIntoViewIfNeeded();
        await shot(page, "roblox-soldout-390");
      }
    });
  }
  await withCtx(1440, false, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/topup/TP-1040?k=${K1040}`, "load");
    const has = await page.locator("code").count();
    if (!has) return check("STOREFRONT-18", false, "TP-1040 shows no delivered code (fixture changed?)");
    const res = (await page.evaluate(`(${CONTRAST_FN})('code')`)) as Array<{ text: string; ratio: number; need: number }>;
    check("STOREFRONT-18", res.length > 0 && res.every((r) => r.ratio >= r.need), `masked code contrast ${JSON.stringify(res)}`);
  });
}

async function phaseEmpty() {
  for (const width of [390, 1440]) {
    await withCtx(width, false, async (_ctx, page) => {
      await stableGoto(page, `${EMPTY_ORIGIN}/games`, "load");
      const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      const tabs = await page.locator('[role="tablist"]').count();
      const search = await page.locator('input[aria-label="ค้นหาเกม"]').count();
      check("ADMIN-15", main.includes("ร้านกำลังเตรียมเกมให้เติม") && !main.includes("ไม่พบเกม") && !main.includes("0 เกมที่รองรับ") && tabs === 0 && search === 0, `${width}px empty catalog: tabs=${tabs} search=${search} text="${main.slice(0, 160)}"`);
      await shot(page, `empty-games-${width}`);
    });
  }
  // a real search miss on demo-topup still says so and offers a reset
  await withCtx(390, false, async (_ctx, page) => {
    await stableGoto(page, `${ORIGIN}/games?q=zzzz`, "load");
    const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    check("ADMIN-15", main.includes("ไม่พบเกม") && main.includes("zzzz") && main.includes("ดูเกมทั้งหมด"), `search miss copy kept: "${(main.match(/ไม่พบเกม[^ ]* [^ ]*/) ?? [""])[0]}"`);
  });
}

async function alertTexts(page: Page): Promise<string[]> {
  return (
    await page
      .locator('[role="alert"]')
      .evaluateAll((els) => els.filter((e) => !e.closest("next-route-announcer") && (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText))
      .catch(() => [] as string[])
  )
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

let rlState: SavedState | null = null; // one OTP login reused across widths (OTP_REQUEST_COOLDOWN_SEC = 60)
async function phaseRateLimit(width = 1440) {
  await withCtx(width, rlState ?? false, async (ctx, page) => {
    if (!rlState) {
    await stableGoto(page, `${ORIGIN}/account/login?next=%2Fgames%2Frov`, "load");
    await hydrated(page, "#otp-target");
    await page.fill("#otp-target", RL_PHONE);
    await page.locator('form button[type="submit"]').first().click();
    const codeEl = page.locator("span.font-mono").first();
    await codeEl.waitFor({ timeout: 60_000 });
    await page.fill("#otp-code", (await codeEl.innerText()).trim());
    if (await page.locator("#otp-name").count()) await page.fill("#otp-name", "QA RateLimit fix");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 90_000 });
    rlState = await ctx.storageState();
    }
    let refused: string | null = null;
    let placed = 0;
    for (let i = 0; i < 11 && !refused; i++) {
      await stableGoto(page, `${ORIGIN}/games/rov`, "load");
      await hydrated(page, "#topup-form");
      for (const inp of await page.locator('#topup-form input[name^="pf_"]').all()) await inp.fill("123456789");
      await page.locator('label:has(input[name="paymentMethod"][value="promptpay_qr"])').first().click();
      await page.locator(width >= 1024 ? "#topup-form aside button[type=submit]" : "#topup-form div.sticky button[type=submit]").click();
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        if (/\/topup\/TP-\d+/.test(page.url())) {
          placed++;
          break;
        }
        const t = await alertTexts(page);
        if (t.length) {
          refused = t[0]!;
          break;
        }
        await page.waitForTimeout(400);
      }
    }
    const cta = refused ? await page.locator('#topup-form [role="alert"] a[href="/account/topups"]').count() : 0;
    check("STOREFRONT-17", !!refused && refused.includes("10 รายการต่อชั่วโมง") && refused.includes("60 นาที") && !refused.includes("สักครู่") && cta === 1, `@${width} placed ${placed} then refusal="${refused}" ctaToUnpaid=${cta}`);
    // the refusal must be on screen (the button pressed is in the sticky summary; the alert renders below step 4)
    if (refused) {
      await page.waitForTimeout(800);
      const vis = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("#topup-form [role=alert]");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, onTop: !!hit && el.contains(hit), focused: document.activeElement === el };
      });
      check("STOREFRONT-17", !!vis && vis.top >= 0 && vis.bottom <= vis.vh && vis.onTop && vis.focused, `@${width} refusal in viewport + focused ${JSON.stringify(vis)}`);
      await shot(page, `ratelimit-${width}`);
    }
  });
}

browser = await chromium.launch();
try {
  if (phases.has("wallet")) await phaseWallet();
  if (phases.has("frozen")) await phaseFrozen();
  if (phases.has("mobile")) await phaseMobile();
  if (phases.has("contrast")) await phaseContrast();
  if (phases.has("empty")) await phaseEmpty();
  if (phases.has("ratelimit")) {
    await phaseRateLimit(1440);
    await phaseRateLimit(390); // the customer is already at the cap: refused on the first submit from the mobile bar
  }
} catch (e) {
  failed++;
  console.log(`FAIL error ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ") : e}`);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
