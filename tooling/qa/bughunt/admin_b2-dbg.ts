import { adminState, go, launch, newCtx, newPage, out, readCreds } from "./admin_b2-lib";
async function main() {
  const C = readCreds(); const corp = C.tenants.find((t: any) => t.key === "corporate");
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  await go(page, `/console/tenants/${corp.id}`);
  out("c-status", await page.locator("#c-status").count());
  out("comboboxes", await page.getByRole("combobox").evaluateAll((els) => els.map((e) => `${e.id}|${(e as HTMLElement).innerText}`)));
  await page.locator("#c-status").click({ timeout: 10000 }).catch((e) => out("click err", String(e).slice(0, 200)));
  await page.waitForTimeout(500);
  out("options", await page.getByRole("option").allInnerTexts());
  await browser.close();
}
main();
