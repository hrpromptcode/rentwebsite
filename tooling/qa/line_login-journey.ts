import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, auditLogs, customers, eq, getAdminDb, getDb, orders, productVariants, products, tenantSecrets, tenants, withTenant } from "@rentweb/db";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * QA journey for the line_login packet (wave 3 A): admin enables LINE Login for demo-shop, a customer signs in through
 * the dev mock provider, places an order, logs out / in again (same customer), an OTP customer links + unlinks LINE,
 * identity rules (no merge, already_linked, denied, state mismatch) and the admin off switch.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/line_login-journey.ts [--headed]
 * Requires: web :3000 + admin :3001 running with LINE_MOCK=1 and LINE_OAUTH_BASE / LINE_API_BASE pointing at
 * http://localhost:3000/api/dev/line-mock (root .env, or apps/<app>/.env.local for a server that is already running).
 * Writes tooling/qa/line_login-journey-results.json and tooling/screenshots/line-*.png.
 */

const WEB_PORT = process.env.PORT ?? "3000";
const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SLUG = "demo-shop";
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const CHANNEL_ID = "2007654321";
const SECRET = "0123456789abcdef0123456789abcdef";
const BAD_SECRET = "badbadbadbadbadbadbad"; // the mock answers invalid_client for secrets starting with "bad"
const USER_A = { id: "Umock00000000000000000000000000a1", name: "สมชาย ใจดี" };
const USER_B = { id: "Umock00000000000000000000000000b2", name: "สมหญิง รักสวย" };
const HEADED = process.argv.includes("--headed");
const RUN_START = new Date();

const outDir = path.resolve(process.cwd(), "screenshots");
const qaDir = path.resolve(process.cwd(), "qa");
const web = (p: string) => `http://${SLUG}.localhost:${WEB_PORT}${p}`;
const adminLinePage = `${ADMIN}/t/${SLUG}/settings/line`;
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

type Status = "PASS" | "FAIL" | "WARN";
interface Result {
  step: string;
  status: Status;
  detail: string;
  ms: number;
  screenshot?: string;
}
const results: Result[] = [];
const db = getAdminDb();
let currentPage: Page | null = null;

