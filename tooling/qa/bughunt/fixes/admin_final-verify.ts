import "../../../load-env";
import path from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "./_dev-stable";

/**
 * admin_final packet browser checks (admin dev server http://localhost:3001, superadmin owns every demo tenant).
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/bughunt/fixes/admin_final-verify.ts shots <path ...>   # 1440 + 390 screenshots
 *   … admin_final-verify.ts kpi                     # KPI labels: no ellipsis / clipped text, values aligned per row (390 + 1440)
 *   … admin_final-verify.ts labels                  # image-URL inputs have a <label for> (accessible name from a label element)
 *   … admin_final-verify.ts focus                   # clinic dialogs: Esc returns focus to the opener, not <body>
 *   … admin_final-verify.ts payments                # Settings > Payments: status card, opt-in checkbox, validation, save probe
 *   … admin_final-verify.ts checklist               # dashboard checklist payments item follows paymentSetupStatus()
 */
const base = "http://localhost:3001";
const SHOTS = path.resolve("screenshots");
const STATE = path.resolve("qa/bughunt/fixes/_admin_final-state.json");
mkdirSync(SHOTS, { recursive: true });
const log = (...a: unknown[]) => console.log(...a);
let failures = 0;
export const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};

async function storage(browser: Browser) {
  if (existsSync(STATE) && Date.now() - statSync(STATE).mtimeMs < 6 * 3600_000) return STATE;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await isolateHmr(ctx);
  const page = await ctx.newPage();
  await stableGoto(page, `${base}/login`);
  await page.fill("#email", "admin@rentweb.local");
  await page.fill("#password", "Admin1234!");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}

export async function ctxAt(browser: Browser, width: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: width < 768, hasTouch: width < 768, storageState: await storage(browser) });
  await isolateHmr(ctx);
  return ctx;
}

export async function go(page: Page, p: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await stableGoto(page, `${base}${p}`);
      if ((res?.status() ?? 0) < 500) return res;
    } catch (e) {
      if (i === 2) throw e;
    }
    await page.waitForTimeout(8000);
  }
  return null;
}

const shotName = (p: string, w: number, tag = "") => path.join(SHOTS, `admin_final${tag}${p.replace(/[^a-z0-9]+/gi, "_")}-${w}.png`);

async function shots(browser: Browser, paths: string[], full = true) {
  for (const w of [1440, 390]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const p of paths) {
      const res = await go(page, p);
      await page.waitForTimeout(800);
      const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
      await page.screenshot({ path: shotName(p, w), fullPage: full, animations: "disabled" });
      log(`${w} ${p} status=${res?.status()} scrollWidth=${sw} -> ${path.basename(shotName(p, w))}`);
    }
    await ctx.close();
  }
}

/** KPI cards (KpiCard renders `.card` with an icon tile + text column). */
const KPI_MEASURE = `(() => [...document.querySelectorAll('[data-slot=kpi-card]')].map(c => {
  const label = c.querySelector('[data-slot=kpi-label]'); const value = c.querySelector('[data-slot=kpi-value]');
  const lr = label.getBoundingClientRect(); const vr = value.getBoundingClientRect(); const cr = c.getBoundingClientRect();
  const cs = getComputedStyle(label); const lh = parseFloat(cs.lineHeight) || 20;
  return { text: label.textContent, lines: Math.round(label.scrollHeight / lh), clipped: label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1, ellipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap', top: Math.round(cr.top), valueTop: Math.round(vr.top), right: Math.round(cr.right), vw: innerWidth };
}))()`;

