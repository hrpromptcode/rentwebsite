/**
 * common agent verification: scroll each owned page like a user, screenshot every viewport frame and build a contact
 * sheet; collect console / hydration errors and horizontal overflow.
 *   cd tooling && pnpm exec tsx qa/redesign/common-shots.ts [--only=corp-home,login] [--w=1440,390] [--frames=14] [--reduce] [--first]
 * → screenshots/redesign-common-<name>-<w>[-rm].png (first viewport) + …-sheet.png (all frames)
 */
import "../../load-env";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";
import { and, eq, getAdminDb, pages, tenants } from "@rentweb/db";
import { signPreviewToken } from "@rentweb/core/preview-token";

/** Signed draft-preview URL for a demo page (same token the admin "ดูตัวอย่าง" button makes). */
async function previewUrl(slug: string, pageSlug: string): Promise<string> {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const [p] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, t!.id), eq(pages.slug, pageSlug))).limit(1);
  return `http://${slug}.localhost:3000/preview?token=${encodeURIComponent(signPreviewToken({ tenantId: t!.id, pageId: p!.id }))}`;
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = (arg("only") ?? "").split(",").filter(Boolean);
const WIDTHS = (arg("w") ?? "1440,390").split(",").map(Number);
const MAX_FRAMES = Number(arg("frames") ?? 14);
const REDUCE = process.argv.includes("--reduce");
const FIRST_ONLY = process.argv.includes("--first");
const OUT = path.resolve(process.cwd(), "screenshots");
const ADMIN = "http://localhost:3001";
const corp = (p: string) => `http://demo-corporate.localhost:3000${p}`;
const shop = (p: string) => `http://demo-shop.localhost:3000${p}`;

type Target = { name: string; url: string; auth?: "customer" | "admin"; step?: "onb2" | "onb3" };
const TARGETS: Target[] = [
  { name: "corp-home", url: corp("/") },
  { name: "corp-services", url: corp("/services") },
  { name: "corp-work", url: corp("/work") },
  { name: "corp-about", url: corp("/about") },
  { name: "corp-contact", url: corp("/contact") },
  { name: "corp-careers", url: corp("/careers") },
  { name: "corp-privacy", url: corp("/privacy") },
  { name: "corp-terms", url: corp("/terms") },
  { name: "shop-about", url: shop("/about") },
  { name: "shop-contact", url: shop("/contact") },
  { name: "shop-refund", url: shop("/refund") },
  { name: "clinic-about", url: "http://demo-clinic.localhost:3000/about" },
  { name: "cafe-contact", url: "http://demo-cafe.localhost:3000/contact" },
  { name: "login", url: shop("/account/login") },
  { name: "login-corp", url: corp("/account/login") },
  { name: "account", url: shop("/account"), auth: "customer" },
  { name: "orders", url: shop("/account/orders"), auth: "customer" },
  { name: "preview-about", url: "preview:demo-corporate/about" },
  { name: "preview-home", url: "preview:demo-shop/home" },
  { name: "admin-login", url: `${ADMIN}/login` },
  { name: "admin-signup", url: `${ADMIN}/signup` },
  { name: "admin-onboarding", url: `${ADMIN}/onboarding`, auth: "admin" },
  { name: "admin-onboarding-2", url: `${ADMIN}/onboarding`, auth: "admin", step: "onb2" },
  { name: "admin-onboarding-3", url: `${ADMIN}/onboarding`, auth: "admin", step: "onb3" },
];

async function frames(page: Page, base: string): Promise<string[]> {
  const vh = page.viewportSize()!.height;
  const files: string[] = [];
  for (let i = 0; i < (FIRST_ONLY ? 1 : MAX_FRAMES); i++) {
    const f = path.join(OUT, `${base}-f${String(i).padStart(2, "0")}.png`);
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

async function customerLogin(page: Page) {
  await stableGoto(page, shop("/account/login"), "load");
  if (new URL(page.url()).pathname === "/account") return;
  await page.fill("#otp-target", "0819990011");
  await page.locator("form button[type=submit]").first().click();
  await page.locator("#otp-code").waitFor({ timeout: 60_000 });
  const code = (await page.locator("body").innerText()).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
  if (!code) throw new Error("no dev OTP code");
  await page.fill("#otp-code", code);
  await page.fill("#otp-name", "คุณทดสอบ ดีไซน์");
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => u.pathname === "/account", { timeout: 60_000 });
}

async function adminLogin(page: Page) {
  await stableGoto(page, `${ADMIN}/login`, "load");
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);
}

fs.mkdirSync(path.join(OUT, "_frames"), { recursive: true });
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const report: string[] = [];
for (const w of WIDTHS) {
  const authed: Partial<Record<"customer" | "admin", BrowserContext>> = {};
  for (const t of TARGETS) {
    if (ONLY.length && !ONLY.some((o) => t.name === o || t.name.startsWith(`${o}-`) || (o.endsWith("*") && t.name.startsWith(o.slice(0, -1))))) continue;
    const mk = async () => {
      const c = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 844 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768, reducedMotion: REDUCE ? "reduce" : "no-preference" });
      await isolateHmr(c);
      return c;
    };
    let ctx: BrowserContext;
    let own = false;
    if (t.auth) {
      if (!authed[t.auth]) {
        authed[t.auth] = await mk();
        const p = await authed[t.auth]!.newPage();
        await (t.auth === "customer" ? customerLogin(p) : adminLogin(p));
        await p.close();
      }
      ctx = authed[t.auth]!;
    } else {
      ctx = await mk();
      own = true;
    }
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errors.push(m.text().slice(0, 240));
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
    try {
      const target = t.url.startsWith("preview:") ? await previewUrl(t.url.slice(8).split("/")[0]!, t.url.split("/")[1]!) : t.url;
      const res = await stableGoto(page, target, "load");
      await page.waitForTimeout(2200);
      if (t.step) {
        await page.locator("button[aria-pressed]").filter({ hasText: "บริษัท" }).first().click();
        await page.getByRole("button", { name: "ถัดไป" }).click();
        await page.locator("#shop-name").fill("Northwind Studio");
        await page.getByText("ว่าง! ใช้ชื่อนี้ได้").waitFor({ timeout: 20_000 }).catch(() => {});
        if (t.step === "onb3") {
          await page.getByRole("button", { name: "ถัดไป" }).click();
          await page.getByRole("heading", { name: "เลือกธีมเริ่มต้น" }).waitFor();
        }
        await page.waitForTimeout(900);
      }
      await page.mouse.move(w * 0.62, 320);
      const base = `redesign-common-${t.name}-${w}${REDUCE ? "-rm" : ""}`;
      const files = await frames(page, path.join("_frames", base).replace(/\\/g, "/"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      fs.copyFileSync(files[0]!, path.join(OUT, `${base}.png`));
      if (files.length > 1) await sheet(files, path.join(OUT, `${base}-sheet.png`), w >= 768 ? 3 : 6);
      report.push(`${t.name}@${w}${REDUCE ? " rm" : ""}: HTTP ${res?.status()} frames=${files.length} overflow=${overflow}px errors=${errors.length}${errors.length ? ` → ${errors.slice(0, 3).join(" | ")}` : ""}`);
    } catch (e) {
      report.push(`${t.name}@${w}: FAILED ${(e as Error).message.slice(0, 200)}`);
    }
    await page.close();
    if (own) await ctx.close();
  }
  for (const c of Object.values(authed)) await c?.close();
}
await browser.close();
console.log(report.join("\n"));
process.exit(0);
