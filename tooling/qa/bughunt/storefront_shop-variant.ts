import "../../load-env";
import { chromium } from "@playwright/test";

/** Variant picker state on a product page (storefront_shop bughunt). tsx ... <tenant> <slug> */
async function main() {
  const [tenant = "demo-shop", slug = "linen-shirt-sand"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
  await page.goto(`http://${tenant}.localhost:3000/products/${encodeURIComponent(slug)}`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1500);
  const dump = async (label: string) => {
    const b = await page.locator("fieldset button").evaluateAll((els) => els.map((e) => `${e.textContent?.trim()}[pressed=${e.getAttribute("aria-pressed")},disabled=${(e as HTMLButtonElement).disabled},cls=${e.className.slice(0, 60)}]`));
    const add = await page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled));
    const stock = await page.locator("p.text-sm").evaluateAll((els) => els.map((e) => e.textContent?.trim()).filter((t) => t && /หมด|เหลือ|มีสินค้า|เลือก/.test(t)));
    console.log(label, "\n ", b.join("\n  "), "\n  add disabled:", add, "stock:", stock);
  };
  await dump("initial");
  for (const v of ["L", "XL", "S"]) {
    const btn = page.locator("fieldset button", { hasText: new RegExp(`^${v}$`) }).first();
    if (await btn.isEnabled()) {
      await btn.click();
      await page.waitForTimeout(400);
      await dump(`after ${v}`);
    } else console.log(`${v} disabled, cannot click`);
  }
  await page.screenshot({ path: "screenshots/bughunt-storefront_shop-variant.png" });
  await browser.close();
}
main();
