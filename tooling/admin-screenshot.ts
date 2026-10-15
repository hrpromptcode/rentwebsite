import "./load-env";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext } from "@playwright/test";

/**
 * Logs into the admin app and screenshots back-office pages at desktop + mobile widths into tooling/screenshots/admin-*.png.
 *   pnpm --filter @rentweb/tooling admin-screenshot -- [--email admin@rentweb.local] [--password "Admin1234!"] [--slug demo-shop]
 *       [--path /t/demo-shop/dashboard --path /console] [--only desktop|mobile] [--full] [--wait 800]
 * Requires the admin dev server on http://localhost:3001 (ADMIN_URL).
 */
const args = process.argv.slice(2);
const flagAll = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));
const flag = (name: string) => flagAll(name)[0];

const base = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
const email = flag("email") ?? "admin@rentweb.local";
const password = flag("password") ?? "Admin1234!";
const slug = flag("slug") ?? "demo-shop";
const only = flag("only");
const full = args.includes("--full");
const waitMs = Number(flag("wait") ?? 800);
// Git Bash rewrites leading-slash args into Windows paths; accept "t/demo-shop/pages" and prepend the slash (or run with MSYS_NO_PATHCONV=1).
const paths = (flagAll("path").length ? flagAll("path") : [`/t/${slug}/dashboard`, `/t/${slug}/design`, `/t/${slug}/pages`, `/t/${slug}/settings`, "/console"]).map((p) => (p.startsWith("/") ? p : `/${p}`));

async function login(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await page.close();
}

async function main() {
  const outDir = path.resolve(process.cwd(), "screenshots");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const viewports = ([["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const).filter(([n]) => !only || n === only);

  // sign in once, reuse the cookies for every viewport
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await login(loginCtx);
  const storageState = await loginCtx.storageState();
  await loginCtx.close();
  console.log(`✓ signed in as ${email}`);

  for (const [name, viewport] of viewports) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce", storageState });
    for (const p of paths) {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 200));
      });
      page.on("requestfailed", (r) => errors.push(`request failed: ${r.url().slice(0, 120)}`));
      await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(waitMs);
      const file = path.join(outDir, `admin${p.replace(/[^a-z0-9]+/gi, "_")}-${name}.png`);
      await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
      const scrollW = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
      const title = await page.title();
      console.log(`✓ ${file}  [${title}]${page.url().includes("/login") ? "  ⚠ redirected to login" : ""}${scrollW > viewport.width ? `  ⚠ horizontal overflow ${scrollW}px > ${viewport.width}px` : ""}`);
      for (const e of errors.slice(0, 5)) console.log(`   ✗ ${e}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
