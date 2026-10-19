/**
 * Live verification of the top-up ADMIN fixes (packet tooling/qa/bughunt/fixes/topup_admin.md) on demo-topup.
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_admin-verify.ts [db|ui|all]
 * db: every scenario inside a rolled-back tenant transaction (real data untouched).
 * ui: ONE Playwright context against the running admin (:3001) + storefront (:3000); it only uploads files and reads
 *     pages (nothing is confirmed / saved). Screenshots: tooling/screenshots/topup-admin-fix-*.png.
 * Prints PASS/FAIL per check; exit code 1 when any check fails.
 */
import "../../../load-env";
import http from "node:http";
import path from "node:path";
import { gamePackages, getDb, sql, withTenant, type Tx } from "@rentweb/db";
import { adminCancelOrder, adminFailOrder, adminRejectSlip, deletePackage, importStockCodes, topupKpis } from "../../../../packages/modules/topup/src/admin";
import { paymentsQueue } from "../../../../packages/modules/commerce/src/admin/payments";
import { computeKpis } from "../../../../apps/admin/src/app/t/[slug]/dashboard/kpis";
import { ADMIN, OWNER, PNG, SLUG, launch, newCtx, stateFor } from "../topup_admin-lib";
import { stableGoto } from "./_dev-stable";

