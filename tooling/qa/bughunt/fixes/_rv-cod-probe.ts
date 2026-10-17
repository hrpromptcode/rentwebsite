import "../../../load-env";
import { chromium } from "@playwright/test";
import { isolateHmr } from "./_dev-stable";
/** reverify-storefront probe: which shipping options does demo-shop checkout offer (COD present / clickable)? */
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await isolateHmr(ctx);
  const p = await ctx.newPage();
  const base = "http://demo-shop.localhost:3000";
  await p.goto(`${base}/products/linen-shirt-sand`, { waitUntil: "networkidle" });
  await p.locator("button[aria-pressed]", { hasText: /^L$/ }).first().click();
  const r = p.waitForResponse((r) => r.url().includes("/api/cart") && r.request().method() === "POST");
  await p.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click();
  await r;
  await p.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  const labels = await p.locator('div[role="radiogroup"][aria-label="วิธีจัดส่ง"] label').allTextContents();
  console.log(labels.length, "options:\n " + labels.map((l) => l.replace(/\s+/g, " ").trim()).join("\n "));
  const cod = p.getByText("เก็บเงินปลายทาง (COD)", { exact: true });
  console.log("COD exact matches:", await cod.count(), "visible:", await cod.first().isVisible().catch(() => false));
  await b.close();
}
main();
