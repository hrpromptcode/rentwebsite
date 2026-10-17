import { readFileSync, writeFileSync } from "node:fs";
import { and, eq, tenantDomains, tenantInvitations, tenantMembers, user } from "@rentweb/db";
import { anyToast, done, go, hreq, launch, newCtx, newPage, out, plat, rand, readCreds, shot, writeCreds, ADMIN } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
// reverify-repro 2026-10-17: a re-run needs its own suffix — with the hunt's C.rand the domain is already claimed and the
// staff/manager accounts already exist (invite says 'already a member', sign-up of an existing e-mail never leaves /signup)
const R = process.env.ADMIN_B2_TEAM_RAND ?? rand();
async function main() {
  const browser = await launch();
  const st = JSON.parse(readFileSync("qa/bughunt/admin_b2-state-owner.json", "utf8"));
  const ctx = await newCtx(browser, { storageState: st });
  const page = await newPage(ctx);
  const shop = T.shop.slug as string;
  // ---------- domains ----------
  const host = `www.qa-b2-${R}.test`;
  await go(page, `/t/${shop}/settings/domains`);
  await page.fill("#d-host", `https://${host.toUpperCase()}/some/path`);
  out("add domain", await anyToast(page, () => page.locator("form").getByRole("button").last().click()));
  const [d1] = await plat((tx) => tx.select().from(tenantDomains).where(eq(tenantDomains.hostname, host)));
  out("db domain", d1 ? { hostname: d1.hostname, status: d1.status, kind: d1.kind } : null);
  const r1 = await hreq(host, "/");
  out("storefront via PENDING domain", { status: r1.status, title: r1.body.match(/<title>([^<]*)<\/title>/)?.[1] });
  await page.reload({ waitUntil: "networkidle" });
  out("verify", await anyToast(page, () => page.getByRole("button", { name: /ตรวจสอบ DNS/ }).first().click()));
  const [d2] = await plat((tx) => tx.select().from(tenantDomains).where(eq(tenantDomains.hostname, host)));
  out("db domain after verify", { status: d2?.status, lastError: d2?.lastError });
  const r2 = await hreq(host, "/");
  out("storefront via FAILED domain", { status: r2.status, title: r2.body.match(/<title>([^<]*)<\/title>/)?.[1] });
  await page.screenshot({ path: shot("domains") });
  // same hostname from another tenant
  await go(page, `/t/${T.cafe.slug}/settings/domains`);
  await page.fill("#d-host", host);
  out("same host on 2nd tenant", await anyToast(page, () => page.locator("form").getByRole("button").last().click()));
  await page.fill("#d-host", "demo-shop.localhost");
  const formMsg = async () => (await page.locator("form [role=alert], form .text-destructive").allInnerTexts().catch(() => [])).join(" | ");
  out("platform subdomain", { toast: await anyToast(page, () => page.locator("form").getByRole("button").last().click(), 8_000), form: await formMsg() });
  await page.fill("#d-host", "bad_host!!");
  out("invalid host", { toast: await anyToast(page, () => page.locator("form").getByRole("button").last().click(), 8_000), form: await formMsg() });
  // ---------- invites ----------
  const people = { staff: `qa-b2-staff-${R}@example.com`, manager: `qa-b2-mgr-${R}@example.com` } as const;
  const roleLabel = { staff: "พนักงาน", manager: "ผู้จัดการ" } as const;
  const tokens: Record<string, Record<string, string>> = { staff: {}, manager: {} };
  for (const key of ["shop", "restaurant", "salon", "clinic"]) {
    const slug = T[key].slug;
    for (const role of ["staff", "manager"] as const) {
      await go(page, `/t/${slug}/settings/team`);
      await page.fill("#inv-email", people[role]);
      await page.locator("#inv-role").click();
      await page.getByRole("option", { name: roleLabel[role] }).click();
      const t = await anyToast(page, () => page.locator("form").getByRole("button", { name: /เชิญ|ส่ง|สร้าง/ }).last().click());
      const [inv] = await plat((tx) => tx.select().from(tenantInvitations).where(and(eq(tenantInvitations.tenantId, T[key].id), eq(tenantInvitations.email, people[role]))));
      tokens[role]![key] = inv!.token;
      out(`invite ${role}@${key}`, { toast: t, role: inv!.role });
    }
  }
  await ctx.close();
  // ---------- accept as NEW users ----------
  const pw = `B2-${R}-Team9!`;
  for (const role of ["staff", "manager"] as const) {
    const c2 = await newCtx(browser);
    const p2 = await newPage(c2);
    await go(p2, `/invite/${tokens[role]!.shop}`);
    out(`${role} signed-out invite -> `, p2.url().replace(ADMIN, ""));
    const signupLink = p2.getByRole("link", { name: /สมัคร/ }).first();
    out(`${role} signup link href`, await signupLink.getAttribute("href"));
    await signupLink.click();
    await p2.waitForURL(/\/signup/, { timeout: 30_000 });
    await p2.fill("#name", `QA B2 ${role}`); await p2.fill("#email", people[role]); await p2.fill("#password", pw);
    await p2.click('button[type="submit"]');
    await p2.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 90_000 });
    await p2.waitForLoadState("networkidle");
    out(`${role} after signup landed on`, p2.url().replace(ADMIN, ""));
    await p2.screenshot({ path: shot(`invite-${role}-after-signup`) });
    for (const key of ["shop", "restaurant", "salon", "clinic"]) {
      await go(p2, `/invite/${tokens[role]![key]}`);
      const title = await p2.locator("h1, [data-slot=card-title]").first().innerText().catch(() => "");
      await Promise.all([p2.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 90_000 }).catch(() => {}), p2.getByRole("button", { name: /ยอมรับ|เข้าร่วม/ }).first().click()]);
      const [m] = await plat((tx) => tx.select({ role: tenantMembers.role }).from(tenantMembers).innerJoin(user, eq(user.id, tenantMembers.userId)).where(and(eq(tenantMembers.tenantId, T[key].id), eq(user.email, people[role]))));
      out(`${role} accept ${key}`, { title, url: p2.url().replace(ADMIN, ""), memberRole: m?.role });
    }
    // reuse the token again
    await go(p2, `/invite/${tokens[role]!.shop}`);
    out(`${role} reopen used invite`, (await p2.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120));
    await c2.storageState({ path: `qa/bughunt/admin_b2-state-${role}.json` });
    await c2.close();
  }
  writeCreds({ team: { staff: { email: people.staff, password: pw }, manager: { email: people.manager, password: pw } }, domainHost: host });
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