async function kpi(browser: Browser) {
  const PATHS = ["/t/demo-restaurant/restaurant/orders?tab=history", "/t/demo-restaurant/restaurant/orders", "/t/demo-restaurant/restaurant/tables", "/t/demo-restaurant/restaurant/reservations", "/t/demo-restaurant/restaurant/menu", "/t/demo-clinic/clinic/visits", "/t/demo-clinic/bookings", "/t/demo-salon/bookings", "/t/demo-shop/dashboard", "/t/demo-restaurant/dashboard", "/t/demo-clinic/dashboard"];
  for (const w of [390, 1440]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const p of PATHS) {
      await go(page, p);
      await page.waitForTimeout(600);
      const cards = (await page.evaluate(KPI_MEASURE)) as Array<{ text: string; lines: number; clipped: boolean; ellipsis: boolean; top: number; valueTop: number; right: number; vw: number }>;
      if (!cards.length) {
        log(`INFO ${w} ${p}: no KPI cards`);
        continue;
      }
      const bad = cards.filter((c) => c.clipped || c.ellipsis || c.right > c.vw);
      const rows = new Map<number, number[]>();
      for (const c of cards) rows.set(c.top, [...(rows.get(c.top) ?? []), c.valueTop]);
      const misaligned = [...rows.values()].filter((v) => Math.max(...v) - Math.min(...v) > 1);
      check(!bad.length && !misaligned.length, `${w} ${p}: ${cards.length} KPI cards, labels ${cards.map((c) => `${c.text}(${c.lines})`).join(" · ")}${bad.length ? ` CLIPPED ${JSON.stringify(bad)}` : ""}${misaligned.length ? ` VALUES MISALIGNED ${JSON.stringify(misaligned)}` : ""}`);
      if (p.includes("tab=history") || p.endsWith("/clinic/visits")) await page.screenshot({ path: shotName(p, w, "-kpi"), animations: "disabled" });
    }
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ payments ------------------------------------------------------------------ */
// Probe tenant: commerce shop with no receiver configured (owned by a QA user; the superadmin can open it). Its settings are
// snapshotted first and written back byte-for-byte in `finally`.
const PROBE = "qa-ac02-shop-7w0f9";

async function unitPromptpay() {
  const { validPromptpayId, paymentsSchema, PROMPTPAY_ID_ERROR } = await import("../../../../apps/admin/src/app/t/[slug]/settings/shared");
  const { normalizeValidPromptpayId } = await import("@rentweb/core/payments");
  const cases = ["0812345678", "081-234-5678", "+66 81 234 5678", "66812345678", "0612345678", "0912345678", "021234567", "02-123-4567", "0712345678", "1234567890123", "123456789012345", "12345", "08123456789", "abc0812345678", "081 234 5678"];
  for (const c of cases) {
    const mine = validPromptpayId(c);
    const core = /[^0-9+\s-]/.test(c) ? null : normalizeValidPromptpayId(c);
    check(mine === core, `validPromptpayId(${JSON.stringify(c)}) = ${mine} (core ${core})`);
  }
  const base = { promptpayName: "", bankAccounts: [], enabled: { promptpay: true, bankTransfer: true, cod: false, card: false, wallet: false, cash: false }, autoApproveSlips: false, expiresMinutes: 30 };
  const bad = paymentsSchema.safeParse({ ...base, promptpayId: "021234567" });
  check(!bad.success && bad.error.issues[0]?.message === PROMPTPAY_ID_ERROR, `schema refuses a landline with the Thai message`);
  const ok = paymentsSchema.safeParse({ ...base, promptpayId: "", promptpayUseContactPhone: true });
  check(ok.success && ok.data.promptpayUseContactPhone === true, `schema passes promptpayUseContactPhone through`);
}

async function payments(browser: Browser) {
  await unitPromptpay();
  const { getAdminDb, tenants, eq } = await import("@rentweb/db");
  const { paymentSetupStatus } = await import("@rentweb/core/payments");
  const db = getAdminDb();
  const [row] = await db.select({ id: tenants.id, settings: tenants.settings }).from(tenants).where(eq(tenants.slug, PROBE));
  if (!row) throw new Error(`probe tenant ${PROBE} missing`);
  const original = JSON.parse(JSON.stringify(row.settings ?? {})) as Record<string, any>;
  const read = async () => ((await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, row.id)))[0]!.settings ?? {}) as Record<string, any>;
  const setContactPhone = (phone: string) => read().then((s) => db.update(tenants).set({ settings: { ...s, contact: { ...(s.contact ?? {}), phone } } }).where(eq(tenants.id, row.id)));
  check(!paymentSetupStatus(original).ready, `${PROBE} starts without a payment receiver`);
  const paymentsUrl = `/t/${PROBE}/settings/payments`;
  try {
    await setContactPhone("089-999-0011");
    for (const w of [1440, 390]) {
      const ctx = await ctxAt(browser, w);
      const page = await ctx.newPage();
      const actions: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.url());
      });
      // 1. not configured: status card + dashboard checklist item
      await go(page, paymentsUrl);
      const st = page.getByTestId("payment-setup-status");
      check((await st.getAttribute("data-ready")) === "false" && (await st.innerText()).includes("ลูกค้ายังชำระเงินออนไลน์ไม่ได้ จนกว่าจะตั้งค่า PromptPay หรือบัญชีธนาคาร"), `${w} status card says customers cannot pay online yet`);
      check(!(await page.locator("body").innerText()).includes("หากเว้นว่างระบบจะใช้เบอร์โทรร้าน"), `${w} the old "empty = contact phone" hint is gone`);
      check(((await page.evaluate("document.documentElement.scrollWidth")) as number) <= w, `${w} payments page has no horizontal overflow`);
      await page.screenshot({ path: shotName(paymentsUrl, w, "-notready"), fullPage: true, animations: "disabled" });
      await go(page, `/t/${PROBE}/dashboard`);
      const item = page.locator('[data-checklist="payments"]');
      check((await item.getAttribute("data-done")) === "false" && (await item.innerText()).includes("ลูกค้ายังชำระเงินออนไลน์ไม่ได้"), `${w} dashboard checklist payments item is not done and warns`);
      check((await item.locator("a").getAttribute("href")) === paymentsUrl, `${w} checklist item links to Settings > Payments`);
      if (w === 390) await page.screenshot({ path: shotName(`/t/${PROBE}/dashboard`, w, "-checklist"), fullPage: true, animations: "disabled" });

      // 2. client validation: a landline is refused in Thai, nothing is sent
      await go(page, paymentsUrl);
      await page.fill("#p-id", "02-123-4567");
      await page.locator("#p-id").blur();
      const err = page.getByText("PromptPay ID ไม่ถูกต้อง", { exact: false });
      check((await err.count()) > 0 && (await page.getAttribute("#p-id", "aria-invalid")) === "true", `${w} landline shows the Thai validation message`);
      const before = actions.length;
      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await page.waitForTimeout(1500);
      check(actions.length === before && !(await read()).payments?.promptpayId, `${w} invalid ID is not submitted (no server action, DB unchanged)`);
      check((await page.evaluate("document.activeElement && document.activeElement.id")) === "p-id", `${w} submit focuses the invalid PromptPay field`);

      if (w === 1440) {
        // 3. server probe: rewrite a valid submit to a landline on the wire — the action must refuse it
        await page.fill("#p-id", "0812345678");
        await page.route("**/*", (route) => {
          const r = route.request();
          if (r.method() === "POST" && r.headers()["next-action"] && (r.postData() ?? "").includes("0812345678")) return route.continue({ postData: (r.postData() ?? "").replace("0812345678", "021234567") });
          return route.continue();
        });
        await page.getByRole("button", { name: "บันทึก", exact: true }).click();
        const toast = page.locator("[data-sonner-toast]").filter({ hasText: "PromptPay ID ไม่ถูกต้อง" });
        await toast.first().waitFor({ timeout: 30_000 }).catch(() => {});
        check((await toast.count()) > 0 && !(await read()).payments?.promptpayId, `server action refuses a tampered landline ID (Thai toast, DB unchanged)`);
        await page.unroute("**/*");
        await page.fill("#p-id", "");
      }

      // 4. opt-in: no PromptPay ID + "use the shop's mobile" -> saved, status ready via the contact phone
      await go(page, paymentsUrl);
      await page.fill("#p-id", "");
      check((await page.locator("#p-use-phone-hint").innerText()).includes("089-999-0011"), `${w} opt-in hint names the contact mobile`);
      await page.locator("#p-use-phone").click();
      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const saved = await read();
      check(saved.payments?.promptpayUseContactPhone === true && !saved.payments?.promptpayId && paymentSetupStatus(saved).ready, `${w} save stores promptpayUseContactPhone=true and core status is ready (${JSON.stringify(paymentSetupStatus(saved))})`);
      await go(page, paymentsUrl);
      const st2 = page.getByTestId("payment-setup-status");
      const t2 = await st2.innerText();
      check((await st2.getAttribute("data-ready")) === "true" && t2.includes("089-999-0011") && t2.includes("เบอร์โทรร้าน"), `${w} status card shows PromptPay QR → 089-999-0011 (เบอร์โทรร้าน)`);
      check((await page.locator("#p-use-phone").getAttribute("data-state")) === "checked", `${w} opt-in checkbox reloads checked`);
      await page.screenshot({ path: shotName(paymentsUrl, w, "-ready"), fullPage: true, animations: "disabled" });
      await go(page, `/t/${PROBE}/dashboard`);
      check((await page.locator('[data-checklist="payments"]').getAttribute("data-done")) === "true", `${w} dashboard checklist payments item is done once a receiver exists`);

      // 5. opt-in with a landline contact phone: not a receiver
      await setContactPhone("02-123-4567");
      await go(page, paymentsUrl);
      check((await page.getByTestId("payment-setup-status").getAttribute("data-ready")) === "false" && (await page.locator("#p-use-phone-hint").innerText()).includes("ไม่ใช่เบอร์มือถือ"), `${w} opted in + landline contact phone = not ready, hint explains why`);
      await go(page, `/t/${PROBE}/dashboard`);
      check((await page.locator('[data-checklist="payments"]').getAttribute("data-done")) === "false", `${w} checklist not done with a landline opt-in`);

      // reset for the next width
      await db.update(tenants).set({ settings: original }).where(eq(tenants.id, row.id));
      await setContactPhone("089-999-0011");
      await ctx.close();
    }
    // demo tenants keep their saved receivers
    const ctx = await ctxAt(browser, 1440);
    const page = await ctx.newPage();
    for (const slug of ["demo-shop", "demo-restaurant", "demo-clinic"]) {
      await go(page, `/t/${slug}/dashboard`);
      check((await page.locator('[data-checklist="payments"]').getAttribute("data-done")) === "true", `${slug} dashboard payments item done (receiver configured)`);
    }
    await ctx.close();
  } finally {
    await db.update(tenants).set({ settings: original }).where(eq(tenants.id, row.id));
    await (await import("@rentweb/core/tenant")).invalidateTenant(row.id).catch(() => {}); // drop the storefront config cache the probe saves filled
    check(JSON.stringify(await read()) === JSON.stringify(original), `${PROBE} settings restored`);
  }
}

