/**
 * Browser regressions on the admin_b2 throwaway tenants (everything created here is removed again):
 *  ADMIN_B2-18  navigation editor: javascript: link shows an inline error and the save is refused (DB unchanged);
 *               an https link saves with external:true
 *  ADMIN_B2-11  Settings > Domains: status help, TXT/CNAME records from core domainDnsInstructions, "ตรวจสอบ DNS"
 *               runs core verifyCustomDomain (failed -> Thai reason), a new claim stays pending, removal works
 *  ADMIN_B2-12  signed-out invitee: /invite/<token> -> login -> sign-up link keeps ?next -> sign-up (e-mail prefilled,
 *               invite banner) -> back on /invite/<token> -> accept -> tenant dashboard as staff
 *  RESPONSIVE_B2-11  390 px drawer + ConfirmButton dialog return focus to their opener on Esc
 *  Screenshots at 1440 and 390: tooling/screenshots/bughunt-admin_b2-b4-*.png
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/ADMIN_B2-11-12-18-verify.ts
 */
import { randomBytes } from "node:crypto";
import { and, eq, navigation, tenantDomains, tenantInvitations, tenantMembers, user } from "@rentweb/db";
import { ADMIN, anyToast, done, go, launch, newCtx, newPage, plat, rand, readCreds, shot, stateFor, toast, tt } from "../admin_b2-lib";
import { isolateHmr } from "./_dev-stable";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};
const c = readCreds();
const shop = c.tenants.find((t: { key: string }) => t.key === "shop") as { slug: string; id: string };
const r = rand();
const newHost = `qa-b4-${r}.test`;
const invEmail = `qa-b4-inv-${r}@example.com`;
const token = randomBytes(24).toString("base64url");
const navBefore = await tt(shop.id, (tx) => tx.select().from(navigation).where(eq(navigation.tenantId, shop.id)));
const focusLabel = (p: import("@playwright/test").Page) => p.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 40) ?? document.activeElement?.tagName);

