// AC-01: an image uploaded in the ADMIN media library must be written to the shared uploads dir and be
// reachable on the tenant storefront. Run from tooling/:  npx tsx qa/bughunt/fixes/AC-01-verify.ts [slug]
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "../security-http.mjs";

import { fetchTenant, goto, launch, login, newPage, readCreds } from "../admin_core-lib";

const SLUG = process.argv[2] ?? "ac-shop-vcre";
const creds = readCreds() as { owner: { email: string; password: string } };
const sql = db();
// 1x1 PNG
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f3e0000000049454e44ae426082", "hex");

async function main() {
  const [t] = await sql`select id from tenants where slug=${SLUG}`;
  const before = new Date();
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await newPage(ctx);
  await login(page, creds.owner.email, creds.owner.password);
  await goto(page, `/t/${SLUG}/media`);
  await page.locator("input[type=file]").setInputFiles({ name: "ac01.png", mimeType: "image/png", buffer: PNG });
  let row: { url: string } | undefined;
  for (let i = 0; i < 40 && !row; i++) {
    await page.waitForTimeout(500);
    [row] = await sql`select url from media where tenant_id=${t!.id} and created_at >= ${before} order by created_at desc limit 1`;
  }
  await browser.close();
  if (!row) throw new Error("no media row created");
  const rel = row.url.replace(/^\/uploads\//, "");
  const file = path.resolve(process.cwd(), "../apps/web/public/uploads", rel);
  const adminCopy = path.resolve(process.cwd(), "../apps/admin/public/uploads", rel);
  const served = await fetchTenant(`${SLUG}.localhost:3000`, row.url);
  const ok = existsSync(file) && !existsSync(adminCopy) && served.status === 200;
  console.log({ url: row.url, inWebPublic: existsSync(file), inAdminPublic: existsSync(adminCopy), storefrontStatus: served.status });
  console.log(ok ? "PASS AC-01 admin upload served by the storefront" : "FAIL AC-01");
  await sql.end();
  process.exit(ok ? 0 : 1);
}
main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
