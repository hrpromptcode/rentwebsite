import "../load-env";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, count, customers, eq, getAdminDb, like, navigation, pages, plans, tenantDomains, tenantInvitations, tenants } from "@rentweb/db";
import { PRESETS } from "@rentweb/core/theme";
import { isolateHmr } from "./bughunt/fixes/_dev-stable";

/**
 * Independent QA journey for the admin app (round 1). Drives http://localhost:3001 with Playwright,
 * verifies side effects in Postgres and on the storefront (http://<slug>.localhost:3000) and prints PASS/FAIL per step.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/admin-journey.ts [--only 4,5] [--headed]
 * Writes tooling/qa/admin-journey-results.json progressively and tooling/screenshots/qa-admin-fail-*.png on failures.
 */

const ADMIN = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const WEB_PORT = 3000;
const EMAIL = "admin@rentweb.local";
const PASSWORD = "Admin1234!";
const SLUG = "demo-shop";
const RAND = Math.random().toString(36).slice(2, 6);
const args = process.argv.slice(2);
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1]! : null;
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
const HEADED = args.includes("--headed");

const outDir = path.resolve(process.cwd(), "screenshots");
const qaDir = path.resolve(process.cwd(), "qa");

type Status = "PASS" | "FAIL" | "WARN" | "SKIP";
interface Result {
  step: string;
  status: Status;
  detail: string;
  ms: number;
  screenshot?: string;
}
const results: Result[] = [];
const db = getAdminDb();
let browser: Browser;
let currentPage: Page | null = null;

function log(r: Result) {
  const tag = r.status.padEnd(4);
  console.log(`[${tag}] ${r.step} (${r.ms}ms)${r.detail ? ` — ${r.detail}` : ""}${r.screenshot ? ` [${r.screenshot}]` : ""}`);
}

async function persist() {
  await mkdir(qaDir, { recursive: true });
  await writeFile(path.join(qaDir, "admin-journey-results.json"), JSON.stringify({ rand: RAND, at: new Date().toISOString(), results }, null, 2));
}

class Warn extends Error {}

