import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Independent QA journey for the top-up deliverable on demo-topup (round 1).
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/topup-journey.ts
 * Prints PASS/FAIL per step, screenshots failing steps to tooling/screenshots/qa-topup-fail-*.png,
 * writes a JSON summary to tooling/qa/topup-journey-results.json. Requires the web dev server on :3000.
 */
const BASE = "http://demo-topup.localhost:3000";
const SHOTS = path.resolve(process.cwd(), "screenshots");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const UID = "123456789";
const GUEST_PHONE = "0891234567";
const LOGIN_PHONE = `089${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

type Result = { step: string; ok: boolean; note?: string; ms: number };
const results: Result[] = [];
let current: Page | null = null;
let failShots = 0;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? undefined;
    results.push({ step: name, ok: true, note, ms: Date.now() - t0 });
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ") : String(e);
    results.push({ step: name, ok: false, note: msg, ms: Date.now() - t0 });
    console.log(`FAIL  ${name} — ${msg}`);
    if (current) {
      failShots += 1;
      const file = path.join(SHOTS, `qa-topup-fail-${failShots}-${slugify(name)}.png`);
      try {
        await current.screenshot({ path: file, fullPage: true });
        console.log(`      screenshot: ${file}`);
      } catch {
        /* page may be closed */
      }
    }
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function newPage(ctx: BrowserContext, viewport = { width: 1440, height: 900 }) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  (page as Page & { qaErrors: string[] }).qaErrors = errors;
  current = page;
  return page as Page & { qaErrors: string[] };
}

async function goto(page: Page, p: string) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
}

/** Same-origin fetch from inside the browser (Node may not resolve *.localhost). */
async function apiGet<T>(page: Page, p: string): Promise<{ status: number; json: T; text: string }> {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: r.status, json: json as T, text };
  }, p);
}

async function pickMethod(page: Page, label: string) {
  const l = page.locator("label").filter({ hasText: label }).first();
  await l.click();
  const checked = await l.locator("input[type=radio]").isChecked();
  assert(checked, `payment method "${label}" not selected after click`);
}

async function submitTopup(page: Page) {
  const btn = page.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
  await btn.waitFor({ state: "visible" });
  assert(await btn.isEnabled(), "submit 'เติมเลย' is disabled");
  await btn.click();
  await page.waitForURL(/\/topup\/TP-\d+/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  const url = new URL(page.url());
  const number = url.pathname.split("/").pop()!;
  const k = url.searchParams.get("k");
  return { number, k };
}

async function uploadSlipAndWaitFulfilled(page: Page, expectText: string) {
  const input = page.locator('input[type="file"]');
  await input.waitFor({ state: "attached" });
  await input.setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("ชำระเงินสำเร็จ", { exact: true }).waitFor({ timeout: 45_000 });
  // PaymentPanel reloads successHref after 1.2 s; the server then reconciles + fulfils
  await page.waitForFunction((t) => document.body.innerText.includes(t), expectText, { timeout: 90_000 });
  await page.waitForLoadState("networkidle");
}

async function otpLogin(page: Page, phone: string, next = "/wallet") {
  await goto(page, `/account/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("เบอร์โทรศัพท์").fill(phone);
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const codeEl = page.getByText(/รหัสของคุณคือ/).locator("span");
  const code = (await codeEl.textContent({ timeout: 60_000 }))?.trim() ?? "";
  assert(/^\d{6}$/.test(code), `dev OTP code not shown (got "${code}")`);
  await page.locator("#otp-code").fill(code);
  await page.locator("#otp-name").fill("QA ทดสอบ");
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(next), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  return code;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser: Browser = await chromium.launch();
  const guestCtx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await newPage(guestCtx);

  let apiOrder = { number: "", k: "" };
  let stockOrder = { number: "", k: "", packageId: "", before: -1 };
  let walletOrder = { number: "", k: "" };
  let manualOrder = { number: "", k: "" };

  /* ------------------------------------------------------------------ 1. /games */
  await step("1a /games renders grid of games", async () => {
    await goto(page, "/games");
    await page.getByRole("heading", { name: "เลือกเกมที่จะเติม" }).waitFor();
    const tiles = page.locator('a[href^="/games/"]');
    const n = await tiles.count();
    assert(n >= 8, `expected >= 8 game tiles, got ${n}`);
    const prices = await page.getByText(/เริ่มต้น ฿\d/).count();
    assert(prices >= 8, `expected min-price chips on tiles, got ${prices}`);
    const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 80)));
    assert(broken.length === 0, `broken images: ${broken.join(", ")}`);
    return `${n} tiles, ${prices} price chips, 0 broken images`;
  });

  await step("1b /games search filters tiles (client) + empty state", async () => {
    const search = page.getByLabel("ค้นหาเกม");
    await search.fill("rov");
    await page.waitForTimeout(300);
    const tiles = page.locator('a[href^="/games/"]');
    assert((await tiles.count()) === 1, `search "rov" expected 1 tile, got ${await tiles.count()}`);
    assert(/RoV/.test((await tiles.first().innerText()) ?? ""), "the remaining tile is not RoV");
    await search.fill("garena");
    await page.waitForTimeout(300);
    assert((await tiles.count()) === 2, `publisher search "garena" expected 2 tiles, got ${await tiles.count()}`);
    await search.fill("zzzz");
    await page.waitForTimeout(300);
    await page.getByText("ไม่พบเกมที่ค้นหา").waitFor({ timeout: 5_000 });
    await search.fill("");
    await page.waitForTimeout(300);
    assert((await tiles.count()) >= 8, "clearing search did not restore the grid");
    return "name + publisher search, empty state OK";
  });

  await step("1c /games category tabs filter + ?cat deep link", async () => {
    const tiles = page.locator('a[href^="/games/"]');
    const expect: Array<[string, number]> = [
      ["บัตร / โค้ด", 2],
      ["PC", 1],
      ["มือถือ", 5],
      ["ทั้งหมด", 8],
    ];
    const seen: string[] = [];
    for (const [tab, n] of expect) {
      const t = page.getByRole("tab", { name: tab });
      await t.click();
      await page.waitForTimeout(250);
      assert((await t.getAttribute("aria-selected")) === "true", `tab ${tab} not aria-selected`);
      const c = await tiles.count();
      assert(c === n, `tab "${tab}" expected ${n} tiles, got ${c}`);
      const box = await t.boundingBox();
      assert(box && box.height >= 44, `tab "${tab}" height ${box?.height} < 44px`);
      seen.push(`${tab}=${c}`);
    }
    await goto(page, "/games?cat=voucher&q=steam");
    assert((await tiles.count()) === 1, "deep link ?cat=voucher&q=steam should show only Steam Wallet");
    return seen.join(", ");
  });

  /* ------------------------------------------------------------------ 1z OTP-first-order gate (moduleConfig.topup.otpRequiredFirstOrder = true on demo-topup) */
  await step("1z guest is asked to verify OTP before the first order; submit disabled; log in", async () => {
    await goto(page, "/games/rov");
    await page.getByText("ร้านนี้ให้ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก").first().waitFor();
    const submits = page.locator('button[type="submit"]');
    const n = await submits.count();
    for (let i = 0; i < n; i++) assert(await submits.nth(i).isDisabled(), "submit should be disabled for guests when OTP is required");
    const href = await page.getByRole("link", { name: "ยืนยันด้วย OTP" }).first().getAttribute("href");
    assert(href?.includes("/account/login?next="), `OTP link should go to /account/login, got ${href}`);
    await otpLogin(page, GUEST_PHONE, "/games/rov");
    return `gate shown, ${n} submit button(s) disabled, logged in as ${GUEST_PHONE}`;
  });

  /* ------------------------------------------------------------------ 2. /games/rov api package via PromptPay */
  await step("2a /games/rov form: UID + api package (40 คูปอง) + PromptPay → /topup/[number]?k=", async () => {
    await goto(page, "/games/rov");
    await page.getByRole("heading", { level: 1, name: "RoV (Arena of Valor)" }).waitFor();
    await page.locator("#pf-uid").fill(UID);
    const pkg = page.getByRole("radio", { name: /^40 คูปอง/ });
    await pkg.click();
    assert((await pkg.getAttribute("aria-checked")) === "true", "package radio not checked");
    assert(/อัตโนมัติ/.test(await pkg.innerText()), "40 คูปอง should be flagged อัตโนมัติ (api)");
    // signed in via OTP with an empty wallet: the wallet option is listed, PromptPay selectable
    const walletLabel = page.locator("label").filter({ hasText: "กระเป๋าเงินในเว็บ" }).first();
    assert((await walletLabel.count()) === 1, "wallet method should be listed");
    await pickMethod(page, "PromptPay QR");
    await page.locator("#contact").fill(GUEST_PHONE);
    const summaryTotal = await page.locator("aside").getByText(/^฿35$/).count();
    assert(summaryTotal >= 1, "desktop summary should show ฿35");
    const { number, k } = await submitTopup(page);
    assert(/^TP-\d{4,}$/.test(number), `bad order number ${number}`);
    assert(k && k.length >= 16, "missing ?k= access key");
    apiOrder = { number, k: k! };
    return `${number} created, key length ${k!.length}`;
  });

  await step("2b order page shows timeline + PromptPay QR + countdown", async () => {
    await page.getByLabel("สถานะรายการ").waitFor();
    for (const label of ["รอชำระ", "ชำระแล้ว", "กำลังเติม", "สำเร็จ"]) await page.getByLabel("สถานะรายการ").getByText(label, { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByText("รอชำระเงิน", { exact: true }).first().waitFor();
    const qr = page.locator('img[alt="PromptPay QR"]');
    await qr.waitFor();
    const src = (await qr.getAttribute("src")) ?? "";
    assert(src.startsWith("data:image"), "QR is not a data URL");
    const natural = await qr.evaluate((i: HTMLImageElement) => i.naturalWidth);
    assert(natural > 0, "QR image did not decode");
    await page.getByText(/หมดอายุใน \d+:\d{2}/).waitFor();
    await page.getByText("GameHub", { exact: true }).first().waitFor();
    await page.getByText("แนบสลิปโอนเงิน").waitFor();
    // uid shown to the key holder (authorised) with the game field label
    await page.getByText("Open ID / UID").waitFor();
    await page.getByText(UID, { exact: true }).waitFor();
    return "4-step timeline, QR data URL decoded, countdown, slip dropzone";
  });

  await step("2c slip upload → auto-approved → api package fulfilled (เติมสำเร็จ, SIM- ref)", async () => {
    await uploadSlipAndWaitFulfilled(page, "เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ");
    await page.getByText("เติมสำเร็จ", { exact: true }).first().waitFor();
    const ref = await page.getByText(/^SIM-[A-Z0-9]{6}$/).textContent();
    assert(ref, "simulated supplierRef (SIM-xxxxxx) not shown in เลขอ้างอิง");
    await page.getByText("อัตโนมัติ", { exact: true }).first().waitFor();
    await page.getByText("ชำระเมื่อ").waitFor();
    await page.getByText("เติมสำเร็จเมื่อ").waitFor();
    assert((await page.locator('img[alt="PromptPay QR"]').count()) === 0, "QR should disappear once paid");
    const api = await apiGet<{ status: string; authorised: boolean; player: string; fulfillment: string }>(page, `/api/topup/orders/${apiOrder.number}?k=${encodeURIComponent(apiOrder.k)}`);
    assert(api.status === 200 && api.json.status === "fulfilled", `api status ${api.status} ${api.json?.status}`);
    assert(api.json.authorised === true, "key holder should be authorised");
    assert(api.json.player === "1234****", `player should be masked even for key holder in the poll API, got ${api.json.player}`);
    return `${apiOrder.number} fulfilled, ref ${ref}`;
  });

  /* ------------------------------------------------------------------ 3. stock package (Steam Wallet) */
  await step("3a /games/steam-wallet stock package shows live count; create PromptPay order", async () => {
    await goto(page, "/games/steam-wallet");
    const pkg = page.getByRole("radio", { name: /฿100/ }).first();
    await pkg.click();
    assert((await pkg.getAttribute("aria-checked")) === "true", "฿100 radio not checked");
    const txt = await pkg.innerText();
    const m = txt.match(/เหลือ (\d+) โค้ด/);
    assert(m, `stock package should show "เหลือ N โค้ด", got: ${txt.replace(/\s+/g, " ")}`);
    const packageId = await page.locator('input[name="packageId"]').inputValue();
    const api = await apiGet<{ available: number; fulfillment: string; inStock: boolean }>(page, `/api/topup/stock/${packageId}`);
    assert(api.status === 200 && api.json.fulfillment === "stock", `stock api ${api.status} ${JSON.stringify(api.json)}`);
    assert(api.json.available === Number(m![1]), `UI shows ${m![1]} but API says ${api.json.available}`);
    stockOrder.packageId = packageId;
    stockOrder.before = api.json.available;
    await page.locator("#pf-contact").fill("qa-steam@example.com");
    await pickMethod(page, "PromptPay QR");
    await page.locator("#contact").fill(GUEST_PHONE);
    const { number, k } = await submitTopup(page);
    stockOrder.number = number;
    stockOrder.k = k!;
    return `${number} created; stock before = ${api.json.available}`;
  });

  await step("3b slip → code revealed (decrypted) + stock count −1", async () => {
    await uploadSlipAndWaitFulfilled(page, "เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ");
    await page.getByText("โค้ด ฿100").waitFor();
    const codeEl = page.locator("code").first();
    const masked = (await codeEl.textContent())?.trim() ?? "";
    assert(/^STEAM-•{4}-•{4}-[A-Z0-9]{4}$/.test(masked), `code should be masked by default, got "${masked}"`);
    await page.getByRole("button", { name: "แสดงโค้ด" }).click();
    const shown = (await codeEl.textContent())?.trim() ?? "";
    assert(/^STEAM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(shown), `revealed code malformed: "${shown}"`);
    await page.getByRole("button", { name: "ซ่อน" }).waitFor();
    const serial = await page.getByText(/^SW100-\d{3}$/).textContent();
    assert(serial, "serial (SW100-00x) not shown as เลขอ้างอิง");
    await page.getByText("รับโค้ดทันที", { exact: true }).waitFor();
    const api = await apiGet<{ available: number }>(page, `/api/topup/stock/${stockOrder.packageId}`);
    assert(api.json.available === stockOrder.before - 1, `stock should be ${stockOrder.before - 1}, got ${api.json.available}`);
    // the public poll API must never carry the code
    const poll = await apiGet<Record<string, unknown>>(page, `/api/topup/orders/${stockOrder.number}?k=${encodeURIComponent(stockOrder.k)}`);
    assert(!poll.text.includes(shown) && !/STEAM-/.test(poll.text), "poll API leaks the delivered code");
    return `${stockOrder.number}: code ${masked}, serial ${serial}, stock ${stockOrder.before}→${api.json.available}`;
  });

  await step("3c /games/steam-wallet shows decremented count; sold-out package (Roblox) disabled", async () => {
    await goto(page, "/games/steam-wallet");
    const pkg = page.getByRole("radio", { name: /฿100/ }).first();
    const txt = await pkg.innerText();
    assert(txt.includes(`เหลือ ${stockOrder.before - 1} โค้ด`), `expected "เหลือ ${stockOrder.before - 1} โค้ด" on the ฿100 card, got ${txt.replace(/\s+/g, " ")}`);
    await goto(page, "/games/roblox");
    const radios = page.getByRole("radio", { name: /Robux/ });
    const n = await radios.count();
    assert(n === 3, `expected 3 Roblox packages, got ${n}`);
    for (let i = 0; i < n; i++) assert(await radios.nth(i).isDisabled(), `sold-out Roblox package ${i} should be disabled`);
    await page.getByText("หมดชั่วคราว").first().waitFor();
    const submit = page.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
    assert(await submit.isDisabled(), "submit should be disabled when every package is sold out");
    return "count updated, 3 sold-out Roblox packages disabled, CTA disabled";
  });

  /* ------------------------------------------------------------------ 4. OTP login + wallet */
  const userCtx = await browser.newContext({ reducedMotion: "reduce" });
  const upage = await newPage(userCtx);

  await step("4a OTP login (dev code shown) → /wallet", async () => {
    await otpLogin(upage, LOGIN_PHONE, "/wallet");
    await upage.getByText("ยอดเงินคงเหลือ").waitFor();
    await upage.getByText("QA ทดสอบ").first().waitFor();
    assert((await upage.getByText("ยังไม่มีรายการ เติมเงินครั้งแรกเพื่อรับโบนัส").count()) === 1, "fresh wallet should show the empty history state");
    await upage.getByText("โบนัส +2% ทุกครั้งที่เติม").waitFor();
    return `logged in as ${LOGIN_PHONE}, empty wallet`;
  });

  await step("4b wallet top-up ฿300 → PaymentPanel (QR, bonus preview)", async () => {
    const preset = upage.getByRole("radio", { name: /฿300/ });
    await preset.click();
    assert((await preset.getAttribute("aria-checked")) === "true", "฿300 preset not selected");
    await upage.getByText("เข้ากระเป๋าทั้งหมด").waitFor();
    await upage.getByText("฿306", { exact: true }).first().waitFor();
    await upage.getByRole("button", { name: /เติมเงิน ฿300/ }).click();
    await upage.waitForURL(/\/wallet\?topup=/, { timeout: 120_000 });
    await upage.waitForLoadState("networkidle");
    await upage.getByText("ชำระเงินเพื่อเติมกระเป๋า").waitFor();
    await upage.locator('img[alt="PromptPay QR"]').waitFor();
    await upage.getByText("เมื่อชำระสำเร็จจะได้รับ ฿306 (รวมโบนัส ฿6)").waitFor();
    return new URL(upage.url()).searchParams.get("topup") ?? "";
  });

  await step("4c slip → balance credited ฿300 + bonus ฿6 (ledger rows)", async () => {
    await uploadSlipAndWaitFulfilled(upage, "เติมเงินสำเร็จ ฿300");
    await upage.getByText("ได้รับโบนัสเพิ่ม ฿6").waitFor();
    await upage.getByText("฿306", { exact: true }).first().waitFor({ timeout: 20_000 });
    const ledger = upage.locator("li");
    await ledger.filter({ hasText: "เติมเงินเข้ากระเป๋า" }).filter({ hasText: "+฿300" }).first().waitFor();
    await ledger.filter({ hasText: "โบนัสเติมเงิน" }).filter({ hasText: "+฿6" }).first().waitFor();
    await upage.getByText("คงเหลือ ฿306", { exact: true }).waitFor();
    // reload must not double-credit (idempotent reconcile) — count ledger rows, not page-wide text (the top-up form also prints "+฿6")
    await upage.reload({ waitUntil: "networkidle" });
    const ledgerAfter = upage.locator("li");
    assert((await ledgerAfter.filter({ hasText: "เติมเงินเข้ากระเป๋า" }).filter({ hasText: "+฿300" }).count()) === 1, "top-up credited twice after reload");
    assert((await ledgerAfter.filter({ hasText: "โบนัสเติมเงิน" }).filter({ hasText: "+฿6" }).count()) === 1, "bonus credited twice after reload");
    return "balance ฿306, 2 ledger credits, idempotent on reload";
  });

  await step("4d buy 40 คูปอง with wallet → immediate fulfilment", async () => {
    await goto(upage, "/games/rov");
    await upage.locator("#pf-uid").fill(UID);
    await upage.getByRole("radio", { name: /^40 คูปอง/ }).click();
    const walletLabel = upage.locator("label").filter({ hasText: "กระเป๋าเงินในเว็บ" }).first();
    assert(/คงเหลือ ฿306/.test(await walletLabel.innerText()), "wallet option should show คงเหลือ ฿306");
    await pickMethod(upage, "กระเป๋าเงินในเว็บ");
    await upage.getByText("คงเหลือหลังหัก").waitFor();
    await upage.locator("aside").getByText("฿271", { exact: true }).waitFor();
    const contact = await upage.locator("#contact").inputValue();
    assert(contact === LOGIN_PHONE, `contact should be prefilled with ${LOGIN_PHONE}, got ${contact}`);
    const { number, k } = await submitTopup(upage);
    walletOrder = { number, k: k ?? "" };
    await upage.getByText("เติมสำเร็จ", { exact: true }).first().waitFor();
    await upage.getByText("เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ").waitFor();
    await upage.getByText("กระเป๋าเงินในเว็บ", { exact: true }).first().waitFor();
    const ref = await upage.getByText(/^SIM-[A-Z0-9]{6}$/).textContent();
    assert(ref, "SIM ref missing");
    assert((await upage.locator('input[type="file"]').count()) === 0, "no payment panel expected for a wallet order");
    await upage.getByRole("link", { name: "ประวัติการเติม" }).waitFor();
    return `${number} fulfilled instantly (${ref})`;
  });

  await step("4e /wallet history shows the debit −฿35, balance ฿271", async () => {
    await goto(upage, "/wallet");
    await upage.getByText("฿271", { exact: true }).first().waitFor({ timeout: 20_000 });
    await upage.locator("li").filter({ hasText: "ซื้อแพ็กเกจเติมเกม" }).filter({ hasText: "−฿35" }).filter({ hasText: "RoV (Arena of Valor) · 40 คูปอง" }).first().waitFor();
    await upage.getByText("คงเหลือ ฿271", { exact: true }).waitFor();
    // logged-in screenshots of /wallet (desktop + mobile) for visual review
    await upage.screenshot({ path: path.join(SHOTS, "qa-topup-wallet-desktop.png"), fullPage: true });
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce", storageState: await userCtx.storageState() });
    const mp = await mctx.newPage();
    mp.setDefaultNavigationTimeout(120_000);
    await mp.goto(`${BASE}/wallet`, { waitUntil: "networkidle" });
    await mp.waitForTimeout(1500);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await mp.screenshot({ path: path.join(SHOTS, "qa-topup-wallet-mobile.png"), fullPage: true });
    await mp.goto(`${BASE}/topup/${stockOrder.number}?k=${encodeURIComponent(stockOrder.k)}`, { waitUntil: "networkidle" });
    await mp.waitForTimeout(1200);
    const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await mp.screenshot({ path: path.join(SHOTS, "qa-topup-order-mobile.png"), fullPage: true });
    await mp.goto(`${BASE}/games/rov`, { waitUntil: "networkidle" });
    await mp.waitForTimeout(1200);
    const cta = await mp.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first().boundingBox();
    const chat = await mp.locator('a[href*="line"], button[aria-label*="แชท"], [data-chat], a[aria-label*="LINE"]').first().boundingBox().catch(() => null);
    await mctx.close();
    assert(overflow <= 0, `/wallet mobile horizontal overflow ${overflow}px`);
    assert(overflow2 <= 0, `/topup/[number] mobile horizontal overflow ${overflow2}px`);
    assert(cta && cta.height >= 44 && cta.y + cta.height <= 844, `mobile CTA box ${JSON.stringify(cta)} not within viewport / 44px`);
    return `ledger OK; mobile overflow wallet=${overflow}px order=${overflow2}px; CTA ${cta ? `${Math.round(cta.width)}x${Math.round(cta.height)} @y${Math.round(cta.y)}` : "?"}${chat ? `, chat btn @y${Math.round(chat.y)}` : ""}`;
  });

  /* ------------------------------------------------------------------ 5. status lookup + account history */
  await step("5a /topup/status lookup by number (public, masked) + not-found + lowercase", async () => {
    await goto(page, "/topup/status");
    await page.locator("#number").fill(apiOrder.number.toLowerCase());
    await page.getByRole("button", { name: "ค้นหา" }).click();
    await page.waitForURL(/\/topup\/status\?number=/);
    await page.waitForLoadState("networkidle");
    await page.getByText(apiOrder.number, { exact: true }).first().waitFor();
    await page.getByText("เติมสำเร็จ", { exact: true }).first().waitFor();
    await page.getByText("1234****", { exact: true }).waitFor();
    assert((await page.getByText(UID, { exact: true }).count()) === 0, "status page leaks the raw UID");
    await page.getByText("RoV (Arena of Valor) · 40 คูปอง").waitFor();
    await page.getByRole("link", { name: /ดูไทม์ไลน์รายการ/ }).waitFor();
    await goto(page, "/topup/status?number=TP-999999");
    await page.getByText(/ไม่พบรายการ/).waitFor();
    const input = await page.locator("#number").boundingBox();
    assert(input && input.height >= 44, `status input height ${input?.height}`);
    return "found (masked), not-found state, lowercase accepted";
  });

  await step("5b public /topup/[number] without key: no code, no raw UID; API authorised=false", async () => {
    // a fresh, signed-out context: the signed-in owner would legitimately see the code
    const pubCtx = await browser.newContext({ reducedMotion: "reduce" });
    const pub = await newPage(pubCtx);
    await goto(pub, `/topup/${stockOrder.number}`);
    await pub.getByText(stockOrder.number, { exact: true }).first().waitFor();
    assert((await pub.getByRole("button", { name: "แสดงโค้ด" }).count()) === 0, "code reveal visible without access key");
    assert((await pub.locator("code").count()) === 0, "code element rendered without access key");
    await pub.getByText("ผู้เล่น", { exact: true }).waitFor();
    assert((await pub.getByText("qa-steam@example.com").count()) === 0, "raw contact leaked on public view");
    assert((await pub.getByText(GUEST_PHONE).count()) === 0, "guest phone leaked on public view");
    const api = await apiGet<{ authorised: boolean; player: string }>(pub, `/api/topup/orders/${stockOrder.number}`);
    assert(api.json.authorised === false, "API should not authorise without key");
    assert(api.json.player.endsWith("****"), `API player not masked: ${api.json.player}`);
    const bad = await apiGet<{ authorised: boolean }>(pub, `/api/topup/orders/${stockOrder.number}?k=wrongkey`);
    assert(bad.json.authorised === false, "wrong key must not authorise");
    const nf = await apiGet<unknown>(pub, `/api/topup/orders/TP-999999`);
    assert(nf.status === 404, `unknown number should 404, got ${nf.status}`);
    await pubCtx.close();
    return "guest-key gating holds";
  });

  await step("5c /account/topups lists the customer's orders (wallet order)", async () => {
    await goto(upage, "/account/topups");
    await upage.getByRole("heading", { name: "ประวัติการเติม" }).waitFor();
    await upage.getByText(walletOrder.number, { exact: true }).waitFor();
    await upage.getByText("เติมสำเร็จ", { exact: true }).first().waitFor();
    await upage.getByText("ยอดเติมสะสม ฿35").waitFor();
    assert((await upage.getByText(apiOrder.number, { exact: true }).count()) === 0, "guest order must not appear in another customer's history");
    await upage.getByText("1234****").first().waitFor();
    await upage.getByRole("link", { name: new RegExp(walletOrder.number) }).click();
    await upage.waitForURL(new RegExp(`/topup/${walletOrder.number}`));
    await upage.getByText("เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ").waitFor();
    // owner (no ?k=) is authorised via session
    await upage.getByText(UID, { exact: true }).waitFor();
    await upage.screenshot({ path: path.join(SHOTS, "qa-topup-account-topups-desktop.png"), fullPage: true }).catch(() => {});
    return `${walletOrder.number} listed, cumulative ฿35, owner authorised without key`;
  });

  /* ------------------------------------------------------------------ 6. feed */
  await step("6 /api/topup/feed returns masked player ids only", async () => {
    const r = await apiGet<{ items: Array<{ id: string; player: string; status: string; gameName: string; at: string }> }>(page, "/api/topup/feed?limit=10");
    assert(r.status === 200 && Array.isArray(r.json.items), `feed status ${r.status}`);
    assert(r.json.items.length >= 3, `expected >=3 feed items, got ${r.json.items.length}`);
    for (const it of r.json.items) {
      assert(/^(\S{4})?\*{4}$/.test(it.player), `unmasked player in feed: ${it.player}`);
      assert(["paid", "processing", "fulfilled"].includes(it.status), `feed should only carry paid orders, got ${it.status}`);
    }
    for (const needle of [UID, GUEST_PHONE, LOGIN_PHONE, "qa-steam@example.com", "STEAM-", "contact", "deliveredCode", "device"]) assert(!r.text.includes(needle), `feed leaks "${needle}"`);
    const limited = await apiGet<{ items: unknown[] }>(page, "/api/topup/feed?limit=999");
    assert(limited.json.items.length <= 30, "limit should be capped at 30");
    // home section renders it
    await goto(page, "/");
    await page.getByText("เติมล่าสุด (สด)").waitFor();
    await page.getByText("1234****").first().waitFor();
    return `${r.json.items.length} items, all masked, statuses ${[...new Set(r.json.items.map((i) => i.status))].join("/")}`;
  });

  /* ------------------------------------------------------------------ 7. manual fulfilment */
  await step("7 manual package (120 คูปอง) via wallet → ends in processing (กำลังเติม)", async () => {
    await goto(upage, "/games/rov");
    await upage.locator("#pf-uid").fill(UID);
    const pkg = upage.getByRole("radio", { name: /120 คูปอง/ });
    await pkg.click();
    assert(/เติมมือ/.test(await pkg.innerText()), "120 คูปอง should be flagged เติมมือ (manual)");
    await pickMethod(upage, "กระเป๋าเงินในเว็บ");
    const { number, k } = await submitTopup(upage);
    manualOrder = { number, k: k ?? "" };
    await upage.getByText("กำลังเติม", { exact: true }).first().waitFor();
    await upage.getByText(/แอดมินกำลังเติมให้ ใช้เวลาประมาณ 15 นาที/).waitFor();
    await upage.getByText("เติมมือ", { exact: true }).first().waitFor();
    const api = await apiGet<{ status: string; fulfillment: string }>(upage, `/api/topup/orders/${number}`);
    assert(api.json.status === "processing" && api.json.fulfillment === "manual", `api ${JSON.stringify(api.json)}`);
    await goto(upage, "/wallet");
    await upage.getByText("฿172", { exact: true }).first().waitFor({ timeout: 20_000 });
    await upage.locator("li").filter({ hasText: "RoV (Arena of Valor) · 120 คูปอง" }).filter({ hasText: "−฿99" }).first().waitFor();
    return `${number} processing; wallet ฿271→฿172`;
  });

  await step("8 insufficient wallet balance blocks submit client-side", async () => {
    await goto(upage, "/games/rov");
    await upage.locator("#pf-uid").fill(UID);
    await upage.getByRole("radio", { name: /1,200 คูปอง/ }).click();
    await pickMethod(upage, "กระเป๋าเงินในเว็บ");
    await upage.getByText(/ยอดในกระเป๋า ฿172 ไม่พอสำหรับ ฿899/).waitFor();
    const btn = upage.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
    assert(await btn.isDisabled(), "submit should be disabled when wallet is short");
    await upage.getByRole("link", { name: /เติมเงินกระเป๋า/ }).waitFor();
    return "short-balance warning + disabled CTA + link to /wallet";
  });

  await step("9 console/page errors across the journey", async () => {
    const errs = [...page.qaErrors, ...upage.qaErrors].filter((e) => !/favicon|404 \(Not Found\)|net::ERR_ABORTED/.test(e));
    assert(errs.length === 0, `console errors: ${[...new Set(errs)].slice(0, 5).join(" || ")}`);
    return "no console errors";
  });

  await browser.close();
  const summary = { base: BASE, loginPhone: LOGIN_PHONE, orders: { apiOrder, stockOrder, walletOrder, manualOrder }, results };
  await writeFile(path.resolve(process.cwd(), "qa/topup-journey-results.json"), JSON.stringify(summary, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? ` — FAILED: ${failed.map((f) => f.step.split(" ")[0]).join(", ")}` : ""}`);
  console.log(`orders: ${JSON.stringify({ api: apiOrder.number, stock: stockOrder.number, wallet: walletOrder.number, manual: manualOrder.number })}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("journey crashed:", e);
  process.exit(2);
});
