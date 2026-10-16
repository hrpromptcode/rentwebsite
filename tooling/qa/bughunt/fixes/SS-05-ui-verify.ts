/** SS-05 UI check: contact form shows field-level Thai errors and still sends a valid message.
 *   cd tooling && npx tsx qa/bughunt/fixes/SS-05-ui-verify.ts [tenant-slug]   (needs dev server; prints PASS/FAIL) */
import { chromium } from "@playwright/test";

const SLUG = process.argv[2] ?? "demo-shop";
const ORIGIN = `http://${SLUG}.localhost:3000`;
let fail = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs: string[] = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
await page.goto(`${ORIGIN}/contact`, { waitUntil: "load", timeout: 90_000 });
// wait for React to hydrate the form (otherwise a click submits it natively)
await page.waitForFunction(() => { const f = document.querySelector("form:has(#cf-name)"); return !!f && Object.keys(f).some((k) => k.startsWith("__react")); }, null, { timeout: 90_000 });
const submit = page.locator('form:has(#cf-name) button[type="submit"]');
await page.fill("#cf-name", "QA ฟอร์ม");
await page.fill("#cf-message", "ข้อความทดสอบ");
for (const bad of ["12", "abcdefgh"]) {
  await page.fill("#cf-phone", bad);
  await submit.click();
  const msg = await page.locator("#cf-phone-error").textContent({ timeout: 5_000 }).catch(() => null);
  check(!!msg && msg.includes("เบอร์โทร"), `phone "${bad}" -> field error under phone: ${msg}`);
  check((await page.locator("#cf-phone").getAttribute("aria-invalid")) === "true", `phone "${bad}" -> aria-invalid on the input`);
}
// server-side field error (bad e-mail passes the browser check? use one the browser accepts but the API rejects)
await page.fill("#cf-phone", "081-234-5678");
await page.fill("#cf-email", "a@b");
const r0 = page.waitForResponse((r) => r.url().includes("/api/forms/"), { timeout: 20_000 }).catch(() => null);
await submit.click();
const res0 = await r0;
const emailMsg = await page.locator("#cf-email-error").textContent({ timeout: 5_000 }).catch(() => null);
check(res0?.status() === 400 && !!emailMsg, `e-mail "a@b" -> API ${res0?.status()} + field error: ${emailMsg}`);
await page.fill("#cf-email", "qa-form@example.com");
const r1 = page.waitForResponse((r) => r.url().includes("/api/forms/"), { timeout: 20_000 }).catch(() => null);
await submit.click();
const res1 = await r1;
const sent = await page.getByText("ส่งอีกข้อความ").count();
check(res1?.status() === 200 && sent > 0, `valid submit -> ${res1?.status()} and success state shown`);
check(errs.filter((e) => !e.includes("400")).length === 0, `no unexpected console errors ${JSON.stringify(errs)}`);
await browser.close();
console.log(fail ? `FAIL ${fail} check(s)` : "PASS all");
process.exit(fail ? 1 : 0);