const browser = await launch();
try {
  const st = await stateFor(browser, "owner", c.owner.email, c.owner.password);
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    const ctx = await newCtx(browser, { storageState: st, viewport: { width: vp.w, height: vp.h } });
    await isolateHmr(ctx);
    const page = await newPage(ctx);

    /* ---- ADMIN_B2-18 (1440 only; screenshot both) ---- */
    await go(page, `/t/${shop.slug}/navigation`);
    if (vp.w === 1440) {
      await page.getByRole("button", { name: /^เพิ่มเมนู$/ }).first().click();
      const labels = page.getByLabel("ชื่อเมนู");
      const links = page.getByLabel("ลิงก์", { exact: true });
      await labels.last().fill("QA B4 JS");
      await links.last().fill("javascript:alert(document.domain)");
      const inline = await page.getByText(/ไม่อนุญาตลิงก์แบบ “javascript:”/).first().isVisible();
      check("B2-18 inline error for javascript: link", inline);
      const t = await anyToast(page, () => page.getByRole("button", { name: /บันทึก/ }).last().click());
      check("B2-18 save refused with Thai error", /ไม่อนุญาตลิงก์แบบ “javascript:”/.test(t), t);
      const navMid = await tt(shop.id, (tx) => tx.select().from(navigation).where(eq(navigation.tenantId, shop.id)));
      check("B2-18 DB unchanged", JSON.stringify(navMid.map((n) => n.items)) === JSON.stringify(navBefore.map((n) => n.items)));
      await links.last().fill("https://example.com/qa-b4");
      await toast(page, /บันทึกเมนูนำทางแล้ว/, () => page.getByRole("button", { name: /บันทึก/ }).last().click());
      const navAfter = await tt(shop.id, (tx) => tx.select().from(navigation).where(and(eq(navigation.tenantId, shop.id), eq(navigation.location, "header"))));
      const item = (navAfter[0]?.items ?? []).find((i) => i.label === "QA B4 JS");
      check("B2-18 https link saved with external flag", item?.href === "https://example.com/qa-b4" && item?.external === true, item);
    }
    await page.screenshot({ path: shot(`b4-nav-${vp.w}`), fullPage: false });

    /* ---- ADMIN_B2-11 ---- */
    await go(page, `/t/${shop.slug}/settings/domains`);
    const body = await page.locator("main").innerText();
    const failedHost = c.domainHost as string;
    check(`B2-11 status help shown (${vp.w})`, /ยังไม่เปิดใช้/.test(body), body.slice(0, 200));
    check(`B2-11 TXT record name is _rentweb.<host> (${vp.w})`, body.includes(`_rentweb.${failedHost}`));
    check(`B2-11 CNAME target shown (${vp.w})`, body.includes(`${shop.slug}.localhost`));
    if (vp.w === 1440) {
      const row = page.locator("li").filter({ hasText: failedHost }).first();
      const t = await anyToast(page, () => row.getByRole("button", { name: /ตรวจสอบ DNS/ }).click(), 90_000);
      check("B2-11 verify uses core check (failed -> TXT reason)", /ไม่พบ TXT record ที่ _rentweb\./.test(t), t);
      const [d] = await plat((tx) => tx.select().from(tenantDomains).where(and(eq(tenantDomains.tenantId, shop.id), eq(tenantDomains.hostname, failedHost))));
      check("B2-11 still not routable", d?.status === "failed", d?.status);
      await page.locator("#d-host").fill(`https://${newHost.toUpperCase()}/x`);
      const tAdd = await toast(page, /เปิดใช้หลังยืนยัน|ไม่ถูกต้อง|แล้ว/, () => page.getByRole("button", { name: /เพิ่มโดเมน/ }).click());
      const [nd] = await plat((tx) => tx.select().from(tenantDomains).where(eq(tenantDomains.hostname, newHost)));
      check("B2-11 new claim normalised + pending", nd?.status === "pending" && /เปิดใช้หลังยืนยัน/.test(tAdd), { status: nd?.status, tAdd });
      // RESPONSIVE_B2-11: ConfirmButton returns focus on Esc
      const newRow = page.locator("li").filter({ hasText: newHost }).first();
      const del = newRow.getByRole("button", { name: /^ลบ$/ });
      await del.focus();
      await del.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      check("RESPONSIVE_B2-11 ConfirmButton dialog returns focus", (await focusLabel(page)) === "ลบ", await focusLabel(page));
      await del.click();
      await toast(page, /ลบโดเมนแล้ว/, () => page.getByRole("dialog").getByRole("button", { name: /ลบโดเมน/ }).click());
    }
    await page.screenshot({ path: shot(`b4-domains-${vp.w}`), fullPage: true });

    /* ---- RESPONSIVE_B2-11 drawer (390) ---- */
    if (vp.w === 390) {
      await go(page, `/t/${shop.slug}/dashboard`);
      const menu = page.getByRole("button", { name: "เปิดเมนู" });
      await menu.focus();
      await menu.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      check("RESPONSIVE_B2-11 drawer returns focus to 'เปิดเมนู'", (await focusLabel(page)) === "เปิดเมนู", await focusLabel(page));
    }
    await ctx.close();
  }

  /* ---- ADMIN_B2-12 ---- */
  const [owner] = await plat((tx) => tx.select({ id: user.id }).from(user).where(eq(user.email, c.owner.email)));
  await plat((tx) => tx.insert(tenantInvitations).values({ tenantId: shop.id, email: invEmail, role: "staff", token, invitedBy: owner!.id, expiresAt: new Date(Date.now() + 86_400_000) }));
  for (const vp of [{ w: 390, h: 844 }]) {
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h } });
    await isolateHmr(ctx);
    const p = await newPage(ctx);
    await go(p, `/invite/${token}`);
    check("B2-12 signed-out invite -> login with next", p.url().includes(`/login?next=${encodeURIComponent(`/invite/${token}`)}`), p.url().replace(ADMIN, ""));
    const link = p.getByRole("link", { name: /สมัคร/ });
    const href = await link.getAttribute("href");
    check("B2-12 sign-up link keeps next", href === `/signup?next=${encodeURIComponent(`/invite/${token}`)}`, href);
    await link.click();
    await p.waitForURL(/\/signup\?next=/);
    await p.locator("#name").waitFor();
    const txt = await p.locator("main, body").first().innerText();
    check("B2-12 sign-up shows the invitation + prefilled e-mail", txt.includes("QA B2 Shop sppp") && (await p.locator("#email").inputValue()) === invEmail, txt.slice(0, 160));
    await p.screenshot({ path: shot(`b4-signup-invite-${vp.w}`), fullPage: true });
    await p.locator("#name").fill("QA B4 Invitee");
    await p.locator("#password").fill("Qa-b4-Invite-77");
    await Promise.all([p.waitForURL((u) => u.pathname === `/invite/${token}`, { timeout: 120_000 }), p.getByRole("button", { name: /สร้างบัญชีฟรี/ }).click()]);
    check("B2-12 after sign-up back on the invitation", p.url().endsWith(`/invite/${token}`), p.url().replace(ADMIN, ""));
    await Promise.all([p.waitForURL(new RegExp(`/t/${shop.slug}/`), { timeout: 120_000 }), p.getByRole("button", { name: /ยอมรับคำเชิญ/ }).click()]);
    const [u] = await plat((tx) => tx.select({ id: user.id }).from(user).where(eq(user.email, invEmail)));
    const [m] = u ? await plat((tx) => tx.select({ role: tenantMembers.role }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, shop.id), eq(tenantMembers.userId, u.id)))) : [];
    check("B2-12 invitee joined as staff and landed in the back office", m?.role === "staff" && p.url().includes(`/t/${shop.slug}/`), { role: m?.role, url: p.url().replace(ADMIN, "") });
    await ctx.close();
  }
} finally {
  await browser.close();
  // restore navigation, remove test domain / invite / user
  for (const n of navBefore) await tt(shop.id, (tx) => tx.update(navigation).set({ items: n.items }).where(and(eq(navigation.tenantId, shop.id), eq(navigation.location, n.location))));
  await plat((tx) => tx.delete(tenantDomains).where(eq(tenantDomains.hostname, newHost)));
  await plat((tx) => tx.delete(tenantInvitations).where(eq(tenantInvitations.token, token)));
  const [u] = await plat((tx) => tx.select({ id: user.id }).from(user).where(eq(user.email, invEmail)));
  if (u) await plat(async (tx) => {
    await tx.delete(tenantMembers).where(eq(tenantMembers.userId, u.id));
    await tx.delete(user).where(eq(user.id, u.id)); // sessions/accounts cascade
  });
  await done();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
