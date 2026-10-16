import path from "node:path";
import { SHOTS, goto, launch, login, newPage, out, readCreds } from "./admin_core-lib";

const creds = readCreds() as any;
const SLUG = process.argv[2] ?? "ac-shop-vcre";

async function main() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await newPage(ctx);
  await login(page, creds.owner.email, creds.owner.password);
  await goto(page, `/t/${SLUG}/design`);
  await page.getByRole("tab", { name: "เลย์เอาต์" }).click();
  const trigger = page.locator("div.grid.gap-2").filter({ has: page.locator(`label:text-is("สไตล์ปุ่ม")`) }).locator("button[role=combobox]").first();
  await trigger.click();
  const opts = page.locator("[role=listbox]").last().locator("[role=option]");
  const texts = await opts.allInnerTexts();
  const cur = await trigger.innerText();
  const i = texts.findIndex((t) => !/ตาม preset/.test(t) && t.trim() !== cur.trim());
  await opts.nth(i).click();
  out("chose", texts[i]);
  const events: string[] = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST") events.push(`${r.status()} ${r.url().slice(0, 80)}`);
  });
  await page.getByRole("button", { name: /บันทึกและเผยแพร่/ }).click();
  for (const ms of [300, 1000, 2500, 6000]) {
    await page.waitForTimeout(ms);
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
    const ol = await page.locator("[data-sonner-toaster]").count();
    out(`t+${ms}`, { toasts, toasterCount: ol, footer: await page.locator("div.sticky p").last().innerText() });
  }
  await page.screenshot({ path: path.join(SHOTS, "bughunt-admin_core-design-aftersave.png") });
  out("posts", events);
  out("errors", page.__errors);
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
