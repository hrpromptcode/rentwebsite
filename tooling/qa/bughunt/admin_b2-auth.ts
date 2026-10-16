import { readFileSync } from "node:fs";
import { ADMIN, go, launch, newCtx, newPage, out, readCreds } from "./admin_b2-lib";
const C = readCreds();
async function main() {
  const browser = await launch();
  const ctx = await newCtx(browser);
  const page = await newPage(ctx);
  const err = async () => (await page.locator("form [role=alert], form .text-destructive").allInnerTexts().catch(() => [])).join(" | ");
  // protected routes signed out
  for (const p of ["/", "/t", "/t/demo-shop/dashboard", "/t/demo-shop/orders?status=pending", "/console", "/onboarding", `/invite/abc`]) {
    await page.goto(`${ADMIN}${p}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    out(`signed-out ${p}`, page.url().replace(ADMIN, ""));
  }
  // wrong password / unknown email
  await go(page, "/login?next=%2Ft%2Fdemo-shop%2Forders%3Fstatus%3Dpending");
  await page.fill("#email", C.owner.email); await page.fill("#password", "wrong-password-1");
  await page.click('button[type="submit"]'); await page.waitForTimeout(3000);
  out("wrong password", { url: page.url().replace(ADMIN, ""), err: await err() });
  await page.fill("#email", "nobody-qa-b2@example.com"); await page.fill("#password", "whatever-123");
  await page.click('button[type="submit"]'); await page.waitForTimeout(3000);
  out("unknown email", { url: page.url().replace(ADMIN, ""), err: await err() });
  // brute-force: 12 wrong attempts
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) {
    codes.push(await page.evaluate(async (e) => (await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: "bad-" + Math.random() }) })).status, C.owner.email));
  }
  out("12 rapid wrong sign-ins (status codes)", codes.join(","));
  // correct login honours next (owner is not member of demo-shop -> expect 404 there), use own tenant
  await go(page, `/login?next=${encodeURIComponent(`/t/${C.tenants[0].slug}/orders`)}`);
  await page.fill("#email", C.owner.email); await page.fill("#password", C.owner.password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  out("login with next ->", page.url().replace(ADMIN, ""));
  // owner visiting a tenant they do not belong to / console
  out("owner -> /t/demo-shop/dashboard", { status: await go(page, "/t/demo-shop/dashboard"), url: page.url().replace(ADMIN, "") });
  out("owner -> /console", { status: await go(page, "/console"), url: page.url().replace(ADMIN, "") });
  // logout
  await go(page, "/logout");
  out("after /logout", page.url().replace(ADMIN, ""));
  await page.goto(`${ADMIN}/t/${C.tenants[0].slug}/dashboard`, { waitUntil: "domcontentloaded" });
  out("after logout protected", page.url().replace(ADMIN, ""));
  // logout via UI menu (sign in again)
  await go(page, "/login");
  await page.fill("#email", C.owner.email); await page.fill("#password", C.owner.password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
  await go(page, `/t/${C.tenants[0].slug}/dashboard`);
  const menuBtn = page.locator("header button").filter({ hasText: /QB|Q/ }).last();
  await menuBtn.click().catch(() => {});
  const lo = page.getByRole("menuitem", { name: /ออกจากระบบ/ });
  out("logout menu item", await lo.count());
  if (await lo.count()) { await Promise.all([page.waitForURL(/\/login/, { timeout: 60_000 }).catch(() => {}), lo.first().click()]); out("after UI logout", page.url().replace(ADMIN, "")); }
  // back button after logout shows cached page?
  await page.goBack().catch(() => {});
  await page.waitForTimeout(2000);
  out("back after logout", { url: page.url().replace(ADMIN, ""), hasDashboard: /สวัสดี/.test(await page.locator("body").innerText()) });
  out("errors", page.__errors.slice(0, 5));
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
