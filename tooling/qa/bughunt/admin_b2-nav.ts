import { readFileSync } from "node:fs";
import { eq, navigation } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, readCreds, shot, store, tenantIdOf, tt } from "./admin_b2-lib";
const C = readCreds();
const SHOP = C.tenants.find((t: any) => t.key === "shop").slug as string;
async function main() {
  const tid = await tenantIdOf(SHOP);
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const page = await newPage(ctx);
  await go(page, `/t/${SHOP}/navigation`);
  const panel = page.locator('[role="tabpanel"]').first();
  const before = await panel.locator('input[aria-label="ชื่อเมนู"]').count();
  out("header items before", before);
  const save = () => anyToast(page, () => page.getByRole("button", { name: /^บันทึก$/ }).click());
  // empty label validation
  await panel.getByRole("button", { name: "เพิ่มเมนู" }).last().click();
  out("save with empty label", await save());
  // fill new item
  const labels = panel.locator('input[aria-label="ชื่อเมนู"]');
  const hrefs = panel.locator('input[aria-label="ลิงก์"]');
  await labels.last().fill("QA B2 JS");
  await hrefs.last().fill("javascript:alert(document.domain)");
  await panel.getByRole("button", { name: "เพิ่มเมนู" }).last().click();
  await labels.last().fill("QA B2 External");
  await hrefs.last().fill("https://example.com/qa");
  // child under first item
  await panel.getByRole("button", { name: /เพิ่มเมนูย่อย/ }).first().click();
  const childLabel = panel.locator('input[aria-label="ชื่อเมนู"]').nth(1);
  await childLabel.fill("QA B2 Child");
  await panel.locator('input[aria-label="ลิงก์"]').nth(1).fill("/products");
  // move External up once
  const lastCard = panel.locator("div.rounded-xl.border.p-3").filter({ has: page.locator('input[value="QA B2 External"]') }).last();
  await lastCard.getByRole("button", { name: /เลื่อนขึ้น/ }).first().click().catch((e) => out("move err", String(e).slice(0, 80)));
  out("save nav", await save());
  await page.waitForTimeout(1500);
  const rows = await tt(tid, (tx) => tx.select().from(navigation).where(eq(navigation.tenantId, tid)));
  const header = rows.find((r) => r.location === "header")?.items as any[];
  out("db header", header?.map((i) => `${i.label}->${i.href}${i.external ? "(ext)" : ""}${i.children ? `[${i.children.map((c: any) => c.label).join(",")}]` : ""}`));
  // storefront (wait for config cache? navigation is read directly)
  const sp = await browser.newPage();
  await sp.route(/_next\/(webpack-hmr|hmr)/, (r) => r.abort());
  const perr: string[] = [];
  sp.on("console", (m) => { if (m.type() === "error") perr.push(m.text().slice(0, 160)); });
  await sp.goto(`${store(SHOP)}/`, { waitUntil: "networkidle", timeout: 120_000 });
  out("storefront nav anchors", await sp.locator("header a, nav a").evaluateAll((els) => els.filter((e) => /QA B2/.test(e.textContent ?? "")).map((e) => `${(e.textContent ?? "").trim()} -> ${e.getAttribute("href")} target=${e.getAttribute("target")} rel=${e.getAttribute("rel")}`)));
  out("storefront console errors", perr.slice(0, 3));
  await sp.screenshot({ path: shot("nav-storefront") });
  // clicking the JS item in a real browser
  const jsLink = sp.locator("a", { hasText: "QA B2 JS" }).first();
  let dialog = "";
  sp.on("dialog", (d) => { dialog = d.message(); d.dismiss().catch(() => {}); });
  if (await jsLink.count() && await jsLink.isVisible()) { await jsLink.click().catch(() => {}); await sp.waitForTimeout(1000); }
  out("JS nav link click -> dialog", dialog || "(none)");
  // undo: change label then ยกเลิก
  await labels.first().fill("SHOULD BE UNDONE");
  await page.getByRole("button", { name: /ยกเลิก/ }).click();
  out("after undo first label", await labels.first().inputValue());
  // cleanup: remove the QA items
  for (const name of ["QA B2 JS", "QA B2 External"]) {
    const card = panel.locator("div.rounded-xl.border.p-3").filter({ has: page.locator(`input[value="${name}"]`) }).last();
    if (await card.count()) await card.getByRole("button", { name: "ลบเมนู" }).first().click();
  }
  out("cleanup save", await save());
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
