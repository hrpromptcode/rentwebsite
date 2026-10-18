import "../../load-env";
import http from "node:http";
import path from "node:path";
import { appendFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { sql, getAdminDb } from "@rentweb/db";
import { newCtx, gotoRetry, runChecks, watchConsole, scrollThrough, HERE, SHOTS } from "./responsive_b2-lib";

/**
 * Live Playwright probes for the topup storefront bughunt (demo-topup). ONE browser context at a time.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/bughunt/topup_storefront-live.ts <phase...>
 * phases: visual crawl2 flows wallet frozen otp ratelimit
 * Appends to qa/bughunt/topup_storefront-live.out (+ topup_storefront-crawl2.jsonl). Screenshots: screenshots/bughunt-topup-*.png
 */
const ORIGIN = "http://demo-topup.localhost:3000";
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const STATE = path.join(HERE, "responsive_b2-state-demo-topup.json"); // signed-in customer 0899523004 "QA B2 ทดสอบ"
const OUT = path.join(HERE, "topup_storefront-live.out");
const CRAWL2 = path.join(HERE, "topup_storefront-crawl2.jsonl");
const K1040 = "0z4QW77KqrI22D158okUjOAV";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const phases = new Set(process.argv.slice(2));
const log = (s: string) => {
  console.log(s);
  appendFileSync(OUT, s + "\n");
};
const rowsOf = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
const admin = getAdminDb();
const q = async (s: string) => rowsOf(await admin.execute(sql.raw(s))) as Array<Record<string, unknown>>;

function httpGet(p: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 3000, path: p, method: "GET", headers: { Host: "demo-topup.localhost", ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    r.setTimeout(120_000, () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end();
  });
}

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? "";
    log(`PASS  ${name} — ${note} (${Date.now() - t0}ms)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n").slice(0, 2).join(" | ") : String(e);
    log(`FAIL  ${name} — ${msg} (${Date.now() - t0}ms)`);
  }
}
const info = (name: string, note: string) => log(`INFO  ${name} — ${note}`);

let browser: Browser;
async function withCtx<T>(width: number, rm: "reduce" | "no-preference", state: string | undefined, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const ctx = await newCtx(browser, width, rm, state);
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}
async function withPage<T>(ctx: BrowserContext, fn: (page: Page, logs: string[]) => Promise<T>): Promise<T> {
  const page = await ctx.newPage();
  const logs = watchConsole(page);
  try {
    return await fn(page, logs);
  } finally {
    await page.close().catch(() => {});
  }
}
const consoleNoise = (l: string) => /HMR|hot-reloader|webpack|turbopack|Fast Refresh|favicon|net::ERR_ABORTED|preload/i.test(l);
const realLogs = (logs: string[]) => logs.filter((l) => !consoleNoise(l));

async function pickMethod(page: Page, value: "wallet" | "promptpay_qr" | "slip") {
  await page.locator(`label:has(input[name="paymentMethod"][value="${value}"])`).first().click();
}
type SubmitResult = { kind: "order"; number: string; k: string; url: string } | { kind: "alert"; text: string } | { kind: "none"; url: string };
async function submitAndWait(page: Page): Promise<SubmitResult> {
  const before = page.url();
  await page.locator('button[type="submit"]:visible').first().click();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const u = page.url();
    const m = u.match(/\/topup\/(TP-\d+)\?k=([^&]+)/);
    if (m) return { kind: "order", number: m[1]!, k: decodeURIComponent(m[2]!), url: u };
    const texts = await alertTexts(page);
    if (texts.length) return { kind: "alert", text: texts[0]! };
    await page.waitForTimeout(500);
  }
  return { kind: "none", url: page.url() === before ? before : page.url() };
}
/** Visible [role=alert] texts, ignoring Next's <next-route-announcer> (which announces page titles such as "TP-1063"). */
async function alertTexts(page: Page): Promise<string[]> {
  return (await page
    .locator('[role="alert"]')
    .evaluateAll((els) => els.filter((e) => !e.closest("next-route-announcer") && (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText))
    .catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const argOf = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
async function existingOrder(number: string | null): Promise<{ number: string; k: string } | null> {
  if (!number) return null;
  const [o] = await q(`select number, device_id as k from topup_orders where tenant_id='${T}' and number='${number}'`);
  return o ? { number: o.number as string, k: o.k as string } : null;
}
async function uploadSlip(page: Page) {
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: "attached", timeout: 60_000 });
  await input.setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
}

/* ------------------------------------------------------------------ visual (390) */
async function phaseVisual() {
  await withCtx(390, "no-preference", STATE, async (ctx) => {
    await withPage(ctx, async (page, logs) => {
      await step("visual: /games/genshin 390 — sticky summary bar vs footer links / accordion at page bottom", async () => {
        await gotoRetry(page, `${ORIGIN}/games/genshin`);
        await scrollThrough(page);
        await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SHOTS, "bughunt-topup-genshin-390-bottom.png") });
        const r = await page.evaluate(`(() => {
          const pick = (sel) => [...document.querySelectorAll(sel)];
          const targets = [...pick('footer a[href]'), ...pick('button[id^="radix-"]'), document.querySelector('#contact')].filter(Boolean);
          const out = [];
          for (const el of targets) {
            const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            if (cy < 0 || cy > innerHeight) continue;
            const top = document.elementFromPoint(cx, cy);
            const inside = top && (top === el || el.contains(top));
            const cover = inside ? null : top && (top.closest('.fixed') || top).className.toString().slice(0, 70);
            out.push({ t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25), y: Math.round(b.top), h: Math.round(b.height), covered: !inside, by: cover });
          }
          const bar = document.querySelector('form .fixed'); const bb = bar ? bar.getBoundingClientRect() : null;
          const chat = document.querySelector('a.fixed.right-4'); const cb = chat ? chat.getBoundingClientRect() : null;
          return { vh: innerHeight, scrollY, bar: bb && { top: Math.round(bb.top), h: Math.round(bb.height) }, chat: cb && { top: Math.round(cb.top), left: Math.round(cb.left), w: Math.round(cb.width), h: Math.round(cb.height) }, items: out };
        })()`);
        return JSON.stringify(r);
      });
      await step("visual: /games/genshin 390 — package tiles + tabs tap sizes, contrast (checks.js)", async () => {
        await page.evaluate("window.scrollTo(0, 0)");
        const c = await runChecks(page, { tap: true, contrast: true });
        const tiles = await page.evaluate(`[...document.querySelectorAll('[role=radiogroup][aria-label="แพ็กเกจ"] button')].map(b => { const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })`);
        return `tiles=${JSON.stringify(tiles)} tap=${JSON.stringify(c.tap)} contrast=${JSON.stringify(c.contrast)} thaiClip=${JSON.stringify(c.thaiClip)} console=${JSON.stringify(realLogs(logs))}`;
      });
      await step("visual: / 390 — live feed Thai clipping (timestamp line) + header nav tap targets", async () => {
        await gotoRetry(page, `${ORIGIN}/`);
        await page.waitForTimeout(1500);
        const r = await page.evaluate(`(() => {
          const ps = [...document.querySelectorAll('p.truncate.text-xs')].filter(p => /ที่แล้ว|เมื่อสักครู่/.test(p.textContent || ''));
          const p = ps[0]; const out = { count: ps.length };
          if (p) { const cs = getComputedStyle(p); const b = p.getBoundingClientRect(); Object.assign(out, { text: p.textContent, fs: cs.fontSize, lh: cs.lineHeight, ov: cs.overflow, clientH: p.clientHeight, scrollH: p.scrollHeight, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }); p.scrollIntoView({ block: 'center' }); }
          const nav = [...document.querySelectorAll('header a[href]')].map(a => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { t: (a.textContent || '').trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), pad: cs.paddingLeft + '/' + cs.paddingRight, vis: r.width > 0 }; }).filter(n => n.vis);
          return Object.assign(out, { nav });
        })()`);
        const rect = (r as { rect?: number[] }).rect;
        if (rect) {
          await page.waitForTimeout(400);
          const b = (await page.evaluate(`(() => { const p = [...document.querySelectorAll('p.truncate.text-xs')].find(p => /ที่แล้ว|เมื่อสักครู่/.test(p.textContent || '')); const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`)) as number[];
          await page.screenshot({ path: path.join(SHOTS, "bughunt-topup-feed-thaiclip-390.png"), clip: { x: Math.max(0, b[0]! - 4), y: Math.max(0, b[1]! - 10), width: Math.min(390, b[2]! + 8), height: b[3]! + 20 } });
        }
        await page.screenshot({ path: path.join(SHOTS, "bughunt-topup-home-390-top.png") });
        return JSON.stringify(r);
      });
      await step("visual: /games 390 — game card headings (Thai/long names) overflow", async () => {
        await gotoRetry(page, `${ORIGIN}/games`);
        await page.waitForTimeout(1200);
        const c = await runChecks(page, { tap: true });
        const h3 = await page.evaluate(`[...document.querySelectorAll('main h3')].map(h => ({ t: h.textContent.trim().slice(0, 24), cw: h.clientWidth, sw: h.scrollWidth, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) }))`);
        return `thaiClip=${JSON.stringify(c.thaiClip)} overflow=${JSON.stringify(c.overflow)} h3=${JSON.stringify(h3)} tap=${JSON.stringify(c.tap)}`;
      });
    });
  });
}

/* ------------------------------------------------------------------ crawl2 (1440 + 390 reduce) */
const ROUTES_1440 = ["/", "/games", "/games/rov", "/games/genshin", "/games/steam-wallet", "/games/roblox", "/games/mlbb", "/games/valorant", "/topup/status", "/topup/status?number=tp-1040", `/topup/TP-1040?k=${K1040}`, "/topup/TP-1040", "/wallet", "/account/topups", "/how-to", "/contact"];
const ROUTES_390R = ["/", "/games", "/games/rov", `/topup/TP-1040?k=${K1040}`, "/wallet", "/account/topups"];
async function crawl(width: number, rm: "reduce" | "no-preference", routes: string[]) {
  await withCtx(width, rm, STATE, async (ctx) => {
    for (const route of routes) {
      await withPage(ctx, async (page, logs) => {
        try {
          const res = await gotoRetry(page, ORIGIN + route);
          await scrollThrough(page);
          await page.waitForTimeout(600);
          const c = await runChecks(page, { tap: true, contrast: width === 1440 });
          const hidden = (c.hidden as string[]).filter((h) => !/sr-only/.test(h));
          const headClip = ((c.headClip as string[] | undefined) ?? []).filter((h) => !/sr-only/.test(h));
          const covered = (c.covered as string[]).filter((h) => !/scanline|pointer-events-none/.test(h));
          const rec = { route, width, rm, status: res?.status(), final: new URL(page.url()).pathname, title: await page.title(), sw: c.sw, vw: c.vw, overflow: c.overflow, tap: c.tap, thaiClip: c.thaiClip, headClip, covered, hidden, imgNoAlt: c.imgNoAlt, noName: c.noName, noLabel: c.noLabel, contrast: c.contrast, logs: realLogs(logs) };
          appendFileSync(CRAWL2, JSON.stringify(rec) + "\n");
          const tap = c.tap as string[];
          const thai = c.thaiClip as string[];
          const contrast = (c.contrast as string[]) ?? [];
          const flags = [c.sw > c.vw ? `HOVERFLOW ${c.sw}>${c.vw}` : "", hidden.length ? `HIDDEN ${hidden.length}` : "", headClip.length ? `HEADCLIP ${headClip.length}` : "", covered.length ? `COVERED ${covered.length}` : "", tap.length ? `TAP ${tap.length}` : "", thai.length ? `THAICLIP ${thai.length}` : "", contrast.length ? `CONTRAST ${contrast.length}` : "", (c.imgNoAlt as string[]).length ? `IMGNOALT ${(c.imgNoAlt as string[]).length}` : "", rec.logs.length ? `CONSOLE ${rec.logs.length}` : ""].filter(Boolean).join(" ");
          log(`CRAWL ${width} ${rm} ${rec.status} ${route} -> ${rec.final} ${flags}`);
        } catch (e) {
          log(`CRAWL ${width} ${rm} ERR ${route} ${(e as Error).message.split("\n")[0]}`);
        }
      });
    }
  });
}
async function phaseCrawl2() {
  await crawl(1440, "no-preference", ROUTES_1440);
  await crawl(390, "reduce", ROUTES_390R);
}

/* ------------------------------------------------------------------ flows (1440, signed-in 0899523004) */
async function phaseFlows() {
  await withCtx(1440, "no-preference", STATE, async (ctx) => {
    let p1: { number: string; k: string } | null = null;
    await withPage(ctx, async (page, logs) => {
      await step("flows: genshin — UID 121 chars rejected with Thai message, no order", async () => {
        await gotoRetry(page, `${ORIGIN}/games/genshin`);
        await page.fill("#pf-uid", "9".repeat(121));
        await page.selectOption("#pf-server", "Asia");
        const r = await submitAndWait(page);
        return JSON.stringify(r);
      });
      await step("flows: genshin — missing Server select blocked client-side (required)", async () => {
        await gotoRetry(page, `${ORIGIN}/games/genshin`);
        await page.fill("#pf-uid", "123456789");
        const valid = await page.evaluate(`document.getElementById('topup-form').checkValidity()`);
        const msg = await page.evaluate(`document.getElementById('pf-server').validationMessage`);
        return `form.checkValidity=${valid} serverMsg="${msg}"`;
      });
      await step("flows: genshin — Thai text as UID + default method → is an order created? (P1)", async () => {
        const reuse = await existingOrder(argOf("p1"));
        if (reuse) {
          p1 = reuse;
          await gotoRetry(page, `${ORIGIN}/topup/${reuse.number}?k=${encodeURIComponent(reuse.k)}`);
          const [o] = await q(`select number, status, payment_method, player_fields, price, contact from topup_orders where tenant_id='${T}' and number='${reuse.number}'`);
          return `reusing ${reuse.number} ${JSON.stringify(o)}`;
        }
        await gotoRetry(page, `${ORIGIN}/games/genshin`);
        const defaultMethod = await page.evaluate(`document.querySelector('input[name="paymentMethod"]:checked')?.value`);
        await page.fill("#pf-uid", "  ทดสอบ🙂 ");
        await page.selectOption("#pf-server", "Asia");
        const r = await submitAndWait(page);
        if (r.kind === "order") {
          p1 = { number: r.number, k: r.k };
          const [o] = await q(`select number, status, payment_method, player_fields, price, contact from topup_orders where tenant_id='${T}' and number='${r.number}'`);
          return `default=${defaultMethod} ORDER CREATED ${JSON.stringify(o)}`;
        }
        return `default=${defaultMethod} ${JSON.stringify(r)}`;
      });
      await step("flows: P1 order page — tracker copy, countdown, QR, public/no-key views, status page lower-case", async () => {
        if (!p1) throw new Error("no P1");
        const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        const hasCountdown = /หมดอายุใน \d+:\d\d/.test(text);
        const qr = await page.locator('img[alt="PromptPay QR"]').count();
        const pub = await httpGet(`/topup/${p1.number}`);
        const pubLock = pub.body.includes("รายการนี้ยังไม่ชำระเงิน");
        const pubHasUid = pub.body.includes("ทดสอบ");
        const api = JSON.parse((await httpGet(`/api/topup/orders/${p1.number}`)).body);
        const st = await httpGet(`/topup/status?number=${p1.number.toLowerCase()}`);
        return `countdown=${hasCountdown} qr=${qr} tracker="${text.match(/ชำระเงินด้านล่าง[^.]{0,60}/)?.[0]}" public: status=${pub.status} lockMsg=${pubLock} rawUidInPublic=${pubHasUid}; api noKey authorised=${api.authorised} player=${api.player}; status page lower-case: ${st.status} found=${st.body.includes(p1.number)} notFound=${st.body.includes("ไม่พบรายการ")}`;
      });
      await step("flows: P1 slip upload → tracker updates WITHOUT full reload (polling) → fulfilled (api package) even with Thai UID", async () => {
        if (!p1) throw new Error("no P1");
        let navs = 0;
        page.on("framenavigated", (f) => {
          if (!f.parentFrame()) navs++;
        });
        const t0 = Date.now();
        await uploadSlip(page);
        let status = "";
        const deadline = Date.now() + 45_000;
        while (Date.now() < deadline) {
          const txt = (await page.locator('ol[aria-label="สถานะรายการ"]').locator("..").innerText().catch(() => "")).replace(/\s+/g, " ");
          if (/เติมสำเร็จแล้ว|กำลังเติม|ได้รับการชำระเงินแล้ว|ไม่สำเร็จ/.test(txt)) {
            status = txt.slice(0, 160);
            break;
          }
          await page.waitForTimeout(1000);
        }
        const [o] = await q(`select status, fulfillment, supplier_ref, paid_at is not null as paid from topup_orders where tenant_id='${T}' and number='${p1.number}'`);
        return `after ${Date.now() - t0}ms navs=${navs} tracker="${status}" db=${JSON.stringify(o)} console=${JSON.stringify(realLogs(logs).slice(0, 3))}`;
      });
      await step("flows: rov — blacklisted contact phone 0800000000 refused with Thai message, no order", async () => {
        const n0 = (await q(`select count(*)::int as n from topup_orders where tenant_id='${T}'`))[0]!.n;
        await gotoRetry(page, `${ORIGIN}/games/rov`);
        await page.fill("#pf-uid", "123456789");
        await page.fill("#contact", "080-000-0000");
        const r = await submitAndWait(page);
        const n1 = (await q(`select count(*)::int as n from topup_orders where tenant_id='${T}'`))[0]!.n;
        return `${JSON.stringify(r)} orders ${n0}→${n1}`;
      });
      await step("flows: valorant / free-fire field attributes (no pattern / numeric enforcement?)", async () => {
        await gotoRetry(page, `${ORIGIN}/games/valorant`);
        await page.fill("#pf-riotid", "NoTagHere");
        const v1 = await page.evaluate(`document.getElementById('topup-form').checkValidity()`);
        const attrs = await page.evaluate(`(() => { const i = document.getElementById('pf-riotid'); return { pattern: i.getAttribute('pattern'), inputmode: i.getAttribute('inputmode'), maxlength: i.getAttribute('maxlength'), placeholder: i.getAttribute('placeholder') }; })()`);
        await gotoRetry(page, `${ORIGIN}/games/free-fire`);
        const ff = await page.evaluate(`(() => { const i = document.getElementById('pf-uid'); return { pattern: i.getAttribute('pattern'), inputmode: i.getAttribute('inputmode'), type: i.type }; })()`);
        return `valorant NoTagHere valid=${v1} attrs=${JSON.stringify(attrs)}; free-fire uid attrs=${JSON.stringify(ff)}`;
      });
    });
    /* stock flow */
    await withPage(ctx, async (page, logs) => {
      let s1: { number: string; k: string } | null = null;
      let pkgId = "";
      let avail0 = -1;
      await step("flows: steam-wallet ฿100 (stock) via slip — order created; stock count before", async () => {
        const reuse = await existingOrder(argOf("s1"));
        if (reuse) {
          s1 = reuse;
          pkgId = (await q(`select package_id from topup_orders where number='${reuse.number}'`))[0]!.package_id as string;
          avail0 = JSON.parse((await httpGet(`/api/topup/stock/${pkgId}`)).body).available;
          await gotoRetry(page, `${ORIGIN}/topup/${reuse.number}?k=${encodeURIComponent(reuse.k)}`);
          return `reusing ${reuse.number} pkg ${pkgId} available=${avail0}`;
        }
        await gotoRetry(page, `${ORIGIN}/games/steam-wallet`);
        pkgId = (await page.evaluate(`document.querySelector('input[name="packageId"]').value`)) as string;
        avail0 = JSON.parse((await httpGet(`/api/topup/stock/${pkgId}`)).body).available;
        const tileText = await page.locator('[role=radiogroup][aria-label="แพ็กเกจ"] button[aria-checked="true"]').innerText();
        await page.fill("#pf-contact", "qa-steam2@example.com");
        await pickMethod(page, "slip");
        const r = await submitAndWait(page);
        if (r.kind !== "order") throw new Error(JSON.stringify(r));
        s1 = { number: r.number, k: r.k };
        return `pkg ${pkgId} available=${avail0} tile="${tileText.replace(/\s+/g, " ")}" → ${r.number}`;
      });
      await step("flows: S1 slip → code card appears without reload; masked by default; reveal; poll API has no code; stock −1; reload keeps same code", async () => {
        if (!s1) throw new Error("no S1");
        let navs = 0;
        page.on("framenavigated", (f) => {
          if (!f.parentFrame()) navs++;
        });
        await uploadSlip(page);
        const codeEl = page.locator("code").first();
        await codeEl.waitFor({ timeout: 45_000 });
        const masked = (await codeEl.innerText()).trim();
        await page.getByRole("button", { name: "แสดงโค้ด" }).click();
        const shown = (await codeEl.innerText()).trim();
        const poll = (await httpGet(`/api/topup/orders/${s1.number}?k=${encodeURIComponent(s1.k)}`)).body;
        const avail1 = JSON.parse((await httpGet(`/api/topup/stock/${pkgId}`)).body).available;
        await page.reload({ waitUntil: "networkidle" });
        await page.getByRole("button", { name: "แสดงโค้ด" }).click();
        const shown2 = (await page.locator("code").first().innerText()).trim();
        const avail2 = JSON.parse((await httpGet(`/api/topup/stock/${pkgId}`)).body).available;
        const [row] = await q(`select count(*)::int as sold from code_stock where tenant_id='${T}' and sold_order_id=(select id from topup_orders where number='${s1.number}')`);
        return `navs=${navs} masked="${masked}" shown="${shown}" sameAfterReload=${shown === shown2} pollHasCode=${poll.includes(shown)} stock ${avail0}→${avail1}→${avail2} codesSoldToOrder=${row!.sold}`;
      });
      await step("flows: S1 without key / wrong key (no cookie) — code & contact hidden; with key — shown", async () => {
        if (!s1) throw new Error("no S1");
        const noKey = await httpGet(`/topup/${s1.number}`);
        const wrong = await httpGet(`/topup/${s1.number}?k=${encodeURIComponent(s1.k.slice(0, -2) + "zz")}`);
        const withKey = await httpGet(`/topup/${s1.number}?k=${encodeURIComponent(s1.k)}`);
        const code = withKey.body.match(/STEAM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] ?? "";
        return `code in keyed page=${!!code}; noKey: status=${noKey.status} hasCode=${noKey.body.includes("STEAM-")} hasContact=${noKey.body.includes("qa-steam2@example.com")} hasKeyBtn=${noKey.body.includes("แสดงโค้ด")}; wrongKey: hasCode=${wrong.body.includes("STEAM-")} hasContact=${wrong.body.includes("qa-steam2@example.com")}`;
      });
      info("flows: console", JSON.stringify(realLogs(logs).slice(0, 5)));
    });
  });
}

/* ------------------------------------------------------------------ wallet */
async function phaseWallet() {
  await withCtx(1440, "no-preference", STATE, async (ctx) => {
    await withPage(ctx, async (page, logs) => {
      const cust = (await q(`select id from customers where tenant_id='${T}' and phone='0899523004'`))[0]!.id as string;
      const bal = async () => Number((await q(`select balance from wallets where tenant_id='${T}' and customer_id='${cust}'`))[0]?.balance ?? 0);
      let topupId = "";
      await step("wallet: preset ฿300 — bonus preview vs DB bonus; payment panel shown", async () => {
        await gotoRetry(page, `${ORIGIN}/wallet`);
        const b0 = await bal();
        await page.locator('[role=radiogroup][aria-label="จำนวนเงิน"] button').nth(1).click();
        const preview = (await page.locator("form").first().innerText()).replace(/\s+/g, " ");
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/wallet\?topup=/, { timeout: 60_000 });
        topupId = new URL(page.url()).searchParams.get("topup")!;
        const [t] = await q(`select amount, bonus, status, method from wallet_topups where id='${topupId}'`);
        const panel = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        return `balance0=${b0} preview="${preview.match(/ชำระ ฿[\d,]+ .*?เข้ากระเป๋าทั้งหมด ฿[\d,.]+/)?.[0]}" db=${JSON.stringify(t)} panel="${panel.match(/เมื่อชำระสำเร็จจะได้รับ[^)]*\)/)?.[0]}" countdown=${/หมดอายุใน/.test(panel)}`;
      });
      await step("wallet: slip upload → auto-approve → success banner + credited amount + bonus; balance", async () => {
        const b0 = await bal();
        await uploadSlip(page);
        await page.getByText(/เติมเงินสำเร็จ/).waitFor({ timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        const b1 = await bal();
        const [t] = await q(`select amount, bonus, status from wallet_topups where id='${topupId}'`);
        const tx = await q(`select reason, amount, balance_after from wallet_transactions where tenant_id='${T}' and ref_id='${topupId}' order by created_at`);
        return `balance ${b0}→${b1} banner="${txt.match(/เติมเงินสำเร็จ[^฿]*฿[\d,]+(?: ได้รับโบนัสเพิ่ม ฿[\d,.]+)?/)?.[0]}" topup=${JSON.stringify(t)} ledger=${JSON.stringify(tx)} shownBalance="${txt.match(/ยอดเงินคงเหลือ ฿[\d,.]+/)?.[0]}" url=${page.url()}`;
      });
      await step("wallet: second pending top-up (min ฿20) → 'ยกเลิก' link — is the payment cancelled?", async () => {
        await gotoRetry(page, `${ORIGIN}/wallet`);
        await page.fill("#custom-amount", "20");
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/wallet\?topup=/, { timeout: 60_000 });
        const id2 = new URL(page.url()).searchParams.get("topup")!;
        await page.getByRole("link", { name: "ยกเลิก" }).click();
        await page.waitForURL((u) => u.pathname === "/wallet" && !u.search, { timeout: 60_000 });
        await page.waitForTimeout(1500);
        const [t] = await q(`select t.status as topup_status, p.status as payment_status from wallet_topups t join payments p on p.id = t.payment_id where t.id='${id2}'`);
        const pendingCount = (await q(`select count(*)::int as n from wallet_topups where tenant_id='${T}' and wallet_id=(select id from wallets where customer_id='${cust}') and status='pending'`))[0]!.n;
        return `after ยกเลิก: ${JSON.stringify(t)} pendingTopupsForCustomer=${pendingCount}`;
      });
      await step("wallet: custom amount edge inputs (1e3, 100.005, 0.5, ๑๐๐, 20.555) → hidden satang value", async () => {
        await gotoRetry(page, `${ORIGIN}/wallet`);
        const out: string[] = [];
        for (const v of ["1e3", "100.005", "0.5", "๑๐๐", "20.555"]) {
          await page.fill("#custom-amount", v);
          await page.waitForTimeout(150);
          const satang = await page.evaluate(`document.querySelector('input[name="amount"]').value`);
          const btn = (await page.locator('form button[type="submit"]').first().innerText()).replace(/\s+/g, " ");
          out.push(`${v}→${satang} btn="${btn}"`);
        }
        return out.join(" ; ");
      });
      await step("wallet: rov 40 คูปอง paid by wallet → fulfilled; ledger; balance", async () => {
        const b0 = await bal();
        await gotoRetry(page, `${ORIGIN}/games/rov`);
        await page.fill("#pf-uid", "123456789");
        const defaultMethod = await page.evaluate(`document.querySelector('input[name="paymentMethod"]:checked')?.value`);
        await pickMethod(page, "wallet");
        const summary = (await page.locator("aside").innerText()).replace(/\s+/g, " ");
        const r = await submitAndWait(page);
        if (r.kind !== "order") throw new Error(JSON.stringify(r));
        await page.waitForTimeout(1500);
        const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        const [o] = await q(`select status, price, payment_method, fulfillment from topup_orders where number='${r.number}'`);
        const b1 = await bal();
        return `default=${defaultMethod} summary="${summary.match(/คงเหลือหลังหัก ฿[\d,.]+/)?.[0]}" → ${r.number} ${JSON.stringify(o)} balance ${b0}→${b1} page="${txt.match(/เติมสำเร็จแล้ว[^.]{0,30}/)?.[0]}" paymentPanel=${txt.includes("ยอดที่ต้องชำระ")}`;
      });
      info("wallet: console", JSON.stringify(realLogs(logs).slice(0, 5)));
    });
  });
}

/* ------------------------------------------------------------------ frozen wallet */
async function phaseFrozen() {
  const cust = (await q(`select id from customers where tenant_id='${T}' and phone='0899523004'`))[0]!.id as string;
  await q(`update wallets set frozen = true where tenant_id='${T}' and customer_id='${cust}'`);
  try {
    await withCtx(1440, "no-preference", STATE, async (ctx) => {
      await withPage(ctx, async (page) => {
        await step("frozen: /wallet shows a frozen notice? top-up form submit message", async () => {
          await gotoRetry(page, `${ORIGIN}/wallet`);
          const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
          const notice = txt.match(/ระงับ[^.]{0,60}/)?.[0] ?? "(no frozen notice on page)";
          await page.locator('[role=radiogroup][aria-label="จำนวนเงิน"] button').first().click();
          await page.locator('form button[type="submit"]').first().click();
          let texts: string[] = [];
          const deadline = Date.now() + 60_000;
          while (Date.now() < deadline && !texts.length && !page.url().includes("?topup=")) {
            texts = await alertTexts(page);
            if (!texts.length) await page.waitForTimeout(500);
          }
          return `notice="${notice}" submit→alert=${JSON.stringify(texts)} url=${new URL(page.url()).pathname}${new URL(page.url()).search}`;
        });
        await step("frozen: /games/rov wallet method — message, no order", async () => {
          await gotoRetry(page, `${ORIGIN}/games/rov`);
          const desc = (await page.locator('label:has(input[name="paymentMethod"][value="wallet"])').innerText()).replace(/\s+/g, " ");
          await page.fill("#pf-uid", "123456789");
          await pickMethod(page, "wallet");
          const r = await submitAndWait(page);
          return `walletOption="${desc}" → ${JSON.stringify(r)}`;
        });
      });
    });
  } finally {
    await q(`update wallets set frozen = false where tenant_id='${T}' and customer_id='${cust}'`);
    info("frozen", "wallet unfrozen again");
  }
}

/* ------------------------------------------------------------------ otp + LINE (guest context) */
async function phaseOtp() {
  const r = await httpGet("/account/login");
  info("login page (guest, http)", `status=${r.status} lineLoginLink=${r.body.includes("auth/line")} hasOtpForm=${r.body.includes("otp-target")} text="${(r.body.match(/ยืนยันตัวตนด้วยรหัส OTP[^<]*/)?.[0] ?? "").slice(0, 80)}"`);
  const mock = await httpGet("/api/dev/line-mock");
  info("LINE mock endpoint", `GET /api/dev/line-mock → ${mock.status} ${mock.body.slice(0, 120).replace(/\s+/g, " ")}`);
  const phoneB = "089" + String(Date.now()).slice(-7);
  await withCtx(390, "no-preference", undefined, async (ctx) => {
    await withPage(ctx, async (page, logs) => {
      await step("otp: request → wrong code message → correct code → logged in", async () => {
        await gotoRetry(page, `${ORIGIN}/account/login?next=%2Fgames%2Frov`);
        await page.fill("#otp-target", phoneB);
        await page.locator('form button[type="submit"]').first().click();
        const codeEl = page.locator("span.font-mono").first();
        await codeEl.waitFor({ timeout: 60_000 });
        const code = (await codeEl.innerText()).trim();
        const sent = (await page.locator("form").innerText()).replace(/\s+/g, " ").slice(0, 160);
        await page.fill("#otp-code", code === "000000" ? "111111" : "000000");
        await page.locator('form button[type="submit"]').first().click();
        const err = page.locator("form p.text-destructive");
        await err.waitFor({ timeout: 60_000 });
        const wrong = (await err.innerText()).trim();
        await page.fill("#otp-code", code);
        await page.fill("#otp-name", "QA OTP ทดสอบ");
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 60_000 });
        return `phone=${phoneB} sentBox="${sent}" wrongCode→"${wrong}" then landed ${new URL(page.url()).pathname}`;
      });
      await step("otp: resend within 60s cooldown — what does the UI say? (new phone)", async () => {
        await ctx.clearCookies();
        const phoneC = "089" + String(Date.now() + 7).slice(-7);
        await gotoRetry(page, `${ORIGIN}/account/login`);
        await page.fill("#otp-target", phoneC);
        await page.locator('form button[type="submit"]').first().click();
        await page.locator("span.font-mono").first().waitFor({ timeout: 60_000 });
        await page.getByRole("button", { name: /ขอรหัสใหม่/ }).click();
        await page.waitForLoadState("networkidle");
        await page.fill("#otp-target", phoneC);
        await page.locator('form button[type="submit"]').first().click();
        const err = page.locator("form p.text-destructive");
        const seen = await Promise.race([err.waitFor({ timeout: 30_000 }).then(() => "error"), page.locator("span.font-mono").first().waitFor({ timeout: 30_000 }).then(() => "code")]).catch(() => "neither");
        const msg = seen === "error" ? (await err.innerText()).trim() : seen;
        return `phone=${phoneC} resend→${msg}`;
      });
      await step("otp: expired code message (expires_at forced into the past)", async () => {
        await ctx.clearCookies();
        const phoneD = "089" + String(Date.now() + 13).slice(-7);
        await gotoRetry(page, `${ORIGIN}/account/login`);
        await page.fill("#otp-target", phoneD);
        await page.locator('form button[type="submit"]').first().click();
        const codeEl = page.locator("span.font-mono").first();
        await codeEl.waitFor({ timeout: 60_000 });
        const code = (await codeEl.innerText()).trim();
        const upd = await q(`update customer_otps set expires_at = now() - interval '1 minute' where tenant_id='${T}' and target='${phoneD}' and consumed_at is null returning id`);
        await page.fill("#otp-code", code);
        await page.locator('form button[type="submit"]').first().click();
        const err = page.locator("form p.text-destructive");
        await err.waitFor({ timeout: 60_000 });
        return `phone=${phoneD} rows=${upd.length} msg="${(await err.innerText()).trim()}"`;
      });
      info("otp: console", JSON.stringify(realLogs(logs).slice(0, 5)));
    });
  });
}

/* ------------------------------------------------------------------ rate limit (customer B new login, same IP) */
async function phaseRateLimit() {
  const phoneB = "089" + String(Date.now()).slice(-7);
  await withCtx(1440, "no-preference", undefined, async (ctx) => {
    await withPage(ctx, async (page) => {
      await step("ratelimit: login customer B", async () => {
        await gotoRetry(page, `${ORIGIN}/account/login?next=%2Fgames%2Frov`);
        await page.fill("#otp-target", phoneB);
        await page.locator('form button[type="submit"]').first().click();
        const codeEl = page.locator("span.font-mono").first();
        await codeEl.waitFor({ timeout: 60_000 });
        await page.fill("#otp-code", (await codeEl.innerText()).trim());
        await page.fill("#otp-name", "QA RateLimit");
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 60_000 });
        return phoneB;
      });
      await step("ratelimit: customer B places promptpay orders until refused (maxOrdersPerHour=10; IP shared with other customers' orders this hour)", async () => {
        const ipOrders = (await q(`select count(*)::int as n from topup_orders where tenant_id='${T}' and placed_at > now() - interval '1 hour' and ip is not null`))[0]!.n;
        let ok = 0;
        let last = "";
        for (let i = 0; i < 12; i++) {
          await gotoRetry(page, `${ORIGIN}/games/rov`);
          await page.fill("#pf-uid", "123456789");
          await pickMethod(page, "promptpay_qr");
          const r = await submitAndWait(page);
          if (r.kind === "order") {
            ok++;
            last = r.number;
            continue;
          }
          if (r.kind === "alert") {
            await page.screenshot({ path: path.join(SHOTS, "bughunt-topup-ratelimit-1440.png") });
            return `IP orders in last hour before=${ipOrders}; B succeeded ${ok} (last ${last}) then alert="${r.text}"`;
          }
          return `succeeded ${ok} then ${JSON.stringify(r)}`;
        }
        return `12 orders all accepted (no limit hit) last ${last}`;
      });
      await step("ratelimit: same customer B with a spoofed X-Real-IP header — does the per-IP limit / stored ip follow the header? (dev: no TRUSTED_PROXY)", async () => {
        await ctx.setExtraHTTPHeaders({ "x-real-ip": "203.0.113.9" });
        await gotoRetry(page, `${ORIGIN}/games/rov`);
        await page.fill("#pf-uid", "123456789");
        await pickMethod(page, "promptpay_qr");
        const r = await submitAndWait(page);
        const ip = r.kind === "order" ? (await q(`select ip from topup_orders where number='${r.number}'`))[0]?.ip : null;
        await ctx.setExtraHTTPHeaders({});
        return `${JSON.stringify(r)} stored ip=${ip}`;
      });
    });
  });
  await withCtx(1440, "no-preference", STATE, async (ctx) => {
    await withPage(ctx, async (page) => {
      await step("ratelimit: customer A (0899523004, far fewer own orders) now refused too because of the shared IP?", async () => {
        const own = (await q(`select count(*)::int as n from topup_orders where tenant_id='${T}' and placed_at > now() - interval '1 hour' and customer_id=(select id from customers where tenant_id='${T}' and phone='0899523004')`))[0]!.n;
        await gotoRetry(page, `${ORIGIN}/games/rov`);
        await page.fill("#pf-uid", "123456789");
        await pickMethod(page, "promptpay_qr");
        const r = await submitAndWait(page);
        return `A own orders last hour=${own} → ${JSON.stringify(r)}`;
      });
    });
  });
}

/* ------------------------------------------------------------------ poll: slip upload → tracker message changes without a manual reload */
async function phasePoll() {
  await withCtx(1440, "no-preference", STATE, async (ctx) => {
    await withPage(ctx, async (page, logs) => {
      await step("poll: /wallet balance text after animations settle (hero counter)", async () => {
        await gotoRetry(page, `${ORIGIN}/wallet`);
        await page.waitForTimeout(3500);
        const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        const [w] = await q(`select balance from wallets where tenant_id='${T}' and customer_id=(select id from customers where tenant_id='${T}' and phone='0899523004')`);
        return `shown="${txt.match(/ยอดเงินคงเหลือ ฿[\d,.]+/)?.[0]}" db=${w!.balance}`;
      });
      await step("poll: rov promptpay order → slip → tracker message box changes (time, main-frame navigations)", async () => {
        const reuse = await existingOrder(argOf("poll"));
        let r: SubmitResult;
        if (reuse) {
          await gotoRetry(page, `${ORIGIN}/topup/${reuse.number}?k=${encodeURIComponent(reuse.k)}`);
          r = { kind: "order", number: reuse.number, k: reuse.k, url: page.url() };
        } else {
          await gotoRetry(page, `${ORIGIN}/games/rov`);
          await page.fill("#pf-uid", "123456789");
          await pickMethod(page, "promptpay_qr");
          r = await submitAndWait(page);
        }
        if (r.kind !== "order") throw new Error(JSON.stringify(r));
        const box = page.locator('ol[aria-label="สถานะรายการ"] + div');
        const before = (await box.innerText()).replace(/\s+/g, " ").trim();
        let navs = 0;
        page.on("framenavigated", (f) => {
          if (!f.parentFrame()) navs++;
        });
        const t0 = Date.now();
        await uploadSlip(page);
        let after = before;
        const seen: string[] = [];
        const deadline = Date.now() + 40_000;
        while (Date.now() < deadline) {
          const t = (await box.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
          if (t && t !== after) {
            after = t;
            seen.push(`${Date.now() - t0}ms:${t.slice(0, 50)}`);
          }
          if (/เติมสำเร็จแล้ว|แอดมินกำลังเติม|ไม่สำเร็จ/.test(t)) break;
          await page.waitForTimeout(500);
        }
        const [o] = await q(`select status, paid_at is not null as paid, fulfilled_at is not null as done from topup_orders where number='${r.number}'`);
        const panel = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        return `${r.number} before="${before.slice(0, 60)}" changes=${JSON.stringify(seen)} navs=${navs} db=${JSON.stringify(o)} paymentPanelStillVisible=${panel.includes("ยอดที่ต้องชำระ")} successCard=${panel.includes("ชำระเงินสำเร็จ")} console=${JSON.stringify(realLogs(logs).slice(0, 2))}`;
      });
    });
  });
}

/* ------------------------------------------------------------------ thaiclip (390 @3x zoom of feed rows with stacked marks) */
async function phaseThaiClip() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  try {
    const page = await ctx.newPage();
    await step("thaiclip: / feed row timestamps with stacked marks (ที่/วันที่) — measure + 3x crop", async () => {
      await gotoRetry(page, ORIGIN + "/");
      await page.waitForTimeout(1500);
      const r = (await page.evaluate(`(() => {
        const ps = [...document.querySelectorAll("p.truncate.text-xs")].filter(p => /ที่แล้ว/.test(p.textContent || ""));
        const p = ps[0]; if (!p) return { count: 0 };
        p.scrollIntoView({ block: "center" });
        const cs = getComputedStyle(p); const b = p.getBoundingClientRect();
        const probe = document.createElement("span"); probe.textContent = p.textContent; probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + cs.font + ";line-height:normal"; document.body.appendChild(probe);
        const natural = probe.getBoundingClientRect().height; probe.remove();
        return { count: ps.length, text: p.textContent, fs: cs.fontSize, lh: cs.lineHeight, boxH: Math.round(b.height), naturalLineH: Math.round(natural), rect: [b.left, b.top, b.width, b.height] };
      })()`)) as { count: number; text?: string; rect?: number[] };
      if (r.rect) {
        await page.waitForTimeout(300);
        const b = (await page.evaluate(`(() => { const p = [...document.querySelectorAll("p.truncate.text-xs")].find(p => /ที่แล้ว/.test(p.textContent || "")); const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`)) as number[];
        await page.screenshot({ path: path.join(SHOTS, "bughunt-topup-feed-thaiclip-390x3.png"), clip: { x: Math.max(0, b[0]! - 4), y: Math.max(0, b[1]! - 14), width: Math.min(300, b[2]! + 8), height: b[3]! + 28 } });
      }
      return JSON.stringify(r);
    });
    await page.close();
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function main() {
  browser = await chromium.launch();
  log(`=== topup_storefront-live ${new Date().toISOString()} phases=${[...phases].join(",")}`);
  try {
    if (phases.has("visual")) await phaseVisual();
    if (phases.has("thaiclip")) await phaseThaiClip();
    if (phases.has("poll")) await phasePoll();
    if (phases.has("crawl2")) await phaseCrawl2();
    if (phases.has("flows")) await phaseFlows();
    if (phases.has("wallet")) await phaseWallet();
    if (phases.has("frozen")) await phaseFrozen();
    if (phases.has("otp")) await phaseOtp();
    if (phases.has("ratelimit")) await phaseRateLimit();
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(0);
}
main().catch((e) => {
  log(`FATAL ${e?.stack ?? e}`);
  process.exit(1);
});
