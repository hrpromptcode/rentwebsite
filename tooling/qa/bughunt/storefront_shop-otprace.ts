import "../../load-env";
import { chromium } from "@playwright/test";

/** Replays the OTP verify server action 20x in parallel with wrong codes to see if the 5-attempt cap holds (storefront_shop bughunt). */
async function main() {
  const O = "http://demo-cafe.localhost:3000";
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const phone = `08${String(Date.now()).slice(-8)}`;
  await page.goto(`${O}/account/login`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.fill("#otp-target", phone);
  await page.locator('form button[type="submit"]').first().click();
  await page.locator("span.font-mono").first().waitFor({ timeout: 20_000 });
  const code = (await page.locator("span.font-mono").first().textContent())!.trim();
  let captured: { headers: Record<string, string>; body: string } | null = null;
  await page.route("**/account/login*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && !captured) captured = { headers: req.headers(), body: req.postData() ?? "" };
    await route.continue();
  });
  const wrong0 = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  await page.fill("#otp-code", wrong0);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  if (!captured) throw new Error("no action captured");
  const cap = captured as { headers: Record<string, string>; body: string };
  console.log("captured action body has code:", cap.body.includes(wrong0), "len", cap.body.length);
  const results = await page.evaluate(
    async ([body, headers, w0, c]) => {
      const h: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) if (/^(next-action|next-router-state-tree|content-type|accept)$/i.test(k)) h[k] = v;
      const tries = Array.from({ length: 20 }, (_, i) => String((Number(c) + 2 + i) % 1_000_000).padStart(6, "0"));
      const res = await Promise.all(tries.map((t) => fetch("/account/login", { method: "POST", headers: h, body: body.replace(w0, t) }).then((r) => r.text())));
      return res.map((t) => (t.includes("ลองผิดหลายครั้งเกินไป") ? "too_many" : t.includes("รหัสไม่ถูกต้อง") ? "invalid" : t.includes("รหัสหมดอายุ") ? "expired" : "other:" + t.slice(0, 60)));
    },
    [cap.body, cap.headers, wrong0, code] as const,
  );
  const tally: Record<string, number> = {};
  for (const r of results) tally[r] = (tally[r] ?? 0) + 1;
  console.log("20 parallel wrong codes ->", JSON.stringify(tally), "phone", phone);
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
