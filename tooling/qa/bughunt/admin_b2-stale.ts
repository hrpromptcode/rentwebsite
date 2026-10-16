import { readFileSync } from "node:fs";
import { anyToast, go, hreq, launch, newCtx, newPage, out, readCreds } from "./admin_b2-lib";
async function main() {
  const C = readCreds(); const slug = C.tenants.find((t: any) => t.key === "cafe").slug;
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8")) });
  const page = await newPage(ctx);
  // warm the storefront cache first
  await hreq(`${slug}.localhost:3000`, "/");
  const marker = `QAB2 Tagline ${Date.now() % 100000}`;
  await go(page, `/t/${slug}/settings`);
  await page.fill("#g-tagline", marker);
  out("save", await anyToast(page, () => page.locator("form").getByRole("button", { name: /บันทึก/ }).last().click()));
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    const r = await hreq(`${slug}.localhost:3000`, "/");
    if (r.body.includes(marker)) { out("tagline visible on storefront after", `${Math.round((Date.now() - t0) / 1000)} s`); break; }
    if (i === 29) out("tagline still not visible after", `${Math.round((Date.now() - t0) / 1000)} s`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  await browser.close();
}
main();