const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const STEAM_GAME = "01a1401c-c0a5-7385-9c13-47dea5a2c894";
const STEAM_100 = "01a1401c-c0e6-77ff-a44e-7431f178febf";
const actor = { userId: "00000000-0000-4000-8000-0000000000a1", actorType: "user" as const };
const phase = process.argv[2] ?? "all";
const want = (p: string) => phase === "all" || phase === p;
const db = getDb();
const rows = <R>(r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as R[];
let failed = 0;
function check(id: string, name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}
class Rollback extends Error {}
async function rb(fn: (tx: Tx) => Promise<void>) {
  try {
    await withTenant(db, T, async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
/** Node cannot resolve *.localhost: hit 127.0.0.1:3000 with the tenant Host header. */
function hostGet(host: string, p: string): Promise<{ status: number; ct: string | null }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path: p, method: "GET", headers: { host }, timeout: 60_000 }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, ct: (res.headers["content-type"] as string | undefined) ?? null }));
    });
    req.on("error", reject);
    req.end();
  });
}
const bangkokToday = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${d}T00:00:00+07:00`);
};

if (want("db")) {
  await rb(async (tx) => {
    // ADMIN-03: an unpaid demo order cannot be failed
    const [o] = rows<{ id: string; number: string; payment_id: string }>(await tx.execute(sql`select o.id, o.number, o.payment_id from topup_orders o join payments p on p.id = o.payment_id where o.tenant_id = ${T} and o.status = 'pending_payment' and p.status = 'pending' limit 1`));
    if (o) {
      const r = await adminFailOrder(tx, T, o.id, "qa", actor);
      check("ADMIN-03", `fail unpaid ${o.number}`, !r.ok && r.code === "not_paid" && r.error.includes("ยกเลิกรายการ"), r);
      // ADMIN-04: cancel voids the payment through cancelPayment → payment.cancelled
      const c = await adminCancelOrder(tx, T, o.id, "qa cancel", actor);
      const [p] = rows<{ status: string }>(await tx.execute(sql`select status from payments where id = ${o.payment_id}`));
      const ev = rows<{ type: string }>(await tx.execute(sql`select type from events_outbox where tenant_id = ${T} and (payload->>'paymentId' = ${o.payment_id} or payload->>'orderId' = ${o.id}) and created_at > now() - interval '1 minute'`)).map((e) => e.type);
      check("ADMIN-04", `cancel ${o.number}`, c.ok && p?.status === "cancelled" && ev.includes("payment.cancelled") && ev.filter((e) => e === "topup.cancelled").length === 1, { ok: c.ok, payment: p?.status, ev });
      // ADMIN-05: reject on the now cancelled payment → friendly result
      const rj = await adminRejectSlip(tx, T, o.id, "สลิปไม่ถูกต้อง", actor);
      check("ADMIN-05", "reject on cancelled payment", !rj.ok && rj.error === "รายการชำระเงินนี้ปิดแล้ว", rj);
    } else check("ADMIN-03", "no pending demo order to probe", false, "none");
  });

  await rb(async (tx) => {
    // ADMIN-06 on the real stock: an existing code (decrypted from the DB) and a fresh one imported twice
    const [code] = rows<{ code_encrypted: string; status: string }>(await tx.execute(sql`select code_encrypted, status from code_stock where tenant_id = ${T} and package_id = ${STEAM_100} and status = 'sold' limit 1`));
    const { decryptFromString } = await import("@rentweb/core");
    const soldCode = code ? decryptFromString(code.code_encrypted) : null;
    const a = await importStockCodes(tx, T, STEAM_100, ["QA-VERIFY-ADMIN06-1", ...(soldCode ? [soldCode] : [])], { actor });
    const b = await importStockCodes(tx, T, STEAM_100, ["qa-verify-admin06-1"], { actor });
    const [n] = rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from code_stock where tenant_id = ${T} and code_hash is null`));
    check("ADMIN-06", "re-import + sold code skipped", a.ok && a.value.imported === 1 && (!soldCode || a.value.existing.sold === 1) && b.ok && b.value.imported === 0 && b.value.existing.inStock === 1 && n!.n === 0, { first: a.ok && a.value, second: b.ok && b.value, nullHashes: n!.n });
    // ADMIN-07: a never-ordered stock package of the Steam game with 2 unsold codes → refused, codes intact
    const [tmp] = await tx.insert(gamePackages).values({ tenantId: T, gameId: STEAM_GAME, name: "QA verify ADMIN-07", price: 10000, fulfillment: "stock" }).returning({ id: gamePackages.id });
    await importStockCodes(tx, T, tmp!.id, ["QA-VERIFY-ADMIN07-1", "QA-VERIFY-ADMIN07-2"], { actor });
    const before = rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from code_stock where package_id = ${tmp!.id}`))[0]!.n;
    const d = await deletePackage(tx, T, tmp!.id, actor);
    const g = await (await import("../../../../packages/modules/topup/src/admin")).deleteGame(tx, T, STEAM_GAME, actor);
    const after = rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from code_stock where package_id = ${tmp!.id}`))[0]!.n;
    check("ADMIN-07", "delete package with 2 unsold codes refused", !d.ok && d.code === "has_stock" && d.error.includes("2 โค้ด") && before === 2 && after === 2, { d, before, after });
    check("ADMIN-07", "delete Steam game refused (orders / stock)", !g.ok, g);
    let fk = "none";
    try {
      await tx.execute(sql`savepoint fk`);
      await tx.execute(sql`delete from game_packages where id = ${tmp!.id}`);
    } catch (e) {
      fk = String((e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code ?? e).slice(0, 80);
      await tx.execute(sql`rollback to savepoint fk`);
    }
    check("ADMIN-07", "DB refuses a raw package delete (FK RESTRICT / orders)", fk !== "none", fk);
  });

  await withTenant(db, T, async (tx) => {
    // ADMIN-09: wallet_topup rows in the shared payments queue
    const q = await paymentsQueue(tx, T, { tab: "paid", refType: "wallet_topup", perPage: 10 });
    const bad = q.rows.filter((r) => !r.refNumber?.startsWith("กระเป๋าเงิน") || !/^\/topup\/wallets\/[0-9a-f-]{36}$/.test(r.refHref ?? ""));
    check("ADMIN-09", `wallet_topup refs (${q.rows.length} rows)`, q.rows.length > 0 && bad.length === 0, q.rows.slice(0, 2).map((r) => ({ ref: r.refNumber, href: r.refHref })));
    // ADMIN-10: dashboard card == module header count
    const today = bangkokToday();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const { kpis } = await computeKpis(tx, { tenantId: T, modules: ["topup"], today, tomorrow, since7: new Date(Date.now() - 7 * 86_400_000), createdCutoff: new Date(0) });
    const head = await topupKpis(tx, T, today);
    const [all] = rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from topup_orders where tenant_id = ${T} and placed_at >= ${today.toISOString()}`));
    check("ADMIN-10", "dashboard topupsToday == header count", kpis.topupsToday === head.count, { dashboard: kpis.topupsToday, header: head.count, allRowsToday: all!.n });
  });
}

if (want("ui")) {
  const browser = await launch();
  const state = await stateFor(browser, "owner", OWNER.email, OWNER.password);
  const ctx = await newCtx(browser, { storageState: state });
  const page = await ctx.newPage();
  const shot = (n: string) => page.screenshot({ path: path.resolve(process.cwd(), "screenshots", `topup-admin-fix-${n}.png`), fullPage: false });
  try {
    const [manual] = await withTenant(db, T, async (tx) => rows<{ id: string; number: string }>(await tx.execute(sql`select id, number from topup_orders where tenant_id = ${T} and status = 'processing' and fulfillment = 'manual' order by placed_at limit 1`)));
    // ADMIN-02 / ADMIN-13: proof upload in the fulfil dialog
    await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${manual!.id}`);
    await page.getByRole("button", { name: "เติมสำเร็จ" }).first().click();
    await page.getByRole("dialog").waitFor();
    const img = page.locator('img[alt="หลักฐานการเติม"]');
    const tryFile = async (name: string, mimeType: string, buffer: Buffer) => {
      const toasts = await page.locator("[data-sonner-toast]").count();
      await page.locator("#proof-file").setInputFiles({ name, mimeType, buffer });
      await Promise.race([img.waitFor({ state: "visible", timeout: 30_000 }), page.locator("[data-sonner-toast]").nth(toasts).waitFor({ state: "visible", timeout: 30_000 })]).catch(() => {});
      const src = (await img.count()) ? await img.getAttribute("src") : null;
      const toast = (await page.locator("[data-sonner-toast]").count()) > toasts ? (await page.locator("[data-sonner-toast]").last().innerText()).replace(/\s+/g, " ") : null;
      return { src, toast };
    };
    const svg = await tryFile("proof.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    const html = await tryFile("proof.png", "image/png", Buffer.from("<!doctype html><script>alert(1)</script>"));
    const bogus = await tryFile("proof.gif", "image/gif", Buffer.from("GIF8-not-really"));
    const rejected = [svg, html, bogus].every((r) => !r.src && (r.toast ?? "").includes("รองรับเฉพาะไฟล์รูปภาพ"));
    check("ADMIN-02", "svg / html-as-png / bogus gif rejected", rejected, { svg, html, bogus });
    const real = await tryFile("real.png", "application/octet-stream", PNG);
    let fetched: { status: number; ct: string | null } | null = null;
    if (real.src) {
      const res = await page.request.get(real.src);
      fetched = { status: res.status(), ct: res.headers()["content-type"] ?? null };
    }
    check("ADMIN-02", "real PNG (declared octet-stream) stored as image/png", !!real.src && real.src.endsWith(".png") && fetched?.ct === "image/png", { real, fetched });
    check("ADMIN-13", "preview served from the storefront /uploads (not the admin host)", !!real.src && real.src.startsWith("http://localhost:3000/uploads/tenants/") && fetched?.status === 200, real.src);
    const store = real.src ? await hostGet("demo-topup.localhost:3000", new URL(real.src).pathname) : null;
    check("ADMIN-13", "same relative URL works on the tenant storefront host", store?.status === 200 && store.ct === "image/png", store);
    await shot("fulfil-dialog-1440");
    await page.keyboard.press("Escape");

    // game image upload preview (games/[id]?tab=info)
    await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/games/${STEAM_GAME}?tab=info`);
    await page.locator('[data-testid="g-image-file"]').setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: PNG });
    await page.waitForFunction(() => (document.querySelector("#g-image") as HTMLInputElement | null)?.value.startsWith("/uploads/"), null, { timeout: 30_000 }).catch(() => {});
    const val = await page.locator("#g-image").inputValue();
    const prev = await page.locator("#g-image").locator("xpath=ancestor::div[contains(@class,'items-start')][1]//img").first().getAttribute("src").catch(() => null);
    const okPrev = prev ? (await page.request.get(prev)).status() : 0;
    check("ADMIN-13", "game image stored relative, admin preview resolves", val.startsWith(`/uploads/tenants/${T}/games/`) && val.endsWith(".png") && okPrev === 200, { val, prev, okPrev });
    await page.locator('[data-testid="g-image-file"]').setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    const svgToast = page.locator("[data-sonner-toast]", { hasText: "รองรับเฉพาะไฟล์รูปภาพ" });
    await svgToast.first().waitFor({ timeout: 30_000 }).catch(() => {});
    const valAfter = await page.locator("#g-image").inputValue();
    check("ADMIN-02", "game image SVG rejected (value unchanged)", (await svgToast.count()) > 0 && valAfter === val, { toast: await svgToast.count(), valAfter });

    // ADMIN-12 / SERVICES-15: refund-pending order (failed + flagged)
    const [flagged] = await withTenant(db, T, async (tx) => rows<{ id: string; number: string }>(await tx.execute(sql`select id, number from topup_orders where tenant_id = ${T} and status = 'failed' and (supplier_response->>'refundRequired')::boolean order by placed_at desc limit 1`)));
    await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${flagged!.id}`);
    const refundBtn = page.getByRole("button", { name: "บันทึกว่าคืนเงินแล้ว" });
    const retry = page.getByRole("button", { name: "ลองใหม่" });
    check("ADMIN-12", `refund button primary on ${flagged!.number}`, (await refundBtn.count()) === 1, { refund: await refundBtn.count(), retry: await retry.count() });
    await shot("refund-pending-1440");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    const box = await refundBtn.boundingBox();
    check("ADMIN-12", "refund button ≥44px tall at 390", !!box && box.height >= 44 - 0.5, box);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("ADMIN-12", "no horizontal overflow at 390", overflow <= 0, overflow);
    await shot("refund-pending-390");

    // ADMIN-16: batch checkboxes at 390
    await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders?tab=manual`);
    const boxes = await page.locator("tbody label:has([role=checkbox]), label:has([aria-label='เลือกทั้งหมด'])").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check("ADMIN-16", `checkbox hit areas at 390 (${boxes.length})`, boxes.length > 0 && boxes.every(([w, h]) => w! >= 44 && h! >= 44), boxes);
    // the row checkbox toggles from the padded edge, not only the 20px box
    const first = page.locator("tbody label:has([role=checkbox])").first();
    await first.scrollIntoViewIfNeeded();
    const fb = await first.boundingBox();
    if (fb) await page.mouse.click(fb.x + 3, fb.y + 3);
    check("ADMIN-16", "click on the hit-area edge selects the row", (await page.locator("tbody [role=checkbox][data-state=checked]").count()) === 1, fb);
    await shot("queue-manual-390");

    // ADMIN-09: payments queue wallet_topup rows (desktop)
    await page.setViewportSize({ width: 1440, height: 900 });
    await stableGoto(page, `${ADMIN}/t/${SLUG}/payments?tab=paid&type=wallet_topup`);
    const links = await page.locator('a[href*="/topup/wallets/"]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute("href"), text: (e.textContent ?? "").trim() })));
    const refs = links.filter((l) => l.text.startsWith("กระเป๋าเงิน"));
    check("ADMIN-09", `payments queue links (${links.length})`, refs.length > 0 && refs.every((l) => /\/t\/demo-topup\/topup\/wallets\/[0-9a-f-]{36}$/.test(l.href ?? "")), refs.slice(0, 2));
    if (refs[0]) {
      const res = await page.request.get(`${ADMIN}${refs[0].href}`);
      check("ADMIN-09", "link opens the wallet ledger", res.status() === 200, res.status());
    }
    // ADMIN-10: dashboard card == header
    await stableGoto(page, `${ADMIN}/t/${SLUG}/dashboard`);
    const card = await page.getByText("รายการเติมวันนี้").first().locator("xpath=ancestor::*[self::div or self::section][1]/..").innerText().catch(() => "");
    await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders`);
    const header = await page.getByText(/รายการที่ชำระแล้ว/).first().innerText().catch(() => "");
    const n1 = card.match(/รายการเติมวันนี้\s*([\d,]+)/)?.[1];
    const n2 = header.match(/([\d,]+)\s*รายการที่ชำระแล้ว/)?.[1];
    check("ADMIN-10", "dashboard card == /topup/orders header", !!n1 && n1 === n2, { card: card.replace(/\s+/g, " ").slice(0, 80), header });
  } finally {
    await ctx.close();
    await browser.close();
  }
}
if (want("form")) {
  // services hand-off (STOREFRONT-12 keys in the game field editor): the editor renders at 1440 / 390 without overflow
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await stateFor(browser, "owner", OWNER.email, OWNER.password) });
  const page = await ctx.newPage();
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/games/${STEAM_GAME}?tab=info`);
      const pat = await page.locator("[id^=f-pat-]").count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check("FORM", `game field editor at ${width}: format inputs + no overflow`, pat > 0 && overflow <= 0, { pat, overflow });
      if (width === 390) {
        await page.locator("[id^=f-pat-]").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.resolve(process.cwd(), "screenshots", "topup-admin-fix-field-editor-390.png") });
      }
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