class Warn extends Error {}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function persist() {
  await mkdir(qaDir, { recursive: true });
  await writeFile(path.join(qaDir, "line_login-journey-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
}

async function step(id: string, name: string, fn: () => Promise<string | void>) {
  const label = `${id} ${name}`;
  const t0 = Date.now();
  try {
    const detail = (await fn()) ?? "";
    const r: Result = { step: label, status: "PASS", detail, ms: Date.now() - t0 };
    results.push(r);
    console.log(`[PASS] ${label} (${r.ms}ms)${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ").slice(0, 400) : String(e);
    const r: Result = { step: label, status: e instanceof Warn ? "WARN" : "FAIL", detail: msg, ms: Date.now() - t0 };
    if (currentPage && !currentPage.isClosed() && !(e instanceof Warn)) {
      try {
        const file = `line-fail-${id.replace(/[^a-z0-9]/gi, "_")}.png`;
        await currentPage.screenshot({ path: path.join(outDir, file), fullPage: false });
        r.screenshot = `tooling/screenshots/${file}`;
      } catch {
        /* ignore */
      }
    }
    results.push(r);
    console.log(`[${r.status}] ${label} (${r.ms}ms) — ${msg}${r.screenshot ? ` [${r.screenshot}]` : ""}`);
  }
  await persist();
}

/* ---------- browser helpers ---------- */

async function newCtx(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "th-TH" });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|hydrat|hmr|Fast Refresh/i.test(t)) return;
    errors.push(`${t.slice(0, 160)}${m.location().url ? ` @ ${m.location().url.replace(/^https?:\/\/[^/]+/, "").slice(0, 70)}` : ""}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  return { ctx, page, errors };
}

const goto = (page: Page, url: string) => page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
const text = async (loc: ReturnType<Page["locator"]>) => ((await loc.textContent()) ?? "").replace(/\s+/g, " ").trim();
const bodyText = async (page: Page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
async function poll(fn: () => Promise<boolean>, timeoutMs = 30_000, every = 500): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, every));
  }
  return false;
}
async function overflowPx(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function shot(page: Page, name: string, fullPage = true) {
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
  return `tooling/screenshots/${name}.png`;
}

async function adminLogin(page: Page) {
  await goto(page, `${ADMIN}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
}

async function waitToast(page: Page, contains: string, timeout = 60_000) {
  await page.getByText(contains, { exact: false }).first().waitFor({ state: "visible", timeout });
}

/** Presses the LINE button (login page or account card), picks a mock user, waits for the storefront to come back. */
async function lineLoginVia(page: Page, userId: string, landing: (u: URL) => boolean) {
  await page.getByTestId("line-login-button").first().click();
  await page.waitForURL(/\/api\/dev\/line-mock\/oauth2\/v2\.1\/authorize/, { timeout: 120_000 });
  await page.locator(`[data-testid="line-mock-user"][data-user="${userId}"]`).click();
  await page.waitForURL((u) => u.hostname.startsWith(SLUG) && landing(u), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
}

async function otpLogin(page: Page, phone: string, name: string) {
  await goto(page, web("/account/login"));
  await page.fill("#otp-target", phone);
  await page.locator("form button[type=submit]").first().click();
  await page.locator("#otp-code").waitFor({ timeout: 60_000 });
  const code = (await bodyText(page)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
  assert(code, "dev OTP code not shown inline");
  await page.fill("#otp-code", code);
  await page.fill("#otp-name", name);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

/* ---------- db helpers ---------- */

async function tenantId(): Promise<string> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  assert(t, `tenant ${SLUG} not found`);
  return t.id;
}
async function tenantSettings(): Promise<Record<string, unknown>> {
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.slug, SLUG)).limit(1);
  return (t?.settings ?? {}) as Record<string, unknown>;
}
const customersByLine = (tid: string, lineUserId: string) => withTenant(getDb(), tid, (tx) => tx.select().from(customers).where(and(eq(customers.tenantId, tid), eq(customers.lineUserId, lineUserId))));
const customerById = async (tid: string, id: string) => (await withTenant(getDb(), tid, (tx) => tx.select().from(customers).where(and(eq(customers.tenantId, tid), eq(customers.id, id))).limit(1)))[0];
const customerByPhone = async (tid: string, phone: string) => (await withTenant(getDb(), tid, (tx) => tx.select().from(customers).where(and(eq(customers.tenantId, tid), eq(customers.phone, phone))).limit(1)))[0];
const secretsOf = (tid: string) => withTenant(getDb(), tid, (tx) => tx.select().from(tenantSecrets).where(eq(tenantSecrets.tenantId, tid)));
async function auditSince(tid: string, action: string) {
  const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.tenantId, tid), eq(auditLogs.action, action)));
  return rows.filter((r) => r.createdAt >= RUN_START);
}
async function ensureStock(tid: string, productSlug: string, sku: string, min: number) {
  await withTenant(getDb(), tid, async (tx) => {
    const [p] = await tx.select().from(products).where(and(eq(products.tenantId, tid), eq(products.slug, productSlug))).limit(1);
    assert(p, `product ${productSlug} missing`);
    const [v] = await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tid), eq(productVariants.productId, p.id), eq(productVariants.sku, sku))).limit(1);
    if (v && v.stock !== null && v.stock < min) await tx.update(productVariants).set({ stock: min + 20 }).where(eq(productVariants.id, v.id));
  });
}

/* ---------- journey ---------- */

async function main() {
  await mkdir(outDir, { recursive: true });
  const tid = await tenantId();
  const browser = await chromium.launch({ headless: !HEADED });
  const contexts: BrowserContext[] = [];
  const consoleErrors: Record<string, string[]> = {};
  const open = async (name: string, viewport?: { width: number; height: number }) => {
    const c = await newCtx(browser, viewport);
    contexts.push(c.ctx);
    consoleErrors[name] = c.errors;
    currentPage = c.page;
    return c.page;
  };

  let customerAId = "";
  let orderNumber = "";
  let adminMock = false;

  // ---------- 0. test-data repair (idempotent re-runs) ----------
  await step("0", "prep: detach mock user B from any previous customer", async () => {
    const n = await withTenant(getDb(), tid, async (tx) => (await tx.update(customers).set({ lineUserId: null }).where(and(eq(customers.tenantId, tid), eq(customers.lineUserId, USER_B.id))).returning({ id: customers.id })).length);
    await ensureStock(tid, "linen-shirt-sand", "LINEN-SHIRT-SAND-M", 2);
    return n ? `unlinked ${n} previous customer(s)` : "nothing to repair";
  });

  // ---------- A. admin ----------
  const admin = await open("admin");
  await step("A1", "admin login", async () => {
    await adminLogin(admin);
    return admin.url().replace(ADMIN, "");
  });
  await step("A2", "Settings > LINE Login tab + page render + callback URL", async () => {
    await goto(admin, adminLinePage);
    const tab = admin.locator('nav[aria-label="หมวดการตั้งค่า"] a[aria-current="page"]');
    assert((await text(tab)) === "LINE Login", `active tab = "${await text(tab)}"`);
    await admin.getByTestId("line-status").waitFor({ timeout: 60_000 });
    const cb = await admin.getByTestId("line-callback-url").allTextContents();
    assert(cb.includes(web("/api/auth/line/callback")), `callback urls = ${cb.join(", ")}`);
    adminMock = (await admin.getByTestId("line-mock-note").count()) > 0;
    return `state=${await admin.getByTestId("line-status").getAttribute("data-state")}, callback ok, admin mock note=${adminMock}`;
  });
  await step("A3", "reset: clear previously stored credentials (if any)", async () => {
    if ((await admin.getByTestId("line-clear").count()) === 0) return "already unconfigured";
    await admin.getByTestId("line-clear").click();
    await admin.getByTestId("line-clear-confirm").click();
    await waitToast(admin, "ลบข้อมูลการเชื่อมต่อ LINE Login แล้ว");
    assert(await poll(async () => (await admin.getByTestId("line-status").getAttribute("data-state")) === "unconfigured", 20_000), "status did not become unconfigured");
    const secrets = (await secretsOf(tid)).filter((s) => s.key.startsWith("line_login_"));
    assert(secrets.length === 0, `secrets still stored: ${secrets.map((s) => s.key).join(",")}`);
    return "cleared, secrets gone, flag off";
  });
  await step("A4", "enable switch is locked until credentials are present", async () => {
    const sw = admin.getByTestId("line-enabled");
    assert((await sw.getAttribute("aria-checked")) === "false", "switch should be off");
    assert(await sw.isDisabled(), "switch should be disabled without credentials");
    await admin.getByTestId("line-save").isDisabled();
    return "switch disabled, hint shown";
  });
  await step("A5", "ทดสอบ with a bad secret → rejected by the mock (shape ok)", async () => {
    await admin.getByTestId("line-channel-id").fill(CHANNEL_ID);
    await admin.getByTestId("line-channel-secret").fill(BAD_SECRET);
    await admin.getByTestId("line-test").click();
    const result = admin.getByTestId("line-test-result");
    await result.waitFor({ timeout: 60_000 });
    assert(await poll(async () => ["rejected", "reachable", "inconclusive", "unreachable"].includes((await result.getAttribute("data-probe")) ?? ""), 30_000), "no probe result");
    const probe = await result.getAttribute("data-probe");
    if (adminMock) assert(probe === "rejected", `probe = ${probe} (expected rejected from the mock)`);
    else if (probe !== "rejected") throw new Warn(`admin server is not in LINE_MOCK mode; probe = ${probe}`);
    return `probe=${probe}`;
  });
  await step("A6", "ทดสอบ with valid credentials → reachable", async () => {
    await admin.getByTestId("line-channel-secret").fill(SECRET);
    await admin.getByTestId("line-test").click();
    await waitToast(admin, "รูปแบบถูกต้องและติดต่อเซิร์ฟเวอร์ LINE ได้");
    const result = admin.getByTestId("line-test-result");
    assert(await poll(async () => (await result.getAttribute("data-probe")) === "reachable", 30_000), `probe = ${await result.getAttribute("data-probe")}`);
    const body = await text(result);
    assert(body.includes("รูปแบบ Channel ID ถูกต้อง") && body.includes("รูปแบบ Channel secret ถูกต้อง"), "shape lines missing");
    return "reachable, shape lines rendered";
  });
  await step("A7", "switch on + บันทึก → toast + status ready", async () => {
    const sw = admin.getByTestId("line-enabled");
    assert(!(await sw.isDisabled()), "switch still disabled with credentials typed");
    await sw.click();
    assert((await sw.getAttribute("aria-checked")) === "true", "switch did not turn on");
    await admin.getByTestId("line-save").click();
    await waitToast(admin, "ลูกค้าเข้าสู่ระบบด้วย LINE ได้แล้ว");
    assert(await poll(async () => (await admin.getByTestId("line-status").getAttribute("data-state")) === "ready", 20_000), "status did not become ready");
    return "saved, ready";
  });
  await step("A8", "DB: settings.lineLogin.enabled + encrypted secrets (hint only) + audit", async () => {
    const s = await tenantSettings();
    assert((s.lineLogin as { enabled?: boolean } | undefined)?.enabled === true, `settings.lineLogin = ${JSON.stringify(s.lineLogin)}`);
    const secrets = (await secretsOf(tid)).filter((x) => x.key.startsWith("line_login_"));
    const idRow = secrets.find((x) => x.key === "line_login_channel_id");
    const secRow = secrets.find((x) => x.key === "line_login_channel_secret");
    assert(idRow && secRow, `secrets = ${secrets.map((x) => x.key).join(",")}`);
    assert(secRow.ciphertext !== SECRET && !secRow.ciphertext.includes(SECRET), "secret stored in clear");
    assert(secRow.hint === SECRET.slice(-4), `hint = ${secRow.hint}`);
    const audits = (await auditSince(tid, "settings.update")).filter((a) => (a.diff as { section?: string } | null)?.section === "line_login");
    assert(audits.length >= 1, "no settings.update audit with section line_login");
    assert(!JSON.stringify(audits.map((a) => a.diff)).includes(SECRET), "audit diff leaks the secret");
    return `enabled, 2 secrets (hint …${secRow.hint}), ${audits.length} audit row(s)`;
  });
  await step("A9", "reload keeps Channel ID + masked secret; screenshots 1440/390", async () => {
    await goto(admin, adminLinePage);
    assert((await admin.getByTestId("line-channel-id").inputValue()) === CHANNEL_ID, "channel id not prefilled");
    assert((await admin.getByTestId("line-channel-secret").inputValue()) === "", "secret must not be prefilled");
    const ph = (await admin.getByTestId("line-channel-secret").getAttribute("placeholder")) ?? "";
    assert(ph.endsWith(SECRET.slice(-4)), `placeholder = ${ph}`);
    assert((await admin.getByTestId("line-status").getAttribute("data-state")) === "ready", "not ready after reload");
    await shot(admin, "line-admin-settings-desktop");
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.waitForTimeout(500);
    const ov = await overflowPx(admin);
    await shot(admin, "line-admin-settings-mobile");
    await admin.setViewportSize({ width: 1440, height: 900 });
    assert(ov <= 1, `horizontal overflow ${ov}px at 390`);
    return "prefilled, masked, screenshots saved, no overflow";
  });

  // ---------- S. storefront ----------
  const shop = await open("storefront");
  await step("S1", "login page shows the LINE button (within 60 s cache TTL)", async () => {
    const seen = await poll(
      async () => {
        await goto(shop, web("/account/login"));
        return (await shop.getByTestId("line-login-button").count()) > 0;
      },
      120_000,
      3_000,
    );
    assert(seen, "LINE button never appeared on /account/login");
    const btn = shop.getByTestId("line-login-button").first();
    assert((await text(btn)).includes("เข้าสู่ระบบด้วย LINE"), `button text = ${await text(btn)}`);
    const href = (await btn.getAttribute("href")) ?? "";
    assert(href.startsWith("/api/auth/line/start"), `href = ${href}`);
    const box = await btn.boundingBox();
    assert(box && box.height >= 44, `button height ${box?.height}`);
    await shot(shop, "line-login-desktop");
    return `button ${Math.round(box!.width)}x${Math.round(box!.height)}, href ${href}`;
  });
  await step("S2", "authorize request is OAuth 2.1 + PKCE; cancel on LINE → Thai message", async () => {
    await shop.getByTestId("line-login-button").first().click();
    await shop.waitForURL(/\/api\/dev\/line-mock\/oauth2\/v2\.1\/authorize/, { timeout: 120_000 });
    const u = new URL(shop.url());
    const q = u.searchParams;
    assert(q.get("response_type") === "code", "response_type");
    assert(q.get("client_id") === CHANNEL_ID, `client_id = ${q.get("client_id")}`);
    assert(q.get("redirect_uri") === web("/api/auth/line/callback"), `redirect_uri = ${q.get("redirect_uri")}`);
    assert(q.get("code_challenge_method") === "S256" && (q.get("code_challenge") ?? "").length >= 43, "PKCE missing");
    assert((q.get("state") ?? "").length >= 16 && (q.get("nonce") ?? "").length >= 16, "state/nonce missing");
    assert((q.get("scope") ?? "").split(" ").includes("openid"), `scope = ${q.get("scope")}`);
    await shop.getByTestId("line-mock-deny").click();
    await shop.waitForURL((x) => x.pathname === "/account/login", { timeout: 120_000 });
    await shop.waitForLoadState("networkidle");
    const err = await text(shop.getByTestId("line-login-error"));
    assert(err.includes("คุณยกเลิกการเข้าสู่ระบบด้วย LINE"), `error = ${err}`);
    return "PKCE S256 + state + nonce + openid; denied → Thai message";
  });
  await step("S3", "callback without a ticket / forged state → state_mismatch message", async () => {
    await goto(shop, web("/api/auth/line/callback?code=forged&state=forged"));
    assert(shop.url().includes("/account/login") && shop.url().includes("error=line_state_mismatch"), `landed on ${shop.url()}`);
    const err = await text(shop.getByTestId("line-login-error"));
    assert(err.includes("หมดเวลาหรือไม่ถูกต้อง"), `error = ${err}`);
    return "state_mismatch handled";
  });
  await step("S4", "login with mock user A → /account shows LINE-linked customer", async () => {
    await goto(shop, web("/account/login?next=%2Faccount"));
    await lineLoginVia(shop, USER_A.id, (u) => u.pathname === "/account");
    assert((await text(shop.getByTestId("account-name"))) === USER_A.name, `name = ${await text(shop.getByTestId("account-name"))}`);
    const card = shop.getByTestId("line-link-card");
    assert((await card.getAttribute("data-linked")) === "true", "card not linked");
    assert((await text(card)).includes("เชื่อมต่อ LINE แล้ว"), "linked label missing");
    assert(await shop.getByTestId("line-unlink").isDisabled(), "LINE-only customer must not be able to unlink");
    assert((await bodyText(shop)).includes("ยังไม่มีเบอร์โทรศัพท์หรืออีเมล"), "explanation for the disabled unlink missing");
    const rows = await customersByLine(tid, USER_A.id);
    assert(rows.length === 1, `${rows.length} customers carry ${USER_A.id}`);
    const c = rows[0]!;
    assert(c.email === null && c.phone === null, `LINE customer got identity fields: ${c.email} / ${c.phone}`);
    assert(c.name === USER_A.name, `name stored = ${c.name}`);
    assert((c.avatar ?? "").includes("/api/dev/line-mock/picture/"), `avatar = ${c.avatar}`);
    customerAId = c.id;
    await shot(shop, "line-account-desktop");
    return `customer ${customerAId.slice(0, 8)}… (${c.name}), no email/phone, avatar stored`;
  });
  await step("S5", "place an order as the LINE customer → order.customer_id = LINE customer", async () => {
    await goto(shop, web("/products/linen-shirt-sand"));
    await shop.locator("button[aria-pressed]", { hasText: /^M$/ }).first().click();
    const added = shop.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() === "POST", { timeout: 60_000 });
    const addBtns = shop.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    for (let i = 0; i < (await addBtns.count()); i++) {
      if (await addBtns.nth(i).isVisible()) {
        await addBtns.nth(i).click();
        break;
      }
    }
    await shop.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ state: "visible", timeout: 20_000 });
    // the toast is optimistic — wait for the POST (it sets the cart cookie), then enter checkout from the cart like a customer
    assert((await added).status() === 200, "add to cart failed");
    await goto(shop, web("/cart"));
    await shop.getByRole("link", { name: /ไปชำระเงิน/ }).first().click();
    await shop.waitForURL(/\/checkout/, { timeout: 60_000 });
    await shop.waitForLoadState("networkidle");
    const labels = shop.locator('div[role="radiogroup"][aria-label="วิธีจัดส่ง"] label');
    const n = await labels.count();
    assert(n > 0, "no shipping options");
    let picked = "";
    for (let i = 0; i < n; i++) {
      const t = await text(labels.nth(i));
      if (!t.includes("ปลายทาง")) {
        await labels.nth(i).click();
        picked = t;
        break;
      }
    }
    assert(picked, "no non-COD shipping option");
    await shop.fill("#name", USER_A.name);
    await shop.fill("#phone", `08${String(Date.now()).slice(-8)}`);
    await shop.fill("#email", `line-qa+${Date.now()}@example.com`);
    await shop.fill("#line1", "99/1 หมู่บ้านทดสอบ ถนนสุขุมวิท");
    await shop.fill("#subdistrict", "คลองเตย");
    await shop.fill("#district", "คลองเตย");
    await shop.selectOption("#province", "กรุงเทพมหานคร");
    await shop.fill("#postalCode", "10110");
    const pp = shop.getByText("สแกน PromptPay", { exact: true });
    if (await pp.count()) await pp.first().click();
    const submits = shop.locator('button[type="submit"]', { hasText: "สั่งซื้อและชำระเงิน" });
    let clicked = false;
    for (let i = 0; i < (await submits.count()); i++) {
      if (await submits.nth(i).isVisible()) {
        await submits.nth(i).click();
        clicked = true;
        break;
      }
    }
    assert(clicked, "no visible place-order button");
    await shop.waitForURL(/\/orders\/[0-9a-f-]{36}\?k=/, { timeout: 120_000 });
    await shop.waitForLoadState("networkidle");
    const orderId = shop.url().match(/\/orders\/([0-9a-f-]{36})/)![1]!;
    const [o] = await withTenant(getDb(), tid, (tx) => tx.select({ customerId: orders.customerId, number: orders.number }).from(orders).where(and(eq(orders.tenantId, tid), eq(orders.id, orderId))).limit(1));
    assert(o, "order row missing");
    assert(o.customerId === customerAId, `order.customer_id = ${o.customerId}, expected ${customerAId}`);
    orderNumber = o.number;
    const after = await customerById(tid, customerAId);
    assert(after && after.phone === null && after.email === null, "checkout must not attach unverified phone/e-mail to the LINE customer");
    return `order ${orderNumber} via "${picked}" belongs to the LINE customer; identity fields untouched`;
  });
  await step("S5b", "pay by slip (DEV_AUTO_APPROVE_SLIPS) → order paid", async () => {
    const file = shop.locator('input[type="file"]');
    if ((await file.count()) === 0) throw new Warn("no slip upload on this order (payment method without slip)");
    const slipPath = path.join(outDir, "_qa-slip.png");
    await writeFile(slipPath, PNG_1x1);
    await file.first().setInputFiles(slipPath);
    await shop.getByText("ชำระเงินสำเร็จ").first().waitFor({ state: "visible", timeout: 30_000 });
    const paid = await poll(async () => (await shop.getByText("ชำระเงินเรียบร้อย").count()) > 0, 30_000);
    if (!paid) {
      await shop.reload({ waitUntil: "networkidle" });
      assert((await shop.getByText("ชำระเงินเรียบร้อย").count()) > 0, "paid banner not shown");
    }
    return "paid";
  });
  await step("S6", "/account/orders lists the order for this customer", async () => {
    assert(orderNumber, "no order number from S5");
    await goto(shop, web("/account/orders"));
    const ok = await poll(async () => (await bodyText(shop)).includes(orderNumber), 20_000);
    assert(ok, `order ${orderNumber} not listed`);
    return `${orderNumber} listed`;
  });
  await step("S7", "logout → /account needs login again", async () => {
    await goto(shop, web("/account"));
    await shop.getByRole("button", { name: /ออกจากระบบ/ }).first().click();
    await shop.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
    await goto(shop, web("/account"));
    assert(shop.url().includes("/account/login"), `landed on ${shop.url()}`);
    return "session revoked";
  });
  await step("S8", "login again with LINE → same customer (no duplicate)", async () => {
    await lineLoginVia(shop, USER_A.id, (u) => u.pathname === "/account");
    assert((await text(shop.getByTestId("account-name"))) === USER_A.name, "name changed");
    const rows = await customersByLine(tid, USER_A.id);
    assert(rows.length === 1 && rows[0]!.id === customerAId, `expected 1 customer ${customerAId}, got ${rows.map((r) => r.id).join(",")}`);
    await goto(shop, web("/account/orders"));
    assert((await bodyText(shop)).includes(orderNumber), "previous order not visible after re-login");
    return `same customer ${customerAId.slice(0, 8)}…, order ${orderNumber} still visible`;
  });

  // ---------- L. link / unlink with an OTP customer ----------
  const otp = await open("otp-customer");
  const phoneB = `09${String(Date.now()).slice(-8)}`;
  let customerBId = "";
  await step("L1", "OTP customer signs in → account card offers เชื่อมต่อ LINE", async () => {
    await otpLogin(otp, phoneB, "สมหญิง ทดสอบ");
    const card = otp.getByTestId("line-link-card");
    assert((await card.getAttribute("data-linked")) === "false", "fresh OTP customer should not be linked");
    const href = (await card.getByTestId("line-login-button").getAttribute("href")) ?? "";
    assert(href.includes("link=1"), `link href = ${href}`);
    const c = await customerByPhone(tid, phoneB);
    assert(c, "OTP customer row missing");
    customerBId = c.id;
    return `customer ${customerBId.slice(0, 8)}… (${phoneB})`;
  });
  await step("L2", "link LINE user B → banner + card linked; name/phone kept", async () => {
    await lineLoginVia(otp, USER_B.id, (u) => u.pathname === "/account" && u.searchParams.get("line") === "linked");
    assert((await text(otp.getByTestId("line-banner"))).includes("เชื่อมต่อบัญชี LINE สำเร็จ"), "linked banner missing");
    assert((await otp.getByTestId("line-link-card").getAttribute("data-linked")) === "true", "card not linked");
    const c = await customerById(tid, customerBId);
    assert(c && c.lineUserId === USER_B.id, `lineUserId = ${c?.lineUserId}`);
    assert(c.phone === phoneB && c.name === "สมหญิง ทดสอบ", `identity changed: ${c.phone} / ${c.name}`);
    const audits = await auditSince(tid, "customer.line.link");
    assert(audits.some((a) => a.targetId === customerBId), "no customer.line.link audit");
    return "linked, OTP identity preserved, audited";
  });
  await step("L3", "already_linked: OTP customer cannot grab LINE user A (belongs to customer A)", async () => {
    // detach B first so the card shows the connect button again
    await otp.getByTestId("line-unlink").click();
    await otp.getByTestId("line-unlink-confirm").click();
    await otp.waitForURL((u) => u.pathname === "/account" && u.searchParams.get("line") === "unlinked", { timeout: 60_000 });
    await otp.waitForLoadState("networkidle");
    assert((await text(otp.getByTestId("line-banner"))).includes("ยกเลิกการเชื่อมต่อ LINE แล้ว"), "unlinked banner missing");
    assert((await otp.getByTestId("line-link-card").getAttribute("data-linked")) === "false", "card still linked");
    const c = await customerById(tid, customerBId);
    assert(c && c.lineUserId === null, `lineUserId after unlink = ${c?.lineUserId}`);
    assert((await auditSince(tid, "customer.line.unlink")).some((a) => a.targetId === customerBId), "no customer.line.unlink audit");
    await lineLoginVia(otp, USER_A.id, (u) => u.pathname === "/account" && !!u.searchParams.get("line_error"));
    assert(otp.url().includes("line_error=already_linked"), `landed on ${otp.url()}`);
    assert((await text(otp.getByTestId("line-banner"))).includes("เชื่อมต่อกับลูกค้าท่านอื่นอยู่แล้ว"), "already_linked message missing");
    const a = await customerById(tid, customerAId);
    assert(a && a.lineUserId === USER_A.id, "customer A lost its LINE link");
    return "unlink ok (audited); linking A's LINE id refused";
  });
  await step("L4", "LINE login as user B after unlink → NEW LINE-only customer (never merged by e-mail)", async () => {
    const fresh = await open("line-b");
    await goto(fresh, web("/account/login"));
    await lineLoginVia(fresh, USER_B.id, (u) => u.pathname === "/account");
    assert((await text(fresh.getByTestId("account-name"))) === USER_B.name, "name");
    const rows = await customersByLine(tid, USER_B.id);
    assert(rows.length === 1 && rows[0]!.id !== customerBId, `expected a new customer, got ${rows.map((r) => r.id).join(",")}`);
    assert(rows[0]!.phone === null && rows[0]!.email === null, "new LINE customer must have no phone/e-mail");
    return `new customer ${rows[0]!.id.slice(0, 8)}… separate from OTP customer ${customerBId.slice(0, 8)}…`;
  });

  // ---------- M. mobile ----------
  await step("M1", "390px: login page, mock picker, account page — tap targets + no overflow + screenshots", async () => {
    const m = await open("mobile", { width: 390, height: 844 });
    await goto(m, web("/account/login"));
    const btn = m.getByTestId("line-login-button").first();
    const box = await btn.boundingBox();
    assert(box && box.height >= 44 && box.width >= 200, `button ${box?.width}x${box?.height}`);
    const ov1 = await overflowPx(m);
    await shot(m, "line-login-mobile");
    await btn.click();
    await m.waitForURL(/line-mock\/oauth2\/v2\.1\/authorize/, { timeout: 120_000 });
    const ov2 = await overflowPx(m);
    await shot(m, "line-mock-picker-mobile");
    await m.locator(`[data-testid="line-mock-user"][data-user="${USER_A.id}"]`).click();
    await m.waitForURL((u) => u.pathname === "/account", { timeout: 120_000 });
    await m.waitForLoadState("networkidle");
    const ov3 = await overflowPx(m);
    await shot(m, "line-account-mobile");
    assert(ov1 <= 1 && ov2 <= 1 && ov3 <= 1, `overflow login=${ov1} picker=${ov2} account=${ov3}`);
    return `button ${Math.round(box!.width)}x${Math.round(box!.height)}; no overflow on 3 pages`;
  });

  // ---------- A10/A11. admin off switch + restore ----------
  await step("A10", "admin switches LINE off → storefront hides the button; /start → not_enabled message", async () => {
    await goto(admin, adminLinePage);
    const sw = admin.getByTestId("line-enabled");
    assert((await sw.getAttribute("aria-checked")) === "true", "expected enabled before switching off");
    await sw.click();
    await admin.getByTestId("line-save").click();
    await waitToast(admin, "LINE Login ยังปิดใช้งานอยู่");
    assert(await poll(async () => (await admin.getByTestId("line-status").getAttribute("data-state")) === "off", 20_000), "status not off");
    const check = await open("off-check");
    const hidden = await poll(
      async () => {
        await goto(check, web("/account/login"));
        return (await check.getByTestId("line-login-button").count()) === 0;
      },
      120_000,
      3_000,
    );
    assert(hidden, "LINE button still shown after disabling");
    await goto(check, web("/api/auth/line/start?next=%2Faccount"));
    assert(check.url().includes("error=line_not_enabled"), `landed on ${check.url()}`);
    assert((await text(check.getByTestId("line-login-error"))).includes("ยังไม่เปิดให้เข้าสู่ระบบด้วย LINE"), "not_enabled message missing");
    return "button hidden, /start refused with Thai message";
  });
  await step("A11", "admin switches LINE back on (leave demo-shop enabled)", async () => {
    const sw = admin.getByTestId("line-enabled");
    await sw.click();
    await admin.getByTestId("line-save").click();
    await waitToast(admin, "ลูกค้าเข้าสู่ระบบด้วย LINE ได้แล้ว");
    assert((await tenantSettings()).lineLogin && ((await tenantSettings()).lineLogin as { enabled?: boolean }).enabled === true, "flag not restored");
    return "enabled again";
  });

  await step("Z", "console errors across all contexts", async () => {
    const all = Object.entries(consoleErrors).flatMap(([k, v]) => [...new Set(v)].map((e) => `[${k}] ${e}`));
    if (all.length) throw new Error(`${all.length} console error(s): ${all.slice(0, 4).join(" || ")}`);
    return "none";
  });

  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  console.log(`\n${fails === 0 ? "✓" : "✗"} line_login journey: ${results.length - fails - warns} passed, ${warns} warn, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
