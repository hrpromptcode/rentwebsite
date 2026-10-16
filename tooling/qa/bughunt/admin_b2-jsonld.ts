import { readFileSync } from "node:fs";
import { and, eq, products } from "@rentweb/db";
import { anyToast, done, go, launch, newCtx, newPage, out, readCreds, store, tenantIdOf, tt } from "./admin_b2-lib";
const C = readCreds();
const SHOP = C.tenants.find((t: any) => t.key === "shop").slug as string;
async function main() {
  const tid = await tenantIdOf(SHOP);
  const [p] = await tt(tid, (tx) => tx.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(eq(products.tenantId, tid)).limit(1));
  const browser = await launch();
  const role = process.argv[2] ?? "manager";
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(`qa/bughunt/admin_b2-state-${role}.json`, "utf8")) });
  const page = await newPage(ctx);
  await go(page, `/t/${SHOP}/products/${p!.id}`);
  const payload = `${p!.name}</script><script>window.__b2=document.domain</script>`;
  const nameInput = page.locator('input[placeholder="เช่น เสื้อลินินสีทราย"]').first();
  await nameInput.fill(payload);
  out(`${role} save product`, await anyToast(page, () => page.getByRole("button", { name: /^บันทึก/ }).last().click()));
  const [p2] = await tt(tid, (tx) => tx.select({ name: products.name, slug: products.slug }).from(products).where(eq(products.id, p!.id)));
  out("db name", p2);
  const sp = await browser.newPage();
  await sp.route(/_next\/(webpack-hmr|hmr)/, (r) => r.abort());
  await sp.goto(`${store(SHOP)}/products/${encodeURIComponent(p2!.slug)}`, { waitUntil: "networkidle", timeout: 120_000 });
  out("storefront window.__b2", await sp.evaluate(() => (window as any).__b2 ?? null));
  const html = await sp.content();
  out("ld+json snippet", html.match(/application\/ld\+json[^>]*>[\s\S]{0,160}/)?.[0]);
  // restore
  await nameInput.fill(p!.name);
  out("restore", await anyToast(page, () => page.getByRole("button", { name: /^บันทึก/ }).last().click()));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