async function step(id: string, name: string, fn: () => Promise<string | void>) {
  const label = `${id} ${name}`;
  if (ONLY && !ONLY.has(id.split(".")[0]!) && !ONLY.has(id)) {
    results.push({ step: label, status: "SKIP", detail: "", ms: 0 });
    return;
  }
  const t0 = Date.now();
  try {
    const detail = (await fn()) ?? "";
    const r: Result = { step: label, status: "PASS", detail, ms: Date.now() - t0 };
    results.push(r);
    log(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ").slice(0, 400) : String(e);
    const r: Result = { step: label, status: e instanceof Warn ? "WARN" : "FAIL", detail: msg, ms: Date.now() - t0 };
    if (currentPage && !currentPage.isClosed() && !(e instanceof Warn)) {
      try {
        const file = `qa-admin-fail-${id.replace(/[^a-z0-9]/gi, "_")}.png`;
        await currentPage.screenshot({ path: path.join(outDir, file), fullPage: false });
        r.screenshot = `tooling/screenshots/${file}`;
      } catch {
        /* ignore */
      }
    }
    results.push(r);
    log(r);
  }
  await persist();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/* ---------- helpers ---------- */

function fetchTenant(slug: string, pathname = "/", host = `${slug}.localhost:${WEB_PORT}`): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: WEB_PORT, path: pathname, method: "GET", headers: { Host: host, Accept: "text/html" } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(120_000, () => req.destroy(new Error("storefront timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** Polls the storefront until predicate(body) is true; returns elapsed ms. */
async function waitStorefront(slug: string, pathname: string, pred: (body: string) => boolean, timeoutMs = 75_000): Promise<number> {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    const r = await fetchTenant(slug, pathname);
    last = `status=${r.status}`;
    if (r.status === 200 && pred(r.body)) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`storefront did not reflect change within ${timeoutMs / 1000}s (${last})`);
}

function makePng(w: number, h: number): Buffer {
  const table = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const stripe = Math.floor(x / 16) % 2 === 0;
      raw[o] = stripe ? 0x0e : 0xf9;
      raw[o + 1] = stripe ? 0xa5 : 0x73;
      raw[o + 2] = stripe ? 0xe9 : 0x16;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function newPage(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(120_000);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const errors: string[] = [];
  (page as unknown as { __errors: string[] }).__errors = errors;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  currentPage = page;
  return page;
}
const pageErrors = (page: Page) => (page as unknown as { __errors: string[] }).__errors;
function drainErrors(page: Page): string[] {
  const e = pageErrors(page);
  const out = e.filter((x) => !/favicon|ERR_ABORTED|Download the React DevTools|net::ERR_FAILED.*uploads|beforeunload/i.test(x));
  e.length = 0;
  return out;
}

async function goto(page: Page, pathname: string) {
  const res = await page.goto(`${ADMIN}${pathname}`, { waitUntil: "networkidle" });
  return res?.status() ?? 0;
}

/** Runs `action` and waits for a NEW toast matching `re` (ignores toasts that were already on screen). */
async function expectToast(page: Page, re: RegExp, action?: () => Promise<unknown>, timeout = 45_000) { // server actions can sit behind a shared dev-server recompile
  const loc = page.locator("[data-sonner-toast]").filter({ hasText: re });
  const before = await loc.count();
  // mark the toasts already on screen: counting alone races when an earlier identical toast (e.g. the previous
  // "เผยแพร่แล้ว") times out at the moment the new one appears (count stays 1 → 1)
  await page.evaluate(() => document.querySelectorAll("[data-sonner-toast]").forEach((t) => t.setAttribute("data-qa-seen", "1")));
  if (action) await action();
  try {
    await page.waitForFunction(
      ({ src }) => {
        const r = new RegExp(src);
        return Array.from(document.querySelectorAll("[data-sonner-toast]:not([data-qa-seen])")).some((t) => r.test(t.textContent ?? ""));
      },
      { src: re.source },
      { timeout },
    );
  } catch {
    const any = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    throw new Error(`new toast ${re} not shown (had ${before}); toasts seen: ${JSON.stringify(any).slice(0, 300)}`);
  }
}

async function loginViaUi(page: Page, email: string, password: string) {
  await goto(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
  await page.waitForLoadState("networkidle");
}

async function selectRadix(page: Page, triggerSel: string, optionRe: RegExp | null) {
  await page.locator(triggerSel).click();
  const listbox = page.locator("[role=listbox]").last();
  await listbox.waitFor({ state: "visible" });
  const options = listbox.locator("[role=option]");
  const texts = await options.allInnerTexts();
  let idx = optionRe ? texts.findIndex((t) => optionRe.test(t)) : -1;
  if (idx < 0) idx = texts.findIndex((t) => !/data-state=checked/.test(t));
  const chosen = texts[idx] ?? "";
  await options.nth(idx).click();
  return { texts, chosen };
}

async function tenantRow(slug: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  assert(t, `tenant ${slug} not found`);
  return t;
}

/* ---------- main ---------- */

async function main() {
  await mkdir(outDir, { recursive: true });
  browser = await chromium.launch({ headless: !HEADED });
  const demo = await tenantRow(SLUG);
  const origTheme = JSON.parse(JSON.stringify(demo.theme ?? {}));
  const origSettings = JSON.parse(JSON.stringify(demo.settings ?? {}));
  console.log(`run ${RAND} · demo-shop ${demo.id} · theme.preset=${(origTheme as { preset?: string }).preset}`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(ctx); // shared dev server: drop HMR full-reload frames so a reload does not wipe unsaved editor state mid-step
  const page = await newPage(ctx);

  /* 1. login */
  await step("1.1", "login: wrong password shows Thai error", async () => {
    await goto(page, "/login");
    await page.fill("#email", EMAIL);
    await page.fill("#password", "WrongPass999!");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    const alert = page.locator("form p[role=alert]");
    await alert.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(() => (document.querySelector("form p[role=alert]")?.textContent ?? "").trim().length > 0, null, { timeout: 20_000 });
    const text = (await alert.innerText()).trim();
    assert(/อีเมลหรือรหัสผ่านไม่ถูกต้อง/.test(text), `unexpected error text: ${text}`);
    assert(page.url().includes("/login"), "navigated away despite wrong password");
    return text;
  });

  await step("1.2", "login: correct password redirects to a tenant dashboard", async () => {
    await page.fill("#password", PASSWORD);
    await Promise.all([page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 60_000 }), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
    await page.waitForLoadState("networkidle");
    return page.url();
  });

  /* 2. tenant switcher */
  await step("2", "tenant switcher lists the 7 demo tenants", async () => {
    await goto(page, `/t/${SLUG}/dashboard`);
    const trigger = page.locator("header button").filter({ hasText: demo.name }).first();
    await trigger.click();
    const menu = page.locator("[role=menu]");
    await menu.waitFor({ state: "visible" });
    const links = menu.locator("[role=menuitem] a[href$='/dashboard'], a[role=menuitem][href$='/dashboard']");
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));
    const slugs = hrefs.map((h) => h.split("/")[2]!).sort();
    const expected = ["demo-cafe", "demo-clinic", "demo-corporate", "demo-restaurant", "demo-salon", "demo-shop", "demo-topup"];
    await page.keyboard.press("Escape");
    const missing = expected.filter((s) => !slugs.includes(s));
    assert(missing.length === 0, `missing tenants in switcher: ${missing.join(",")} (got ${slugs.join(",")})`);
    const extra = slugs.filter((s) => !expected.includes(s));
    return `${slugs.length} tenants${extra.length ? ` (+extra: ${extra.join(",")})` : ""}`;
  });

  /* 3. dashboard */
  await step("3", "dashboard KPIs + onboarding checklist render", async () => {
    drainErrors(page); // drop the expected 401 from the wrong-password attempt in 1.1
    const status = await goto(page, `/t/${SLUG}/dashboard`);
    assert(status === 200, `HTTP ${status}`);
    const kpi = page.locator("section[aria-label='ตัวเลขวันนี้']");
    await kpi.waitFor({ state: "visible" });
    const cards = await kpi.locator(":scope > *").count();
    assert(cards >= 2, `only ${cards} KPI cards`);
    await page.getByText("เช็กลิสต์เริ่มต้นใช้งาน").waitFor({ state: "visible" });
    const items = await page.locator("[role=progressbar]").count();
    assert(items === 1, "progress bar missing");
    const checklist = await page.locator("ul.divide-y > li").count();
    assert(checklist >= 5, `checklist has ${checklist} items`);
    const errs = drainErrors(page);
    assert(errs.length === 0, `console errors: ${errs.join(" || ")}`);
    return `${cards} KPI cards, ${checklist} checklist items, KPI text: ${(await kpi.innerText()).replace(/\s+/g, " ").slice(0, 120)}`;
  });

  /* 4. design */
  const primaryHex = "#0ea5e9";
  await step("4.1", "design: change primary color, save → DB + storefront", async () => {
    await goto(page, `/t/${SLUG}/design`);
    await page.getByRole("tab", { name: "สี" }).click();
    const input = page.locator("#color-primary");
    await input.fill(primaryHex);
    await expectToast(page, /บันทึก/, () => page.getByRole("button", { name: "บันทึกและเผยแพร่" }).click());
    const t = await tenantRow(SLUG);
    const theme = t.theme as { colors?: { primary?: string } };
    assert(theme.colors?.primary?.toLowerCase() === primaryHex, `DB primary = ${theme.colors?.primary}`);
    const ms = await waitStorefront(SLUG, "/", (b) => new RegExp(`--primary:\\s*${primaryHex}`, "i").test(b));
    const note = ms > 8000 ? ` — storefront took ${(ms / 1000).toFixed(0)}s to reflect (cache not shared across processes?)` : ` — storefront reflected in ${ms}ms`;
    return `tenants.theme.colors.primary=${primaryHex}${note}`;
  });

  await step("4.2", "design: contrast warning appears for a bad color (live, unsaved)", async () => {
    await page.getByRole("tab", { name: "สี" }).click();
    await page.locator("#color-foreground").fill("#f2f2f2");
    await page.locator("#color-background").fill("#ffffff");
    const alert = page.getByRole("alert").filter({ hasText: "คอนทราสต์ต่ำ" });
    // the text/background line is the one caused by this edit; the alert itself can stay for the saved primary
    // (#0ea5e9 from 4.1 fails the newer "primary used as text on the background" 4.5:1 check — intended)
    const fgLine = alert.locator("li").filter({ hasText: "ข้อความหลักกับพื้นหลัง" });
    await fgLine.first().waitFor({ state: "visible", timeout: 10_000 });
    const text = (await alert.innerText()).replace(/\s+/g, " ").slice(0, 200);
    await page.getByRole("button", { name: "ยกเลิก" }).click();
    await page.waitForTimeout(300);
    assert((await fgLine.count()) === 0, "text/background warning still visible after cancel");
    assert((await page.locator("#color-foreground").inputValue()).toLowerCase() !== "#f2f2f2", "cancel did not restore the saved text colour");
    return text;
  });

  let newPresetKey = "";
  await step("4.3", "design: switch preset, save → DB + storefront", async () => {
    await page.getByRole("tab", { name: "ธีม" }).click();
    const presetPanel = page.getByRole("tabpanel").filter({ has: page.locator("button[aria-pressed]") });
    const cards = presetPanel.locator("div.grid > button[aria-pressed]");
    const n = await cards.count();
    assert(n >= 2, `only ${n} preset cards`);
    let target = -1;
    for (let i = 0; i < n; i++) {
      if ((await cards.nth(i).getAttribute("aria-pressed")) !== "true") {
        target = i;
        break;
      }
    }
    const name = (await cards.nth(target).locator("p").first().innerText()).trim();
    await cards.nth(target).click();
    await expectToast(page, /บันทึก/, () => page.getByRole("button", { name: "บันทึกและเผยแพร่" }).click());
    const t = await tenantRow(SLUG);
    const theme = t.theme as { preset?: string; colors?: Record<string, string> };
    newPresetKey = theme.preset ?? "";
    const entry = Object.values(PRESETS).find((p) => p.name.th === name);
    assert(entry && theme.preset === entry.key, `DB preset=${theme.preset}, clicked "${name}" (${entry?.key})`);
    assert(!theme.colors?.primary, "custom primary should be reset by preset change");
    const pal = entry.defaultMode === "dark" ? entry.dark : entry.light;
    const ms = await waitStorefront(SLUG, "/", (b) => new RegExp(`--primary:\\s*${pal.primary}`, "i").test(b));
    return `preset=${entry.key} (${name}); storefront reflected in ${(ms / 1000).toFixed(1)}s`;
  });

  await step("4.4", "design: restore original aurora preset", async () => {
    const origPreset = (origTheme as { preset?: string }).preset ?? "aurora";
    const name = PRESETS[origPreset]?.name.th;
    assert(name, `unknown original preset ${origPreset}`);
    await page.getByRole("tab", { name: "ธีม" }).click();
    const card = page.locator("button[aria-pressed]").filter({ hasText: name }).first();
    await card.click();
    await page.waitForFunction((n) => [...document.querySelectorAll("button[aria-pressed='true']")].some((b) => b.textContent?.includes(n)), name, { timeout: 15_000 });
    await expectToast(page, /บันทึก/, () => page.getByRole("button", { name: "บันทึกและเผยแพร่" }).click());
    let t = await tenantRow(SLUG);
    const same = JSON.stringify(t.theme) === JSON.stringify(origTheme);
    if (!same) {
      // UI restore only sets the preset; put back the exact original JSON (brand/logo overrides etc.)
      await db.update(tenants).set({ theme: origTheme }).where(eq(tenants.id, demo.id));
      t = await tenantRow(SLUG);
    }
    const pal = PRESETS[origPreset]!.light;
    await waitStorefront(SLUG, "/", (b) => new RegExp(`--primary:\\s*${pal.primary}`, "i").test(b));
    return same ? `preset ${origPreset} restored via UI, theme JSON identical` : `preset ${origPreset} restored via UI; exact original JSON written back via DB (UI preset reset drops overrides)`;
  });

  /* 5. pages */
  const [home] = await db.select().from(pages).where(and(eq(pages.tenantId, demo.id), eq(pages.kind, "home"))).limit(1);
  const origSections = JSON.parse(JSON.stringify(home?.sections ?? []));
  const origPublished = JSON.parse(JSON.stringify(home?.publishedSections ?? []));
  const faqHeading = `QA FAQ ${RAND}`;

  await step("5.1", "pages: list → open home editor", async () => {
    assert(home, "home page row missing");
    const status = await goto(page, `/t/${SLUG}/pages`);
    assert(status === 200, `HTTP ${status}`);
    const link = page.locator(`a[href='/t/${SLUG}/pages/${home.id}']`).first();
    await link.click();
    await page.waitForURL(new RegExp(`/pages/${home.id}$`));
    await page.waitForLoadState("networkidle");
    await page.getByText("เซ็กชัน", { exact: false }).first().waitFor();
    const n = await page.locator("ol.divide-y > li").count();
    assert(n === origSections.length, `editor shows ${n} sections, DB has ${origSections.length}`);
    return `home "${home.title}" (${home.id}) with ${n} sections`;
  });

  await step("5.2", "pages: add FAQ section via dialog + edit props via auto-form", async () => {
    await page.getByRole("button", { name: "เพิ่มเซ็กชัน" }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "เพิ่มเซ็กชัน" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByLabel("ค้นหาเซ็กชัน").fill("คำถาม");
    await dialog.locator("button").filter({ hasText: "คำถามที่พบบ่อย" }).first().click();
    await dialog.waitFor({ state: "hidden" });
    const activeRow = page.locator("ol.divide-y > li").filter({ has: page.locator("button[aria-current='true']") });
    await activeRow.waitFor({ state: "visible" });
    assert((await activeRow.innerText()).includes("คำถามที่พบบ่อย"), "newly added section is not the selected FAQ row");
    await page.locator("#f-heading").fill(faqHeading);
    const row = page.locator("ol.divide-y > li").filter({ hasText: faqHeading });
    await page.getByRole("button", { name: "เพิ่มรายการ" }).click();
    await page.locator("#f-items-0-q").fill(`คำถามทดสอบ ${RAND}`);
    await page.locator("#f-items-0-a").fill(`คำตอบทดสอบ ${RAND}`);
    const sub = await row.innerText();
    assert(sub.includes(faqHeading), `section row subtitle did not update: ${sub}`);
    return `FAQ added with heading "${faqHeading}" + 1 item`;
  });

  await step("5.3", "pages: reorder (move FAQ down)", async () => {
    const rows = page.locator("ol.divide-y > li");
    const before = (await rows.allInnerTexts()).findIndex((t) => t.includes(faqHeading));
    const row = rows.filter({ hasText: faqHeading });
    await row.getByRole("button", { name: "เลื่อนลง" }).click();
    const after = (await rows.allInnerTexts()).findIndex((t) => t.includes(faqHeading));
    assert(after === before + 1, `index ${before} → ${after}`);
    return `moved from position ${before + 1} to ${after + 1}`;
  });

  await step("5.4", "pages: save draft → DB sections updated", async () => {
    await expectToast(page, /บันทึกฉบับร่างแล้ว/, () => page.getByRole("button", { name: "บันทึกร่าง" }).first().click());
    const [p] = await db.select({ sections: pages.sections, publishedSections: pages.publishedSections }).from(pages).where(eq(pages.id, home!.id));
    const faq = (p!.sections ?? []).find((s) => s.type === "faq" && (s.props as { heading?: string }).heading === faqHeading);
    assert(faq, "draft sections do not contain the FAQ");
    assert(!JSON.stringify(p!.publishedSections ?? []).includes(faqHeading), "publishedSections changed on draft save");
    return "draft saved; published untouched";
  });

  await step("5.5", "pages: publish → storefront shows FAQ", async () => {
    await expectToast(page, /เผยแพร่แล้ว/, () => page.getByRole("button", { name: "เผยแพร่", exact: true }).click());
    const [p] = await db.select({ publishedSections: pages.publishedSections, status: pages.status }).from(pages).where(eq(pages.id, home!.id));
    assert(JSON.stringify(p!.publishedSections ?? []).includes(faqHeading), "publishedSections missing FAQ");
    const ms = await waitStorefront(SLUG, "/", (b) => b.includes(faqHeading));
    return `storefront shows "${faqHeading}" after ${(ms / 1000).toFixed(1)}s`;
  });

  await step("5.6", "pages: remove FAQ + publish → storefront no longer shows it", async () => {
    const row = page.locator("ol.divide-y > li").filter({ hasText: faqHeading });
    await row.locator("button.flex-1").first().click();
    await page.getByRole("button", { name: "ลบเซ็กชัน" }).click();
    assert((await row.count()) === 0, "row still present after remove");
    await expectToast(page, /เผยแพร่แล้ว/, () => page.getByRole("button", { name: "เผยแพร่", exact: true }).click());
    const [p] = await db.select({ sections: pages.sections, publishedSections: pages.publishedSections }).from(pages).where(eq(pages.id, home!.id));
    assert(JSON.stringify(p!.sections) === JSON.stringify(origSections), "draft sections differ from original after removal");
    assert(JSON.stringify(p!.publishedSections) === JSON.stringify(origPublished) || !JSON.stringify(p!.publishedSections).includes(faqHeading), "publishedSections still contain FAQ");
    const ms = await waitStorefront(SLUG, "/", (b) => !b.includes(faqHeading));
    return `FAQ gone from storefront after ${(ms / 1000).toFixed(1)}s`;
  });

  // safety net: restore home page sections if a sub-step failed midway
  {
    const [p] = await db.select({ sections: pages.sections, publishedSections: pages.publishedSections }).from(pages).where(eq(pages.id, home!.id));
    if (p && (JSON.stringify(p.sections) !== JSON.stringify(origSections) || JSON.stringify(p.publishedSections) !== JSON.stringify(origPublished))) {
      await db.update(pages).set({ sections: origSections, publishedSections: origPublished }).where(eq(pages.id, home!.id));
      console.log("  (restored home page sections via DB)");
    }
  }

  /* 6. navigation */
  const navRows = await db.select().from(navigation).where(eq(navigation.tenantId, demo.id));
  const navLabel = `QA เมนู ${RAND}`;
  await step("6", "navigation: add header item, save → DB + storefront; then remove", async () => {
    const status = await goto(page, `/t/${SLUG}/navigation`);
    assert(status === 200, `HTTP ${status}`);
    await page.getByRole("tab", { name: /ส่วนหัว/ }).click();
    const panel = page.getByRole("tabpanel");
    const before = await panel.locator("input[aria-label='ชื่อเมนู']").count();
    await panel.getByRole("button", { name: "เพิ่มเมนู", exact: true }).click();
    const labels = panel.locator("input[aria-label='ชื่อเมนู']");
    assert((await labels.count()) === before + 1, "row not added");
    await labels.last().fill(navLabel);
    await panel.locator("input[aria-label='ลิงก์']").last().fill("/about");
    await expectToast(page, /บันทึกเมนูนำทางแล้ว/, () => page.getByRole("button", { name: "บันทึก", exact: true }).click());
    const [hdr] = await db.select().from(navigation).where(and(eq(navigation.tenantId, demo.id), eq(navigation.location, "header")));
    assert(hdr && hdr.items.some((i) => i.label === navLabel && i.href === "/about"), "DB header nav missing new item");
    const ms = await waitStorefront(SLUG, "/", (b) => b.includes(navLabel));
    // remove again
    await panel.locator("button[aria-label='ลบเมนู']").last().click();
    await expectToast(page, /บันทึกเมนูนำทางแล้ว/, () => page.getByRole("button", { name: "บันทึก", exact: true }).click());
    const [hdr2] = await db.select().from(navigation).where(and(eq(navigation.tenantId, demo.id), eq(navigation.location, "header")));
    assert(hdr2 && !hdr2.items.some((i) => i.label === navLabel), "item still in DB after removal");
    return `item saved (${before + 1} header items), storefront reflected in ${(ms / 1000).toFixed(1)}s, then removed`;
  });
  // safety net
  for (const r of navRows) await db.update(navigation).set({ items: r.items }).where(eq(navigation.id, r.id));

  /* 7. media */
  // media delete = detail dialog "ลบไฟล์" → confirm dialog (usage check, "ลบไฟล์" / "ลบทั้งที่ยังใช้อยู่") → toast
  const deleteOpenMedia = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "ลบไฟล์" }).click();
    const confirm = page.getByRole("dialog").filter({ hasText: "กู้คืนไม่ได้" });
    await confirm.waitFor({ state: "visible", timeout: 15_000 });
    await expectToast(page, /ลบไฟล์แล้ว/, () => confirm.getByRole("button", { name: /^(ลบไฟล์|ลบทั้งที่ยังใช้อยู่)$/ }).click());
  };
  await step("7", "media: upload PNG → appears in grid (image loads) → delete", async () => {
    const status = await goto(page, `/t/${SLUG}/media`);
    assert(status === 200, `HTTP ${status}`);
    // clean leftovers from earlier runs so the demo tenant stays tidy
    for (const old of await page.locator("li").filter({ hasText: /qa-upload-/ }).all()) {
      await old.locator("button").first().click();
      await deleteOpenMedia();
      await page.waitForTimeout(500);
    }
    const name = `qa-upload-${RAND}`;
    await expectToast(page, /อัปโหลด 1 ไฟล์แล้ว/, () => page.locator("input[type=file]").setInputFiles({ name: `${name}.png`, mimeType: "image/png", buffer: makePng(96, 96) }));
    const card = page.locator("li").filter({ hasText: name }).first();
    await card.waitFor({ state: "visible", timeout: 20_000 });
    const img = card.locator("img");
    await img.waitFor({ state: "attached" });
    await page.waitForTimeout(1500);
    const loaded = await img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0).catch(() => false);
    const src = (await img.getAttribute("src")) ?? "";
    const u = new URL(src);
    const probe = await fetchTenant(SLUG, u.pathname, u.host);
    // delete regardless of the outcome so nothing is left behind
    await card.getByRole("button", { name: new RegExp(`^เปิด ${name}`) }).click();
    await deleteOpenMedia();
    await page.locator("li").filter({ hasText: name }).first().waitFor({ state: "hidden", timeout: 10_000 });
    assert(loaded && probe.status === 200, `grid shows the card but the file is unreachable: GET ${src} → HTTP ${probe.status} (admin writes to apps/admin/public/uploads via process.cwd(), the URL is served by apps/web)`);
    return `uploaded ${name}.png (${src}) loads (HTTP ${probe.status}); deleted`;
  });

  /* 8. customers */
  await step("8", "customers: list shows customers created by storefront flows", async () => {
    const [cnt] = await db.select({ c: count() }).from(customers).where(eq(customers.tenantId, demo.id));
    const total = Number(cnt?.c ?? 0);
    const status = await goto(page, `/t/${SLUG}/customers`);
    assert(status === 200, `HTTP ${status}`);
    await page.getByRole("heading", { name: "ลูกค้า" }).first().waitFor();
    if (total === 0) {
      await page.getByText("ยังไม่มีลูกค้า").waitFor();
      throw new Warn("demo-shop has 0 customers in DB — empty state renders, but the storefront flows have not produced any customer to list");
    }
    const rows = page.locator("table tbody tr");
    const n = await rows.count();
    assert(n > 0, `DB has ${total} customers but table shows none`);
    const first = (await rows.first().innerText()).replace(/\s+/g, " ").slice(0, 100);
    // open first detail
    await rows.first().locator("a").first().click();
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    return `${total} in DB, ${n} rows on page 1, first: ${first}; detail page ${page.url().split("/").pop()} loaded`;
  });

  /* 9. settings */
  const tagline = `QA tagline ${RAND}`;
  await step("9.1", "settings/general: change tagline, save → DB; restore", async () => {
    const status = await goto(page, `/t/${SLUG}/settings`);
    assert(status === 200, `HTTP ${status}`);
    const orig = await page.locator("#g-tagline").inputValue();
    await page.locator("#g-tagline").fill(tagline);
    await expectToast(page, /บันทึก/, () => page.locator("form button[type=submit]").first().click());
    let t = await tenantRow(SLUG);
    assert((t.settings as { tagline?: string }).tagline === tagline, `DB tagline = ${(t.settings as { tagline?: string }).tagline}`);
    await page.locator("#g-tagline").fill(orig);
    await expectToast(page, /บันทึก/, () => page.locator("form button[type=submit]").first().click());
    t = await tenantRow(SLUG);
    assert(((t.settings as { tagline?: string }).tagline ?? "") === orig, "tagline not restored");
    return `tagline saved and restored ("${orig}")`;
  });

  await step("9.2", "settings/payments: renders and saves", async () => {
    const status = await goto(page, `/t/${SLUG}/settings/payments`);
    assert(status === 200, `HTTP ${status}`);
    await page.locator("#p-id").waitFor();
    const before = (await tenantRow(SLUG)).settings as Record<string, unknown>;
    const exp = page.locator("#p-exp");
    const orig = await exp.inputValue();
    await exp.fill(String(Number(orig || 30) + 1));
    await expectToast(page, /บันทึก/, () => page.locator("form button[type=submit]").first().click());
    const t = await tenantRow(SLUG);
    const pay = ((t.settings as { payments?: { expiresMinutes?: number } }).payments ?? {}) as { expiresMinutes?: number };
    assert(pay.expiresMinutes === Number(orig || 30) + 1, `DB expiresMinutes=${pay.expiresMinutes}`);
    await exp.fill(orig || "30");
    await expectToast(page, /บันทึก/, () => page.locator("form button[type=submit]").first().click());
    // the form also writes defaults the demo never had (autoApproveSlips:false overrides DEV_AUTO_APPROVE_SLIPS) — restore exactly
    const now = (await tenantRow(SLUG)).settings as Record<string, unknown>;
    await db.update(tenants).set({ settings: { ...now, payments: before.payments } }).where(eq(tenants.slug, SLUG));
    return `PromptPay/bank/method cards render; expiresMinutes round-tripped (${orig}); payments settings restored`;
  });

  const qaHost = `qa-${RAND}.example.com`;
  await step("9.3", "settings/domains: add custom domain → pending row with DNS instructions; remove", async () => {
    await db.delete(tenantDomains).where(and(eq(tenantDomains.tenantId, demo.id), like(tenantDomains.hostname, "qa-%.example.com"), eq(tenantDomains.status, "pending")));
    const status = await goto(page, `/t/${SLUG}/settings/domains`);
    assert(status === 200, `HTTP ${status}`);
    await page.locator("#d-host").fill(qaHost);
    await page.getByRole("button", { name: "เพิ่มโดเมน" }).click();
    // toasts are <li> too (and now name the host) — only the domain list rows count
    const li = page.locator("li:not([data-sonner-toast])").filter({ hasText: qaHost }).first();
    await li.waitFor({ state: "visible", timeout: 20_000 });
    const text = (await li.innerText()).replace(/\s+/g, " ");
    assert(/รอตั้งค่า DNS/.test(text), `status badge missing: ${text.slice(0, 160)}`);
    // copy is now "เพิ่ม 2 record นี้ที่ผู้ให้บริการโดเมนของคุณ" with TXT + CNAME cards
    assert(/ที่ผู้ให้บริการโดเมนของคุณ/.test(text) && /CNAME/.test(text) && /TXT/.test(text) && text.includes(`_rentweb.${qaHost}`) && /rentweb-verify=/.test(text), `DNS instructions incomplete: ${text.slice(0, 300)}`);
    const [row] = await db.select().from(tenantDomains).where(eq(tenantDomains.hostname, qaHost));
    assert(row && row.tenantId === demo.id && row.status === "pending" && row.kind === "custom", "DB row missing/incorrect");
    await li.getByRole("button", { name: "ลบ", exact: true }).click();
    const dlg = page.getByRole("dialog");
    await expectToast(page, /ลบโดเมนแล้ว|ดำเนินการแล้ว/, () => dlg.getByRole("button", { name: "ลบโดเมน" }).click());
    await page.waitForTimeout(800);
    assert((await page.locator("li:not([data-sonner-toast])").filter({ hasText: qaHost }).count()) === 0, "row still visible after remove");
    const left = await db.select({ id: tenantDomains.id }).from(tenantDomains).where(eq(tenantDomains.hostname, qaHost));
    assert(left.length === 0, "DB row still present after remove");
    return `pending row + CNAME/TXT instructions shown; removed`;
  });

  const inviteEmail = `qa-invite-${RAND}@example.com`;
  await step("9.4", "settings/team: invite member by email → invitation row; revoke", async () => {
    await db.delete(tenantInvitations).where(and(eq(tenantInvitations.tenantId, demo.id), like(tenantInvitations.email, "qa-invite-%@example.com")));
    const status = await goto(page, `/t/${SLUG}/settings/team`);
    assert(status === 200, `HTTP ${status}`);
    await page.locator("#inv-email").fill(inviteEmail);
    await page.getByRole("button", { name: "สร้างคำเชิญ" }).click();
    await page.getByText("คำเชิญที่รอตอบรับ").waitFor({ state: "visible", timeout: 60_000 }); // slow while the shared dev server compiles
    const row = page.locator("div").filter({ has: page.locator("p", { hasText: inviteEmail }) }).filter({ has: page.getByRole("button", { name: "คัดลอกลิงก์" }) }).last();
    await row.waitFor({ state: "visible" });
    const [inv] = await db.select().from(tenantInvitations).where(eq(tenantInvitations.email, inviteEmail));
    assert(inv && inv.tenantId === demo.id && inv.role === "staff", `DB invitation missing/incorrect (${inv?.role})`);
    await row.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await expectToast(page, /ยกเลิกคำเชิญแล้ว|ดำเนินการแล้ว/, () => page.getByRole("dialog").getByRole("button", { name: "ยกเลิกคำเชิญ" }).click());
    await page.locator("p", { hasText: inviteEmail }).first().waitFor({ state: "hidden", timeout: 15_000 });
    const left = await db.select({ id: tenantInvitations.id }).from(tenantInvitations).where(eq(tenantInvitations.email, inviteEmail));
    assert(left.length === 0, "DB invitation still present after revoke");
    return `invitation for ${inviteEmail} (staff) created, listed with copy-link, revoked`;
  });

  await step("9.5", "settings/billing + danger render", async () => {
    let status = await goto(page, `/t/${SLUG}/settings/billing`);
    assert(status === 200, `HTTP ${status}`);
    await page.getByText("การใช้งาน").first().waitFor();
    const planCards = await page.locator("button, a").filter({ hasText: /อัปเกรด|แพ็กเกจปัจจุบัน|เลือกแพ็กเกจ/ }).count();
    status = await goto(page, `/t/${SLUG}/settings/danger`);
    assert(status === 200, `danger HTTP ${status}`);
    const errs = drainErrors(page);
    return `billing renders (${planCards} plan CTAs); danger renders; console errors: ${errs.length}${errs.length ? ` → ${errs.join(" | ")}` : ""}`;
  });

  /* 10. signup + onboarding */
  const qaSlug = `qa-test-${RAND}`;
  const qaEmail = `qa-${RAND}@example.com`;
  const qaPass = `QaPass-${RAND}-1234`;
  const signupCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(signupCtx);
  const sp = await newPage(signupCtx);
  await step("10.1", "signup creates a user → /onboarding", async () => {
    const status = await goto(sp, "/signup");
    assert(status === 200, `HTTP ${status}`);
    await sp.fill("#name", `QA Tester ${RAND}`);
    await sp.fill("#email", qaEmail);
    await sp.fill("#password", qaPass);
    await Promise.all([sp.waitForURL(/\/onboarding/, { timeout: 60_000 }), sp.getByRole("button", { name: "สร้างบัญชีฟรี" }).click()]);
    await sp.waitForLoadState("networkidle");
    return `${qaEmail} → ${sp.url()}`;
  });

  let qaTenantId = "";
  await step("10.2", "onboarding wizard creates tenant from template → dashboard", async () => {
    await sp.getByRole("heading", { name: "เว็บของคุณเป็นแบบไหน?" }).waitFor();
    const cards = sp.locator("button[aria-pressed]");
    const shop = cards.filter({ hasText: "ร้านค้า" }).first();
    const target = (await shop.count()) ? shop : cards.first();
    const tplName = (await target.locator("h3").innerText()).trim();
    await target.click();
    await sp.getByRole("button", { name: "ถัดไป" }).click();
    await sp.locator("#shop-name").fill(`QA Test ${RAND}`);
    await sp.locator("#shop-slug").fill(qaSlug);
    await sp.getByText("ว่าง! ใช้ชื่อนี้ได้").waitFor({ state: "visible", timeout: 20_000 });
    await sp.getByRole("button", { name: "ถัดไป" }).click();
    await sp.getByRole("heading", { name: "เลือกธีมเริ่มต้น" }).waitFor();
    const pressed = sp.locator("button[aria-pressed='true']");
    assert((await pressed.count()) >= 1, "no preset preselected");
    await Promise.all([sp.waitForURL(new RegExp(`/t/${qaSlug}/dashboard`), { timeout: 120_000 }), sp.getByRole("button", { name: "สร้างเว็บไซต์" }).click()]);
    await sp.waitForLoadState("networkidle");
    await sp.getByRole("heading", { name: `สวัสดี, QA Test ${RAND}` }).waitFor();
    await sp.locator("section[aria-label='ตัวเลขวันนี้']").waitFor();
    const t = await tenantRow(qaSlug);
    qaTenantId = t.id;
    const errs = drainErrors(sp);
    assert(errs.length === 0, `console errors on fresh dashboard: ${errs.join(" || ")}`);
    return `template "${tplName}" → tenant ${qaSlug} (${t.id}) status=${t.status} plan=${t.planKey}; zero-data dashboard OK`;
  });

  await step("10.3", "new tenant storefront renders at http://<slug>.localhost:3000", async () => {
    const r = await fetchTenant(qaSlug, "/");
    assert(r.status === 200, `HTTP ${r.status}`);
    assert(r.body.includes(`QA Test ${RAND}`) || r.body.includes("<html"), "unexpected body");
    const res = await sp.goto(`http://${qaSlug}.localhost:${WEB_PORT}/`, { waitUntil: "networkidle" });
    assert(res && res.status() === 200, `browser HTTP ${res?.status()}`);
    const errs = drainErrors(sp);
    return `HTTP 200, title "${await sp.title()}", console errors: ${errs.length}${errs.length ? ` (${errs[0]})` : ""}`;
  });
  await signupCtx.close();
  currentPage = page;

  /* 11. console */
  await step("11.1", "console: overview + tenants table", async () => {
    let status = await goto(page, "/console");
    assert(status === 200, `HTTP ${status}`);
    await page.getByRole("heading", { name: "ภาพรวมแพลตฟอร์ม" }).first().waitFor();
    status = await goto(page, "/console/tenants");
    assert(status === 200, `tenants HTTP ${status}`);
    const rows = page.locator("table tbody tr");
    const n = await rows.count();
    const text = await page.locator("table").innerText();
    assert(n >= 7, `table rows=${n}`);
    // paginated (25/page, newest first): the tenant from 10.2 is on page 1, demo-shop may not be → use the search box
    assert(!qaTenantId || text.includes(qaSlug), `new tenant ${qaSlug} missing from console table page 1`);
    status = await goto(page, "/console/tenants?q=demo-shop");
    assert(status === 200, `tenants search HTTP ${status}`);
    assert((await page.locator("table").innerText()).includes("demo-shop"), "search q=demo-shop does not list demo-shop");
    return `${n} rows on page 1${qaTenantId ? ` incl. ${qaSlug}` : ""}; search finds demo-shop`;
  });

  await step("11.2", "console: tenant detail → change plan", async () => {
    assert(qaTenantId, "no qa tenant created in step 10");
    const status = await goto(page, `/console/tenants/${qaTenantId}`);
    assert(status === 200, `HTTP ${status}`);
    const before = (await tenantRow(qaSlug)).planKey;
    const allPlans = await db.select({ key: plans.key, name: plans.name }).from(plans);
    const target = allPlans.find((p) => p.key !== before && p.key !== "trial") ?? allPlans.find((p) => p.key !== before);
    assert(target, "no alternative plan");
    const { chosen } = await selectRadix(page, "#c-plan", new RegExp(target.name));
    await expectToast(page, /เปลี่ยนแพ็กเกจแล้ว/, () => page.getByRole("button", { name: "เปลี่ยนแพ็กเกจ" }).click());
    const after = (await tenantRow(qaSlug)).planKey;
    assert(after === target.key, `DB planKey=${after}, expected ${target.key}`);
    return `plan ${before} → ${after} ("${chosen.trim()}")`;
  });

  await step("11.3", "console: impersonate → banner shown → stop", async () => {
    assert(qaTenantId, "no qa tenant");
    await goto(page, `/console/tenants/${qaTenantId}`);
    await Promise.all([page.waitForURL(new RegExp(`/t/${qaSlug}/dashboard`), { timeout: 60_000 }), page.getByRole("button", { name: "เข้าดูหลังบ้าน" }).click()]);
    await page.waitForLoadState("networkidle");
    const banner = page.getByRole("status").filter({ hasText: "คุณกำลังดูหลังบ้านของ" });
    await banner.waitFor({ state: "visible", timeout: 15_000 });
    const text = (await banner.innerText()).replace(/\s+/g, " ");
    await Promise.all([page.waitForURL(/\/console\/tenants/, { timeout: 60_000 }), banner.getByRole("button", { name: "ออกจากโหมดนี้" }).click()]);
    return `banner: "${text.slice(0, 120)}" → stopped, back at ${new URL(page.url()).pathname}`;
  });

  await step("11.4", "console: impersonation banner NOT shown on a tenant the superadmin is a member of (by design)", async () => {
    await goto(page, `/t/${SLUG}/dashboard`);
    const n = await page.getByRole("status").filter({ hasText: "คุณกำลังดูหลังบ้านของ" }).count();
    assert(n === 0, "banner shown for member tenant");
    return "no banner on demo-shop (admin is owner)";
  });

  /* 12. module placeholders */
  await step("12", "module routes render placeholder (not 404)", async () => {
    const out: string[] = [];
    for (const p of ["/orders", "/products", "/discounts", "/some-unknown-route"]) {
      const status = await goto(page, `/t/${SLUG}${p}`);
      const body = await page.locator("main").innerText();
      const placeholder = /กำลังพัฒนาในเฟสถัดไป/.test(body);
      const notFound = /404|ไม่พบหน้า|This page could not be found/.test(body);
      assert(status === 200 && !notFound, `${p}: HTTP ${status}${notFound ? " (404 content)" : ""}`);
      const h1 = (await page.locator("main h1").first().innerText().catch(() => "")).trim();
      out.push(`${p}→${placeholder ? "placeholder" : "page"}[${h1}]`);
    }
    return out.join(", ");
  });

  /* 13. mobile */
  await step("13", "mobile 390px: sidebar is a sheet, no horizontal overflow, tap targets", async () => {
    const state = await ctx.storageState();
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce", storageState: state });
    const mp = await newPage(mctx);
    const report: string[] = [];
    const small: string[] = [];
    const routes = [`/t/${SLUG}/dashboard`, `/t/${SLUG}/pages`, `/t/${SLUG}/pages/${home!.id}`, `/t/${SLUG}/design`, `/t/${SLUG}/navigation`, `/t/${SLUG}/media`, `/t/${SLUG}/customers`, `/t/${SLUG}/settings`, `/t/${SLUG}/settings/team`, `/console/tenants`, "/onboarding"];
    for (const r of routes) {
      const status = await goto(mp, r);
      const m = await mp.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        const wide: string[] = [];
        const tiny: string[] = [];
        document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > vw + 1 && rect.width > 0 && getComputedStyle(el).visibility !== "hidden") {
            let a = el.parentElement;
            let clipped = false;
            while (a && a !== document.body) {
              const ox = getComputedStyle(a).overflowX;
              if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") {
                clipped = true;
                break;
              }
              a = a.parentElement;
            }
            if (!clipped && wide.length < 5) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(rect.right)}`);
          }
        });
        document.querySelectorAll<HTMLElement>("a[href], button, [role=button], input:not([type=hidden]), select, textarea").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || el.closest("[aria-hidden=true]")) return;
          if (rect.top > window.innerHeight * 3) return;
          if (rect.height < 36 || rect.width < 36) {
            const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30);
            tiny.push(`${el.tagName.toLowerCase()}[${label}] ${Math.round(rect.width)}x${Math.round(rect.height)}`);
          }
        });
        const aside = document.querySelector("aside");
        return { vw, sw, wide, tiny: tiny.slice(0, 8), tinyCount: tiny.length, asideVisible: !!aside && getComputedStyle(aside).display !== "none" };
      });
      const overflow = m.sw > m.vw + 1;
      if (overflow) report.push(`${r}: scrollWidth ${m.sw}>${m.vw} ${m.wide.join("; ")}`);
      if (m.asideVisible) report.push(`${r}: desktop <aside> visible at 390px`);
      if (m.tinyCount) small.push(`${r}: ${m.tinyCount} targets <36px e.g. ${m.tiny.slice(0, 3).join(", ")}`);
      if (r.startsWith("/t/") && !r.includes("/pages/")) {
        const open = mp.getByRole("button", { name: "เปิดเมนู" });
        assert(await open.isVisible(), `${r}: hamburger not visible`);
        await open.click();
        const nav = mp.locator("[role=dialog] nav[aria-label='เมนูหลัก']");
        await nav.waitFor({ state: "visible", timeout: 10_000 });
        await mp.keyboard.press("Escape");
        await nav.waitFor({ state: "hidden", timeout: 10_000 });
      }
      const errs = drainErrors(mp);
      if (errs.length) report.push(`${r}: console ${errs[0]}`);
      if (status !== 200) report.push(`${r}: HTTP ${status}`);
    }
    await mctx.close();
    currentPage = page;
    (results as unknown as { mobileTiny?: string[] }).mobileTiny = small;
    assert(report.length === 0, report.join(" || "));
    return `${routes.length} routes OK (sheet opens/closes, no overflow). small targets: ${small.join(" | ").slice(0, 600)}`;
  });

  await ctx.close();
  await browser.close();

  // final restore check for theme/settings
  const final = await tenantRow(SLUG);
  const themeSame = JSON.stringify(final.theme) === JSON.stringify(origTheme);
  const settingsSame = JSON.stringify(final.settings) === JSON.stringify(origSettings);
  if (!themeSame) {
    await db.update(tenants).set({ theme: origTheme }).where(eq(tenants.id, demo.id));
    console.log("  (theme restored via DB at end)");
  }
  if (!settingsSame) console.log("  NOTE: demo-shop settings differ from the start of the run:", JSON.stringify(final.settings).slice(0, 300));

  const summary = { pass: results.filter((r) => r.status === "PASS").length, fail: results.filter((r) => r.status === "FAIL").length, warn: results.filter((r) => r.status === "WARN").length, skip: results.filter((r) => r.status === "SKIP").length };
  console.log(`\nSUMMARY: ${summary.pass} PASS · ${summary.fail} FAIL · ${summary.warn} WARN · ${summary.skip} SKIP · qa tenant: ${qaSlug} (${qaEmail})`);
  await persist();
  process.exit(summary.fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error("journey crashed:", e);
  await persist();
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  process.exit(2);
});