/* ------------------------------------------------------------------ labels ------------------------------------------------------------------ */
// RESPONSIVE_B2-16: every visible "หรือวางลิงก์รูป https://…" input must be named by a <label for=…> (not aria-label / placeholder).
const LABEL_MEASURE = `(() => [...document.querySelectorAll('input[placeholder*="ลิงก์รูป"]')].filter(i => i.offsetParent).map(i => {
  const lab = i.id ? document.querySelector('label[for="' + CSS.escape(i.id) + '"]') : null;
  return { id: i.id, label: lab ? lab.textContent.trim() : null, aria: i.getAttribute('aria-label'), labels: i.labels ? i.labels.length : 0 };
}))()`;

async function labels(browser: Browser) {
  const { getAdminDb, tenants, clinicVisits, and, eq, ne } = await import("@rentweb/db");
  const db = getAdminDb();
  const [clinic] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-clinic"));
  const [visit] = await db.select({ id: clinicVisits.id }).from(clinicVisits).where(and(eq(clinicVisits.tenantId, clinic!.id), ne(clinicVisits.status, "cancelled"))).limit(1);
  const targets: Array<{ path: string; open?: string; expect: number }> = [
    { path: "/t/demo-salon/services/new", expect: 1 },
    { path: "/t/demo-salon/staff/new", expect: 1 },
    { path: "/t/demo-shop/products/new", expect: 1 },
    { path: "/t/demo-clinic/clinic/packages", open: '[data-testid="new-package"]', expect: 1 },
    ...(visit ? [{ path: `/t/demo-clinic/clinic/visits/${visit.id}`, expect: 2 }] : []),
  ];
  if (!visit) log("INFO no non-cancelled demo-clinic visit — visit-form not checked in the browser");
  for (const w of [1440, 390]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const t of targets) {
      await go(page, t.path);
      if (t.open) {
        await page.locator(t.open).click();
        await page.waitForTimeout(800);
      }
      const inputs = (await page.evaluate(LABEL_MEASURE)) as Array<{ id: string; label: string | null; aria: string | null; labels: number }>;
      const ok = inputs.length >= t.expect && inputs.every((x) => x.id && x.label && x.labels > 0 && !x.aria);
      check(ok, `${w} ${t.path}: ${inputs.length} image-URL input(s) named by <label for>: ${JSON.stringify(inputs)}`);
      // the accessible name the browser computes comes from the label
      const snap = await page.locator('input[placeholder*="ลิงก์รูป"]:visible').first().ariaSnapshot().catch(() => "");
      check(/textbox "ลิงก์รูป/.test(snap), `${w} ${t.path}: accessible name ${snap.split("\n")[0]}`);
      if (w === 390 && t.path.includes("products/new")) await page.screenshot({ path: shotName(t.path, w, "-label"), fullPage: true, animations: "disabled" });
    }
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ focus ------------------------------------------------------------------ */
// RESPONSIVE_B2-11: controlled dialogs (no DialogTrigger) must give focus back to their opener on close (Esc and the X button).
const ACTIVE = `(() => { const e = document.activeElement; return e === document.body || !e ? 'body' : e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + " '" + (e.innerText || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 30) + "'"; })()`;

async function focus(browser: Browser) {
  const { getAdminDb, tenants, clinicVisits, and, eq } = await import("@rentweb/db");
  const db = getAdminDb();
  const [clinic] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-clinic"));
  const [visit] = await db.select({ id: clinicVisits.id }).from(clinicVisits).where(and(eq(clinicVisits.tenantId, clinic!.id), eq(clinicVisits.status, "open"))).limit(1);
  const C = "/t/demo-clinic/clinic";
  const R = "/t/demo-restaurant/restaurant";
  const targets: Array<{ path: string; opener: string; name: string; preOpened?: boolean; only?: number }> = [
    // regression: existing useReturnFocus users (drawer = onOpenAutoFocus path + fallback ref, ConfirmButton = fallback ref)
    { path: "/t/demo-shop/dashboard", opener: 'button[aria-label="เปิดเมนู"]', name: "app-shell drawer (existing hook user)", only: 390 },
    { path: `${C}/packages`, opener: 'main button[aria-label^="ลบ "]', name: "ConfirmButton ลบแพ็กเกจ (existing hook user; Esc/ปิด only, nothing deleted)" },
    { path: `${C}/patients`, opener: 'main button:has-text("เพิ่มผู้ป่วย")', name: "clinic patients: เพิ่มผู้ป่วย" },
    { path: `${C}/patients?new=1`, opener: 'main button:has-text("เพิ่มผู้ป่วย")', name: "clinic patients ?new=1 (opened on load, fallback = opener button)", preOpened: true },
    { path: `${C}/visits`, opener: '[data-testid="open-visit"]', name: "clinic visits: เปิดการตรวจใหม่" },
    { path: `${C}/packages`, opener: '[data-testid="new-package"]', name: "clinic packages: เพิ่มแพ็กเกจ" },
    { path: `${C}/packages`, opener: 'main button[aria-label^="แก้ไข"]', name: "clinic packages: แก้ไข <package>" },
    ...(visit ? [{ path: `${C}/visits/${visit.id}`, opener: 'main button:has-text("ปิดการตรวจ")', name: "clinic visit: ปิดการตรวจ" }] : []),
    { path: `${R}/menu`, opener: 'main button:has-text("จัดการหมวด")', name: "restaurant menu: จัดการหมวด" },
    { path: `${R}/menu/modifiers`, opener: 'main button:has-text("เพิ่มกลุ่มตัวเลือก")', name: "restaurant modifiers: เพิ่มกลุ่มตัวเลือก" },
    { path: `${R}/tables`, opener: 'main button:has-text("เพิ่มโต๊ะ")', name: "restaurant tables: เพิ่มโต๊ะ" },
    { path: `${R}/reservations`, opener: 'main button:has-text("เพิ่มการจอง"), main button:has-text("จองโต๊ะ")', name: "restaurant reservations: new reservation" },
  ];
  if (!visit) log("INFO no open demo-clinic visit — ปิดการตรวจ dialog not checked");
  for (const w of [1440, 390]) {
    const ctx = await ctxAt(browser, w);
    const page = await ctx.newPage();
    for (const t of targets) {
      if (t.only && t.only !== w) continue;
      for (const how of ["Escape", "close-button"] as const) {
        await go(page, t.path);
        const opener = page.locator(t.opener).first();
        if (!(await opener.count())) {
          check(false, `${w} ${t.name}: opener ${t.opener} not found`);
          break;
        }
        const openerDesc = (await opener.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || "")).replace(/\s+/g, " ").trim().slice(0, 30);
        if (!t.preOpened) await opener.click();
        const dlg = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last();
        await dlg.waitFor({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(500);
        const inside = await page.evaluate(`(() => !!document.activeElement && !!document.activeElement.closest('[role=dialog],[role=alertdialog]'))()`);
        if (how === "Escape") await page.keyboard.press("Escape");
        else {
          const x = dlg.getByRole("button", { name: "ปิด", exact: true });
          if (!(await x.count())) {
            log(`INFO ${w} ${t.name}: no ปิด button — Escape only`);
            await page.keyboard.press("Escape");
            continue;
          }
          await x.last().click();
        }
        await page.waitForTimeout(700);
        const open = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').count();
        const active = (await page.evaluate(ACTIVE)) as string;
        const back = await opener.evaluate((el) => el === document.activeElement).catch(() => false);
        check(!open && inside && back, `${w} ${t.name} [${how}]: focus moved into dialog=${inside}, closed=${!open}, focus after close -> ${active} (opener '${openerDesc}')`);
      }
    }
    await ctx.close();
  }
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (mode === "shots") await shots(browser, rest.map((p) => (p.startsWith("/") ? p : `/${p}`)));
    else if (mode === "kpi") await kpi(browser);
    else if (mode === "payments") await payments(browser);
    else if (mode === "labels") await labels(browser);
    else if (mode === "focus") await focus(browser);
    else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser.close();
  }
  log(failures ? `${failures} FAILED` : "ALL PASS");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
