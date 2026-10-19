import path from "node:path";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { sql, tenantMembers } from "@rentweb/db";
import { decryptFromString } from "@rentweb/core";
import { ADMIN, OWNER, PNG, RUN, SLUG, STORE, TENANT, actionId, adminDb, anyToast, callAction, expect, finding, here, launch, newCtx, newPage, otpLogin, out, placeOrder, rowsOf, shot, stateFor, type Browser, type P } from "./topup_admin-lib";
import { stableGoto } from "./fixes/_dev-stable";

/**
 * topup_admin bughunt probes (QA only). One browser context per probe; findings are appended to
 * topup_admin.jsonl the moment they are confirmed.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/topup_admin-probes.ts --only setup,p1
 */
const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? process.argv[process.argv.indexOf("--only") + 1] ?? "").split(",").filter(Boolean);
const want = (k: string) => only.length === 0 || only.includes(k);
const FIX = path.join(here, "topup_admin-fixture.json");
// verifier 2026-10-19: RoV player IDs must now match the field pattern (digits only, 5–20) (STOREFRONT-12) — base36 RUN has letters
const RUN_NUM = String(Date.now()).slice(-6);
const PROG = path.join(here, "topup_admin-progress.md");
type Fixture = { run: string; phone: string; customerId: string; walletId: string; orders: Record<string, { id: string; number: string; paymentId: string | null }>; steam?: { gameId: string; stockPkgId: string }; staff?: { email: string; userId: string } };
const fx = (): Fixture => JSON.parse(readFileSync(FIX, "utf8"));
const saveFx = (f: Fixture) => writeFileSync(FIX, JSON.stringify(f, null, 2));
function tick(label: string) {
  const s = readFileSync(PROG, "utf8");
  writeFileSync(PROG, s.replace(`- [ ] ${label}`, `- [x] ${label}`));
}
const q = async <T = Record<string, unknown>>(s: ReturnType<typeof sql>): Promise<T[]> => rowsOf<T>(await adminDb().execute(s));
const orderRow = (id: string) => q<{ status: string; payment_id: string | null; supplier_response: Record<string, unknown> | null; failure_reason: string | null; paid_at: string | null; number: string }>(sql`select number, status, payment_id, supplier_response, failure_reason, paid_at from topup_orders where tenant_id = ${TENANT} and id = ${id}`).then((r) => r[0]);
const payRow = (id: string) => q<{ status: string; failure_reason: string | null; paid_at: string | null; provider_payload: Record<string, unknown> | null; expires_at: string | null; verified_by: string | null }>(sql`select status, failure_reason, paid_at, provider_payload, expires_at, verified_by from payments where tenant_id = ${TENANT} and id = ${id}`).then((r) => r[0]);
const eventsFor = (pid: string) => q<{ type: string }>(sql`select type from events_outbox where tenant_id = ${TENANT} and payload->>'paymentId' = ${pid} order by created_at`).then((r) => r.map((x) => x.type));

/** Parses a server-action RSC response into the action's return value (first object with an `ok` key). */
function parseAction(text: string): any {
  for (const line of text.split("\n")) {
    const m = line.match(/^\d+:(\{.*\})$/);
    if (!m) continue;
    try {
      const v = JSON.parse(m[1]!);
      if (v && typeof v === "object" && "ok" in v) return v;
    } catch {
      /* not json */
    }
  }
  return { raw: text.slice(0, 400) };
}
async function act(page: P, pathname: string, name: string, file: string, args: unknown[]) {
  const id = actionId(name, file);
  if (!id) throw new Error(`no action id for ${name} (${file}) — visit the page once and rerun topup_admin-actionids.mjs`);
  const r = await callAction(page, pathname, id, args);
  const v = parseAction(r.text);
  out(`${name} → HTTP ${r.status}`, v);
  return { status: r.status, value: v, text: r.text };
}


/** Append-or-replace a finding row by id (static rows were logged first; dynamic runs refresh evidence/actual). */
function upsert(f: Parameters<typeof finding>[0]) {
  const file = path.join(here, "topup_admin.jsonl");
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  const i = lines.findIndex((l) => {
    try {
      return JSON.parse(l).id === f.id;
    } catch {
      return false;
    }
  });
  if (i < 0) return finding(f);
  const prev = JSON.parse(lines[i]!);
  lines[i] = JSON.stringify({ ...prev, ...f, evidence: `${f.evidence} | static: ${prev.evidence}` });
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`!! ${f.id} [${f.severity}] updated with dynamic evidence`);
}

const customerStateFile = path.join(here, "topup_admin-state-customer.json");
async function adminPage(browser: Browser, opts: Parameters<typeof newCtx>[1] = {}) {
  const state = await stateFor(browser, "owner", OWNER.email, OWNER.password);
  const ctx = await newCtx(browser, { storageState: state, ...opts });
  const page = await newPage(ctx);
  return { ctx, page };
}
async function customerPage(browser: Browser) {
  const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(customerStateFile, "utf8")) });
  const page = await newPage(ctx);
  return { ctx, page };
}

/* ───────────────────────────── setup ───────────────────────────── */
async function setup(browser: Browser) {
  const phone = `086${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const ctx = await newCtx(browser);
  const page = await newPage(ctx);
  await otpLogin(page, phone, `คิวเอ แอดมิน2 ${RUN}`);
  writeFileSync(customerStateFile, JSON.stringify(await ctx.storageState()));
  const [cust] = await q<{ id: string }>(sql`select id from customers where tenant_id = ${TENANT} and phone like ${"%" + phone.slice(1)} order by created_at desc limit 1`);
  if (!cust) throw new Error("customer row not found");
  let [w] = await q<{ id: string }>(sql`select id from wallets where tenant_id = ${TENANT} and customer_id = ${cust.id}`);
  if (!w) {
    await page.goto(`${STORE}/wallet`, { waitUntil: "networkidle" });
    [w] = await q<{ id: string }>(sql`select id from wallets where tenant_id = ${TENANT} and customer_id = ${cust.id}`);
  }
  if (!w) throw new Error("wallet row not found");
  out("customer", { phone, customerId: cust.id, walletId: w.id });
  // credit ฿1,000 through the admin action (also verifies callAction works)
  const a = await adminPage(browser);
  await stableGoto(a.page, `${ADMIN}/t/${SLUG}/topup/wallets/${w.id}`);
  const credit = await act(a.page, `/t/${SLUG}/topup/wallets/${w.id}`, "adjustWalletAction", "topup/wallets/actions.ts", [SLUG, w.id, { type: "credit", amount: "1000", reason: "QA fixture topup_admin" }, `qa-${RUN}-${Date.now().toString(36)}`]);
  if (!credit.value?.ok) throw new Error(`credit failed: ${JSON.stringify(credit.value)}`);
  await a.ctx.close();
  const orders: Fixture["orders"] = {};
  const put = async (key: string, number: string) => {
    const [o] = await q<{ id: string; payment_id: string | null }>(sql`select id, payment_id from topup_orders where tenant_id = ${TENANT} and number = ${number}`);
    orders[key] = { id: o!.id, number, paymentId: o!.payment_id };
  };
  await put("O1", await placeOrder(page, `77${RUN_NUM}01`, /120 คูปอง/, "PromptPay QR"));
  await put("O2", await placeOrder(page, `77${RUN_NUM}02`, /120 คูปอง/, "โอนเงิน"));
  await put("O3", await placeOrder(page, `77${RUN_NUM}03`, /120 คูปอง/, "กระเป๋าเงินในเว็บ"));
  await put("O4", await placeOrder(page, `77${RUN_NUM}04`, /120 คูปอง/, "กระเป๋าเงินในเว็บ"));
  await ctx.close();
  const [g] = await q<{ id: string }>(sql`select id from games where tenant_id = ${TENANT} and slug = 'steam-wallet'`);
  const [sp] = await q<{ id: string }>(sql`select id from game_packages where tenant_id = ${TENANT} and game_id = ${g!.id} and fulfillment = 'stock' order by price asc limit 1`);
  const f: Fixture = { run: RUN, phone, customerId: cust.id, walletId: w.id, orders, steam: { gameId: g!.id, stockPkgId: sp!.id } };
  saveFx(f);
  out("fixture", f);
  tick("setup fixture (customer + wallet + orders O1..O3)");
}

/* ───────────────────────────── p1 upload sniff ───────────────────────────── */
async function p1(browser: Browser) {
  const f = fx();
  const o = f.orders.O3!;
  const { ctx, page } = await adminPage(browser);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${o.id}`);
  await page.getByRole("button", { name: "เติมสำเร็จ" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const results: Array<{ name: string; accepted: boolean; url: string | null; fetched?: { status: number; ct: string | null; body: string }; toast?: string }> = [];
  const tryFile = async (name: string, mimeType: string, buffer: Buffer) => {
    await page.locator("#proof-file").setInputFiles({ name, mimeType, buffer });
    const img = page.locator('img[alt="หลักฐานการเติม"]');
    const t = page.locator("[data-sonner-toast]").last();
    await Promise.race([img.waitFor({ state: "visible", timeout: 30_000 }), t.waitFor({ state: "visible", timeout: 30_000 })]).catch(() => {});
    const url = (await img.count()) ? await img.getAttribute("src") : null;
    const toast = (await t.count()) ? (await t.innerText()).replace(/\s+/g, " ").trim() : undefined;
    const r: (typeof results)[number] = { name, accepted: !!url, url, toast };
    if (url) {
      const res = await page.request.get(url);
      r.fetched = { status: res.status(), ct: res.headers()["content-type"] ?? null, body: (await res.text()).slice(0, 120) };
      // reset for the next file
      const del = page.getByRole("button", { name: "ลบรูป" });
      if (await del.count()) await del.click();
    }
    results.push(r);
    out(`upload ${name}`, r);
  };
  await tryFile("proof.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><script>alert(document.domain)</script><rect width="40" height="40" fill="red"/></svg>'));
  await tryFile("proof.png", "image/png", Buffer.from("<!doctype html><html><body><script>alert(1)</script>not a png</body></html>"));
  await tryFile("proof.gif", "image/gif", Buffer.from("GIF89a-not-really"));
  await page.keyboard.press("Escape");
  await ctx.close();
  const svg = results[0]!;
  const html = results[1]!;
  if (svg.accepted || html.accepted) {
    upsert({
      id: "ADMIN-02",
      severity: "major",
      confidence: "confirmed",
      area: "admin",
      title: "Proof-of-delivery / game image upload trusts the client's file.type (no sniffImage): SVG and HTML renamed .png are stored and served as images",
      where: "apps/admin/src/app/t/[slug]/topup/_shared.ts:20-26 storeImage (IMAGE_MIMES.has(file.type), content type = file.type); used by topup/orders/actions.ts:105 uploadProofAction and topup/games/actions.ts:53 uploadGameImageAction. Reference: products/actions.ts:85, events/actions.ts:126, rental/units/actions.ts:89 all sniffImage(buf).",
      steps: `Admin → /t/demo-topup/topup/orders/${o.number} → เติมสำเร็จ → อัปโหลดรูป with (a) proof.svg type image/svg+xml containing <script>, (b) proof.png type image/png whose bytes are an HTML document, (c) proof.gif with bogus bytes.`,
      expected: "Rejected like every other module ('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WebP, GIF, AVIF' decided by magic bytes); stored extension/content type derived from the sniffed kind.",
      actual: `(a) svg accepted=${svg.accepted} url=${svg.url} fetched=${JSON.stringify(svg.fetched)}; (b) html-as-png accepted=${html.accepted} url=${html.url} fetched=${JSON.stringify(html.fetched)}; (c) gif accepted=${results[2]!.accepted}. The URL is then saved on the order (proofImage) and emitted in topup.fulfilled.`,
      evidence: JSON.stringify(results),
      suggestedFix: "In storeImage: const buf = Buffer.from(await file.arrayBuffer()); const kind = sniffImage(buf); if (!kind) return error; put(objectKey(tenantId, folder, `x.${kind.ext}`), buf, kind.mime). Also validate fulfillSchema.proofImage is a URL under the tenant's upload prefix rather than any string.",
    });
  }
  tick("p1 proof upload sniffing (SVG / HTML renamed .png)");
}

/* ───────────────────────────── p2 fail unpaid → late slip ───────────────────────────── */
async function p2(browser: Browser) {
  const f = fx();
  const o = f.orders.O1!;
  const { ctx, page } = await adminPage(browser);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${o.id}`);
  const failBtnVisible = await page.getByRole("button", { name: "เติมไม่สำเร็จ" }).count();
  out("UI shows เติมไม่สำเร็จ on pending_payment order", failBtnVisible);
  const before = { order: await orderRow(o.id), payment: await payRow(o.paymentId!) };
  out("before", { order: before.order?.status, payment: before.payment?.status });
  const r = before.order?.status === "pending_payment" ? await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "failOrderAction", "topup/orders/actions.ts", [SLUG, o.id, "ทดสอบ QA: fail while unpaid"]) : { status: 0, value: { ok: true, note: "already failed in an earlier run" }, text: "" };
  const after1 = { order: await orderRow(o.id), payment: await payRow(o.paymentId!) };
  out("after fail", { order: after1.order?.status, payment: after1.payment?.status, refundRequired: after1.order?.supplier_response?.refundRequired });
  await ctx.close();

  // the customer now pays (slip upload from the browser so *.localhost resolves and the session cookie = strong proof → dev auto-approve)
  const c = await customerPage(browser);
  await c.page.goto(`${STORE}/topup/${o.number}`, { waitUntil: "networkidle", timeout: 120_000 });
  const storefrontStatus = (await c.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300);
  out("storefront order page", storefrontStatus);
  const up = await c.page.evaluate(
    async ({ pid, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const fd = new FormData();
      fd.append("slip", new File([bytes], "slip.png", { type: "image/png" }));
      const res = await fetch(`/api/payments/${pid}/slip`, { method: "POST", body: fd });
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    },
    { pid: o.paymentId!, b64: PNG.toString("base64") },
  );
  const slip = { status: () => up.status };
  const slipBody = up.body;
  out("slip upload", up);
  await c.ctx.close();
  const after2 = { order: await orderRow(o.id), payment: await payRow(o.paymentId!), events: await eventsFor(o.paymentId!) };
  out("after slip", { order: after2.order?.status, payment: after2.payment?.status, paidAt: after2.payment?.paid_at, providerPayload: after2.payment?.provider_payload, events: after2.events });

  if (r.value?.ok && after1.order?.status === "failed" && ["pending", "pending_verification"].includes(after1.payment?.status ?? "")) {
    upsert({
      id: "ADMIN-03",
      severity: "critical",
      confidence: "confirmed",
      area: "admin",
      title: "failOrderAction accepts an UNPAID order: it becomes เติมไม่สำเร็จ while its PromptPay payment stays open, and money paid afterwards is accepted with no fulfilment and no refund flag",
      where: "packages/modules/topup/src/admin/orders.ts:339-359 adminFailOrder (only blocks fulfilled/failed/refunded/cancelled; pending_payment passes), apps/admin/src/app/t/[slug]/topup/orders/actions.ts:36 failOrderAction; the UI hides the button (order-actions.tsx:78) but the FailDialog copy even has an 'unpaid' branch (order-actions.tsx:200).",
      steps: `1) Order ${o.number} pending_payment with PromptPay payment ${o.paymentId}. 2) POST server action failOrderAction(slug, orderId, reason) (any manager; UI button hidden). 3) Customer opens /topup/${o.number} and uploads a slip (strong proof → auto-approve).`,
      expected: "An unpaid order cannot be 'failed' — only cancelled through adminCancelOrder (which must void the payment with cancelPayment). If money arrives for a closed order the paid handler must return refundRequired(...) so the payment is flagged ต้องคืนเงิน and the owner notified.",
      actual: `failOrderAction → ${JSON.stringify(r.value)}; order ${after1.order?.status}, payment still ${after1.payment?.status}. Slip upload → HTTP ${slip.status()} ${slipBody.slice(0, 120)}; afterwards payment=${after2.payment?.status} paid_at=${after2.payment?.paid_at} provider_payload=${JSON.stringify(after2.payment?.provider_payload)} failure_reason=${after2.payment?.failure_reason}; order still ${after2.order?.status} (no refundRequired in supplier_response: ${JSON.stringify(after2.order?.supplier_response?.refundRequired ?? null)}); outbox events for the payment: ${after2.events.join(", ")} — no payment.refund_required.`,
      evidence: `topup_admin-probes.ts p2 run ${f.run}: before order=${before.order?.status}/payment=${before.payment?.status}; after fail order=${after1.order?.status}/payment=${after1.payment?.status}; after slip payment=${after2.payment?.status} order=${after2.order?.status} events=[${after2.events.join(",")}]`,
      suggestedFix: "adminFailOrder: return fail(...) when order.status === 'pending_payment' (tell the admin to use ยกเลิกรายการ). services/orders.ts onTopupPaid: when order.status !== 'pending_payment' return refundRequired('รายการปิดแล้ว (' + order.status + ')') instead of silently returning, and/or registerPaymentTargetCheck('topup') treating failed as closed.",
    });
  }
  tick("p2 fail unpaid order → late slip auto-approve (money w/o fulfilment)");
}

/* ───────────────────────────── p3 cancel raw UPDATE / reject terminal ───────────────────────────── */
async function p3(browser: Browser) {
  const f = fx();
  const o = f.orders.O2!;
  const { ctx, page } = await adminPage(browser);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${o.id}`);
  const cancel = await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "cancelOrderAction", "topup/orders/actions.ts", [SLUG, o.id, "ทดสอบ QA cancel"]);
  const pay1 = await payRow(o.paymentId!);
  const ev1 = await eventsFor(o.paymentId!);
  const ordEv = await q<{ type: string }>(sql`select type from events_outbox where tenant_id = ${TENANT} and payload->>'orderId' = ${o.id} order by created_at`).then((r) => r.map((x) => x.type));
  out("after cancel", { payment: pay1?.status, failure_reason: pay1?.failure_reason, paymentEvents: ev1, orderEvents: ordEv });
  if (cancel.value?.ok && pay1?.status === "cancelled" && !ev1.includes("payment.cancelled")) {
    upsert({
      id: "ADMIN-04",
      severity: "minor",
      confidence: "confirmed",
      area: "admin",
      title: "adminCancelOrder voids the payment with a raw UPDATE payments instead of cancelPayment(): no payment.cancelled event / audit, and failed|expired payments are flipped to cancelled against the state machine",
      where: "packages/modules/topup/src/admin/orders.ts:399-404 (tx.update(payments).set({ status: 'cancelled' }) … status in pending, pending_verification, failed, expired); contract payments-api.md §3.2 last bullet ('not a raw UPDATE payments').",
      steps: `Admin → ยกเลิกรายการ on unpaid order ${o.number} (cancelOrderAction).`,
      expected: "cancelPayment(tx, tenantId, paymentId, reason, { runHandler: false }) → payment cancelled + events_outbox payment.cancelled {paymentId, refType, refId, amount, reason}; expired stays expired.",
      actual: `payments.status=${pay1?.status}, failure_reason=${pay1?.failure_reason}; events_outbox for paymentId ${o.paymentId}: [${ev1.join(", ")}] (only the creation event) — no payment.cancelled; order events: [${ordEv.join(", ")}].`,
      evidence: `topup_admin-probes.ts p3 run ${f.run}: cancelOrderAction → ${JSON.stringify(cancel.value)}; payment events after cancel = ${JSON.stringify(ev1)}`,
      suggestedFix: "Replace the raw update with await cancelPayment(tx, tenantId, order.paymentId, reason ?? 'ยกเลิกโดยแอดมิน', { runHandler: false }) guarded by isOpenPaymentStatus/failed (catch PaymentStateError for already-terminal rows).",
    });
  }
  // reject / approve on the now-cancelled payment
  const reject = await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "rejectSlipAction", "topup/orders/actions.ts", [SLUG, o.id, "สลิปไม่ถูกต้อง"]);
  const approve = await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "approveSlipAction", "topup/orders/actions.ts", [SLUG, o.id]);
  const pay2 = await payRow(o.paymentId!);
  out("after reject/approve on cancelled payment", { payment: pay2?.status, rejectText: reject.text.slice(0, 300) });
  const rejectThrew = !reject.value?.ok && !("error" in (reject.value ?? {})) ;
  const rejectMsg = reject.text.match(/"message":"([^"]{0,200})"/)?.[1] ?? reject.text.match(/payment_state|PaymentStateError|markFailed[^"\n]{0,120}/)?.[0] ?? null;
  if (rejectThrew || /payment_state|PaymentStateError|Error:/.test(reject.text)) {
    upsert({
      id: "ADMIN-05",
      severity: "minor",
      confidence: "confirmed",
      area: "admin",
      title: "rejectSlipAction only guards status=paid: on a cancelled/refunded payment markFailed throws PaymentStateError which escapes the action as an unhandled error instead of a friendly result",
      where: "packages/modules/topup/src/admin/orders.ts:425-435 adminRejectSlip (if payment.status === 'paid' … else markFailed) vs adminApproveSlip:418 which whitelists states; contract payments-api.md §1 (markFailed from refunded/cancelled = error).",
      steps: `rejectSlipAction(slug, ${o.number}, reason) after the order/payment was cancelled (reachable through the shared /payments queue history or a stale tab).`,
      expected: "{ ok: false, error: 'รายการชำระเงินนี้ปิดแล้ว' } like approveSlipAction's bad_status branch.",
      actual: `HTTP ${reject.status}; RSC payload contains an error instead of a FormResult: ${rejectMsg ?? reject.text.slice(0, 200).replace(/\s+/g, " ")}; approveSlipAction on the same payment correctly returns ${JSON.stringify(approve.value)}. payment stays ${pay2?.status}.`,
      evidence: `topup_admin-probes.ts p3 run ${f.run}: reject → ${reject.text.slice(0, 300).replace(/\s+/g, " ")}`,
      suggestedFix: "if (!['pending','pending_verification','expired'].includes(payment.status)) return fail('รายการชำระเงินนี้ปิดแล้ว', 'bad_status'); and wrap markFailed in try/catch isPaymentStateError → fail(...).",
    });
  }
  await ctx.close();
  tick("p3 cancel = raw UPDATE payments; reject/approve on terminal payment");
}

/* ───────────────────────────── p4 stock duplicate import + delete cascade ───────────────────────────── */
async function p4(browser: Browser) {
  const f = fx();
  const { gameId, stockPkgId } = f.steam!;
  const { ctx, page } = await adminPage(browser);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/games/${gameId}?tab=stock&stock=${stockPkgId}`);
  const code = `QA-DUP-${f.run.toUpperCase()}-AAAA-BBBB`;
  const i1 = await act(page, `/t/${SLUG}/topup/games/${gameId}`, "importStockAction", "topup/games/actions.ts", [SLUG, gameId, stockPkgId, { codes: code }]);
  const i2 = await act(page, `/t/${SLUG}/topup/games/${gameId}`, "importStockAction", "topup/games/actions.ts", [SLUG, gameId, stockPkgId, { codes: `${code}\n${code}` }]);
  const rows = await q<{ id: string; code_encrypted: string; status: string }>(sql`select id, code_encrypted, status from code_stock where tenant_id = ${TENANT} and package_id = ${stockPkgId} and created_at > now() - interval '3 minutes' order by created_at`);
  const plain = rows.map((r) => ({ id: r.id, status: r.status, code: (() => { try { return decryptFromString(r.code_encrypted); } catch { return "?"; } })() }));
  const dupes = plain.filter((p) => p.code === code);
  out("stock rows for the QA code", dupes);
  // cleanup: void them
  for (const d of dupes) await act(page, `/t/${SLUG}/topup/games/${gameId}`, "voidStockAction", "topup/games/actions.ts", [SLUG, gameId, d.id]);
  if (dupes.length >= 2) {
    upsert({
      id: "ADMIN-06",
      severity: "critical",
      confidence: "confirmed",
      area: "admin",
      title: "Stock import only de-duplicates inside one paste: importing the same code list again (or a code already in stock / already sold) inserts duplicate available codes, so two orders get the same code",
      where: "packages/modules/topup/src/admin/catalog.ts:332-360 importStockCodes (Set `seen` is per call; no lookup of existing code_stock rows; encryption is randomised so the DB cannot enforce uniqueness either); stock-panel import dialog has no warning.",
      steps: `Games → Steam Wallet → สต็อกโค้ด → นำเข้าโค้ด with '${code}' → นำเข้าโค้ด again with the same line.`,
      expected: "Second import reports the code as duplicate (already in stock / already sold) and imports 0; available count unchanged.",
      actual: `1st import → ${JSON.stringify(i1.value)}; 2nd import of the same code → ${JSON.stringify(i2.value)} (counted as imported, only the in-paste repeat was dropped). code_stock now holds ${dupes.length} rows whose decrypted value is '${code}' (ids ${dupes.map((d) => d.id.slice(0, 8)).join(", ")}), both status=available → fulfilOrder would hand the same code to two customers and the second one is already redeemed.`,
      evidence: `topup_admin-probes.ts p4 run ${f.run}: decrypted code_stock rows = ${JSON.stringify(dupes)}`,
      suggestedFix: "Store a deterministic HMAC/hash of the plaintext (code_hash) with a unique index per (tenant_id, package_id or tenant-wide) and skip/flag matches on import; until then decrypt existing rows of the package in importStockCodes and drop codes that already exist (any status) reporting them as duplicates.",
    });
  }

  // delete-cascade probe: temp stock package → import 2 codes → delete package
  const create = await act(page, `/t/${SLUG}/topup/games/${gameId}`, "savePackageAction", "topup/games/actions.ts", [SLUG, gameId, { id: null, name: `QA tmp stock ${f.run}`, description: null, price: "10", costPrice: "", tierVip: "", tierAgent: "", fulfillment: "stock", supplierId: null, supplierProductCode: null, estimatedMinutes: 0, badge: null, active: false, sort: 999 }]);
  const tmpId: string | undefined = create.value?.data?.id;
  if (tmpId) {
    const imp = await act(page, `/t/${SLUG}/topup/games/${gameId}`, "importStockAction", "topup/games/actions.ts", [SLUG, gameId, tmpId, { codes: `QA-TMP-${f.run}-1\nQA-TMP-${f.run}-2` }]);
    const [n1] = await q<{ n: number }>(sql`select count(*)::int n from code_stock where tenant_id = ${TENANT} and package_id = ${tmpId}`);
    const del = await act(page, `/t/${SLUG}/topup/games/${gameId}`, "deletePackageAction", "topup/games/actions.ts", [SLUG, gameId, tmpId]);
    const [n2] = await q<{ n: number }>(sql`select count(*)::int n from code_stock where tenant_id = ${TENANT} and package_id = ${tmpId}`);
    const [pk] = await q<{ n: number }>(sql`select count(*)::int n from game_packages where tenant_id = ${TENANT} and id = ${tmpId}`);
    out("delete cascade", { imported: imp.value, before: n1?.n, deleted: del.value, after: n2?.n, pkgRows: pk?.n });
    if (del.value?.ok && (n1?.n ?? 0) >= 2 && (n2?.n ?? 0) === 0) {
      upsert({
        id: "ADMIN-07",
        severity: "critical",
        confidence: "confirmed",
        area: "admin",
        title: "Deleting a package (or its game) with unsold code stock succeeds and the FK cascade silently destroys the encrypted codes — paid inventory lost with no warning",
        where: "packages/modules/topup/src/admin/catalog.ts:265-271 deletePackage and :204-210 deleteGame only count topup_orders; packages/db/src/schema/topup.ts:89 code_stock.package_id ON DELETE CASCADE (:62 game_packages.game_id cascade too); confirm copy packages-manager.tsx:190 / games/[id]/page.tsx:86 does not mention stock.",
        steps: `Games → Steam Wallet → add stock package 'QA tmp stock ${f.run}' → import 2 codes → ลบแพ็กเกจ.`,
        expected: "Refused while available/reserved codes exist ('ยังมีโค้ดในสต็อก N รายการ — void/export ก่อน') or at least a confirm that names the number of codes that will be destroyed.",
        actual: `deletePackageAction → ${JSON.stringify(del.value)}; code_stock rows for the package: ${n1?.n} before → ${n2?.n} after (package rows ${pk?.n}). No audit of the destroyed codes.`,
        evidence: `topup_admin-probes.ts p4 run ${f.run}: import=${JSON.stringify(imp.value)} before=${n1?.n} after=${n2?.n}`,
        suggestedFix: "In deletePackage/deleteGame count code_stock where status in ('available','reserved') and fail('has_stock'); surface the count in the ConfirmButton description.",
      });
    }
  } else {
    out("tmp package not created", create.value);
  }
  await ctx.close();
  tick("p4 stock: duplicate import across batches; delete package/game cascades unsold codes");
}

/* ───────────────────────────── p5 freeze blocks storefront ───────────────────────────── */
async function p5(browser: Browser) {
  const f = fx();
  const a = await adminPage(browser);
  await stableGoto(a.page, `${ADMIN}/t/${SLUG}/topup/wallets/${f.walletId}`);
  const fr = await act(a.page, `/t/${SLUG}/topup/wallets/${f.walletId}`, "setWalletFrozenAction", "topup/wallets/actions.ts", [SLUG, f.walletId, true]);
  await a.ctx.close();
  if (!fr.value?.ok) throw new Error("freeze failed");
  const c = await customerPage(browser);
  const page = c.page;
  await page.goto(`${STORE}/wallet`, { waitUntil: "networkidle", timeout: 120_000 });
  const walletText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const walletMentionsFrozen = /ระงับ/.test(walletText);
  await page.goto(`${STORE}/games/rov`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("#pf-uid").fill(`77${f.run}05`);
  await page.getByRole("radio", { name: /120 คูปอง/ }).click();
  await page.locator("label").filter({ hasText: "กระเป๋าเงินในเว็บ" }).first().click();
  const btn = page.locator('button[type="submit"]:visible').filter({ hasText: "เติมเลย" }).first();
  const enabled = await btn.isEnabled();
  let outcome = "";
  if (enabled) {
    await btn.click();
    await page.waitForTimeout(6000);
    outcome = /\/topup\/TP-/.test(page.url()) ? `ORDER PLACED ${page.url()}` : (await page.locator('[role="alert"], [data-sonner-toast], .text-destructive, [aria-live]').allInnerTexts()).join(" | ").replace(/\s+/g, " ").trim();
  } else {
    outcome = `button disabled; form text: ${(await page.locator("form").first().innerText()).replace(/\s+/g, " ").slice(0, 300)}`;
  }
  out("frozen purchase attempt", { walletMentionsFrozen, enabled, outcome });
  const [w] = await q<{ balance: number; frozen: boolean }>(sql`select balance, frozen from wallets where id = ${f.walletId}`);
  const placed = await q<{ number: string; status: string }>(sql`select number, status from topup_orders where tenant_id = ${TENANT} and customer_id = ${f.customerId} and player_fields->>'uid' = ${`77${f.run}05`}`);
  out("db after attempt", { wallet: w, placed });
  await c.ctx.close();
  const a2 = await adminPage(browser);
  await stableGoto(a2.page, `${ADMIN}/t/${SLUG}/topup/wallets/${f.walletId}`);
  await act(a2.page, `/t/${SLUG}/topup/wallets/${f.walletId}`, "setWalletFrozenAction", "topup/wallets/actions.ts", [SLUG, f.walletId, false]);
  await a2.ctx.close();
  if (placed.length || /ORDER PLACED/.test(outcome)) {
    upsert({ id: "ADMIN-08", severity: "critical", confidence: "confirmed", area: "services", title: "Frozen wallet can still be spent on the storefront", where: "packages/modules/topup/src/services/wallet.ts debitWallet / orders.ts createTopupOrder", steps: "Freeze wallet in admin → storefront wallet purchase", expected: "Refused with 'กระเป๋าเงินถูกระงับชั่วคราว'", actual: outcome, evidence: JSON.stringify({ w, placed }) });
  } else if (!/ระงับ/.test(outcome)) {
    upsert({ id: "ADMIN-08", severity: "minor", confidence: "confirmed", area: "storefront", title: "Frozen wallet: purchase is blocked but the storefront message does not tell the customer the wallet is suspended", where: "packages/modules/topup/src/components/topup-form.tsx / labels.ts:63 frozen label unused on this path", steps: "Freeze wallet in admin → storefront /games/rov → pay with กระเป๋าเงินในเว็บ", expected: "'กระเป๋าเงินถูกระงับชั่วคราว กรุณาติดต่อแอดมิน' shown inline; /wallet shows a frozen notice", actual: `outcome: ${outcome || "(no message)"}; /wallet mentions ระงับ: ${walletMentionsFrozen}`, evidence: JSON.stringify({ outcome, walletMentionsFrozen }) });
  }
  tick("p5 freeze blocks storefront spending");
}

/* ───────────────────────────── p6 shared payments queue ───────────────────────────── */
async function p6(browser: Browser) {
  const { ctx, page } = await adminPage(browser);
  const base = `${ADMIN}/t/${SLUG}/payments`;
  const grab = async (url: string) => {
    await stableGoto(page, url);
    const opts = await page.locator('select[name="type"] option').allInnerTexts();
    const rows = await page.locator("article").evaluateAll((els) =>
      els.slice(0, 5).map((el) => {
        const a = el.querySelector("p a") as HTMLAnchorElement | null;
        const open = [...el.querySelectorAll("a")].find((x) => /เปิดรายการ/.test(x.textContent ?? "")) as HTMLAnchorElement | undefined;
        return { ref: (a?.textContent ?? el.querySelector("p span.font-medium")?.textContent ?? "").trim(), href: a?.getAttribute("href") ?? null, openHref: open?.getAttribute("href") ?? null, badges: [...el.querySelectorAll("span")].map((s) => s.textContent?.trim()).filter((t) => t && t.length < 25).slice(0, 6) };
      }),
    );
    const total = (await page.locator("main").innerText()).match(/ทั้งหมด\s*([\d,]+)/)?.[1] ?? null;
    return { opts, rows, total, errors: page.__errors.slice(0, 3), bad: page.__bad.slice(0, 3) };
  };
  const topup = await grab(`${base}?tab=paid&type=topup`);
  out("paid/topup", topup);
  const wt = await grab(`${base}?tab=paid&type=wallet_topup`);
  out("paid/wallet_topup", wt);
  const verify = await grab(`${base}?type=topup`);
  out("pending_verification/topup", verify);
  // follow the first topup link
  let follow: { href: string | null; status: number | null; url: string; h1: string } | null = null;
  if (topup.rows[0]?.href) {
    const res = await page.goto(`${ADMIN}${topup.rows[0].href}`, { waitUntil: "domcontentloaded" });
    follow = { href: topup.rows[0].href, status: res?.status() ?? null, url: page.url(), h1: (await page.locator("h1").first().innerText().catch(() => "")).trim() };
    out("follow topup link", follow);
  }
  let followW: { href: string | null; status: number | null; url: string; h1: string } | null = null;
  if (wt.rows[0]?.href) {
    const res = await page.goto(`${ADMIN}${wt.rows[0].href}`, { waitUntil: "domcontentloaded" });
    followW = { href: wt.rows[0].href, status: res?.status() ?? null, url: page.url(), h1: (await page.locator("h1").first().innerText().catch(() => "")).trim() };
    out("follow wallet_topup link", followW);
  }
  await ctx.close();
  const uuidish = (s: string) => /^[0-9a-f]{8}$/.test(s);
  if (wt.rows.length && (wt.rows.every((r) => uuidish(r.ref)) || wt.rows.every((r) => r.href === `/t/${SLUG}/topup/wallets`))) {
    upsert({
      id: "ADMIN-09",
      severity: "minor",
      confidence: "confirmed",
      area: "admin",
      title: "Shared /payments queue: wallet top-up payments show a truncated UUID instead of the customer / wallet and 'เปิดรายการ' links to the wallet LIST, not the wallet",
      where: "packages/modules/commerce/src/admin/payments.ts:52-53 refHrefFor('wallet_topup') → /topup/wallets; :84 only resolves numbers for refType topup (wallet_topup never gets refNumber) → apps/admin/src/app/t/[slug]/payments/page.tsx:78 falls back to refId.slice(0,8).",
      steps: "Admin → ตรวจสลิป / การชำระเงิน → tab ชำระแล้ว → ประเภท เติมกระเป๋าเงิน → กรอง → click เปิดรายการ.",
      expected: "Row shows the customer name/phone + 'เติมกระเป๋าเงิน ฿amount' and the link opens /topup/wallets/<walletId> (the ledger that holds this top-up).",
      actual: `rows: ${JSON.stringify(wt.rows.map((r) => ({ ref: r.ref, href: r.href })))}; following the link lands on ${followW?.url} (h1 '${followW?.h1}').`,
      evidence: `topup_admin-probes.ts p6: ${JSON.stringify(wt.rows.slice(0, 3))}`,
      suggestedFix: "In paymentsQueue resolve wallet_topup refs via wallet_topups → wallets (number = customer phone/name, href = /topup/wallets/<walletId>).",
    });
  }
  tick("p6 shared /payments queue filters + links (topup, wallet_topup)");
  return { topup, wt, verify, follow, followW };
}

/* ───────────────────────────── p7 dashboard KPIs ───────────────────────────── */
async function p7(browser: Browser) {
  const { ctx, page } = await adminPage(browser);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/dashboard`);
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-slot="kpi-label"]')].map((l) => `${(l.textContent ?? "").trim()} ${(l.parentElement?.querySelector('[data-slot="kpi-value"]')?.textContent ?? "").trim()} ${(l.parentElement?.querySelector("p.text-xs")?.textContent ?? "").trim()}`.replace(/\s+/g, " ")));
  out("dashboard cards", cards);
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders`);
  const header = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 700);
  out("orders header", header);
  await ctx.close();
  const db = await q<{ status: string; n: number; sum: number }>(sql`select status, count(*)::int n, coalesce(sum(price),0)::bigint sum from topup_orders where tenant_id = ${TENANT} and placed_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') group by status order by status`);
  out("db today by status", db);
  const total = db.reduce((n, r) => n + r.n, 0);
  const unpaid = db.filter((r) => r.status === "pending_payment" || r.status === "cancelled").reduce((n, r) => n + r.n, 0);
  const paidish = db.filter((r) => ["paid", "processing", "fulfilled"].includes(r.status)).reduce((n, r) => n + r.n, 0);
  const dashCount = Number((cards.find((c) => c.includes("รายการเติมวันนี้")) ?? "").match(/รายการเติมวันนี้\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ?? NaN);
  out("compare", { dashCount, dbTotal: total, dbUnpaidOrCancelled: unpaid, dbPaidish: paidish });
  if (Number.isFinite(dashCount) && dashCount === total && unpaid > 0) {
    upsert({
      id: "ADMIN-10",
      severity: "minor",
      confidence: "confirmed",
      area: "admin",
      title: "Dashboard 'รายการเติมวันนี้' counts every order row placed today (unpaid, cancelled, failed included) while the module's own KPI and 'รายได้วันนี้' only count paid orders",
      where: "apps/admin/src/app/t/[slug]/dashboard/kpis.ts:91-92 (count(*) with no status filter) vs :95-97 revenue filtered to paid/processing/fulfilled and packages/modules/topup/src/admin/orders.ts:198 topupKpis count = status <> 'pending_payment'.",
      steps: "Place PromptPay orders without paying, then open /t/demo-topup/dashboard and /t/demo-topup/topup/orders.",
      expected: "Same definition everywhere (paid orders today), or the card labelled 'สร้างรายการวันนี้'.",
      actual: `Dashboard card: ${cards.find((c) => c.includes("รายการเติมวันนี้"))}; DB today: ${JSON.stringify(db)} → total ${total} (of which ${unpaid} unpaid/cancelled, ${paidish} paid/processing/fulfilled); orders page header: ${header.slice(0, 200)}`,
      evidence: `topup_admin-probes.ts p7: dashCount=${dashCount} dbTotal=${total} unpaid=${unpaid}`,
      suggestedFix: "Add inArray(topupOrders.status, ['paid','processing','fulfilled']) (or <> pending_payment/cancelled) to the topupsToday count, matching revenueToday.",
    });
  }
  tick("p7 dashboard KPIs vs DB vs module header");
}

/* ───────────────────────────── p8 390px ───────────────────────────── */
async function p8(browser: Browser) {
  const f = fx();
  const { ctx, page } = await adminPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pages: Array<[string, string]> = [
    ["orders", `/t/${SLUG}/topup/orders`],
    ["orders-manual", `/t/${SLUG}/topup/orders?tab=manual`],
    ["order-detail", `/t/${SLUG}/topup/orders/${f.orders.O4!.id}`],
    ["wallets", `/t/${SLUG}/topup/wallets`],
    ["wallet-detail", `/t/${SLUG}/topup/wallets/${f.walletId}`],
    ["games", `/t/${SLUG}/topup/games`],
    ["game-packages", `/t/${SLUG}/topup/games/${f.steam!.gameId}`],
    ["game-stock", `/t/${SLUG}/topup/games/${f.steam!.gameId}?tab=stock&stock=${f.steam!.stockPkgId}`],
    ["game-new", `/t/${SLUG}/topup/games/new`],
    ["suppliers", `/t/${SLUG}/topup/suppliers`],
    ["blacklist", `/t/${SLUG}/topup/blacklist`],
    ["payments", `/t/${SLUG}/payments?tab=paid&type=topup`],
  ];
  const report: Record<string, unknown> = {};
  for (const [name, url] of pages) {
    await stableGoto(page, `${ADMIN}${url}`);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const offenders = [...document.querySelectorAll("body *")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width > 0 && r.right > vw + 2 && getComputedStyle(el).position !== "fixed")
        .slice(0, 6)
        .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].slice(0, 4).join(".")} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
      const small = [...document.querySelectorAll("main button, main a[href]")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 32)
        .slice(0, 5)
        .map(({ el, r }) => `${el.tagName.toLowerCase()} '${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 20)}' ${Math.round(r.width)}x${Math.round(r.height)}`);
      const tabs = [...document.querySelectorAll("nav, [role=tablist]")].map((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX })).filter((t) => t.sw > t.cw + 2).slice(0, 3);
      return { vw, sw, offenders, small, tabs };
    });
    const s = await shot(page, `390-${name}`, false);
    report[name] = { ...m, overflow: s.overflow, errors: page.__errors.slice(0, 2), bad: page.__bad.slice(0, 2) };
    out(`390 ${name}`, report[name]);
    page.__errors.length = 0;
    page.__bad.length = 0;
  }
  // dialogs
  const dialogs: Record<string, unknown> = {};
  const measureDialog = async (name: string) => {
    const d = page.getByRole("dialog");
    await expect(d).toBeVisible({ timeout: 15_000 });
    const m = await d.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const footer = [...el.querySelectorAll("button")].map((b) => b.getBoundingClientRect()).filter((b) => b.height > 0);
      const lastBtn = footer[footer.length - 1];
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), vh, scrollable: el.scrollHeight > el.clientHeight + 2, overflowY: getComputedStyle(el).overflowY, lastButtonBottom: lastBtn ? Math.round(lastBtn.bottom) : null, width: Math.round(r.width), vw: window.innerWidth };
    });
    const s = await shot(page, `390-dialog-${name}`, false);
    dialogs[name] = { ...m, shot: s.f };
    out(`dialog ${name}`, m);
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  };
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${f.orders.O4!.id}`);
  await page.getByRole("button", { name: "เติมสำเร็จ" }).first().click();
  await measureDialog("fulfill");
  await page.getByRole("button", { name: "เติมไม่สำเร็จ" }).first().click();
  await measureDialog("fail");
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/wallets/${f.walletId}`);
  const adj = page.getByRole("button", { name: /ปรับยอด|เพิ่ม\s*\/\s*หัก|เครดิต/ }).first();
  if (await adj.count()) {
    await adj.click();
    await measureDialog("wallet-adjust");
  } else out("wallet adjust button not found", await page.locator("main button").allInnerTexts());
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/suppliers`);
  const addSup = page.getByRole("button", { name: /เพิ่ม supplier|เพิ่ม/ }).first();
  if (await addSup.count()) {
    await addSup.click();
    await measureDialog("supplier");
  }
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/games/${f.steam!.gameId}?tab=stock&stock=${f.steam!.stockPkgId}`);
  const imp = page.getByRole("button", { name: /นำเข้าโค้ด/ }).first();
  if (await imp.count()) {
    await imp.click();
    await measureDialog("stock-import");
  }
  await ctx.close();
  writeFileSync(path.join(here, "topup_admin-390.json"), JSON.stringify({ report, dialogs }, null, 2));
  tick("p8 390px overflow + dialogs + tab strips");
}

/* ───────────────────────────── p9 fresh tenant ───────────────────────────── */
async function p9(browser: Browser) {
  const slug = `qa-topup-empty-${RUN}`;
  const outp = execSync(`pnpm --filter @rentweb/tooling create-tenant -- --template topup --name "QA Topup Empty ${RUN}" --slug ${slug} --no-sample --active`, { cwd: path.resolve(process.cwd()), encoding: "utf8" });
  out("create-tenant", outp.trim().split("\n").slice(-2).join(" | "));
  const [t] = await q<{ id: string; status: string }>(sql`select id, status from tenants where slug = ${slug}`);
  const counts = await q<{ games: number; pkgs: number; suppliers: number }>(sql`select (select count(*)::int from games where tenant_id = ${t!.id}) games, (select count(*)::int from game_packages where tenant_id = ${t!.id}) pkgs, (select count(*)::int from topup_suppliers where tenant_id = ${t!.id}) suppliers`);
  out("fresh tenant", { slug, t, counts: counts[0] });
  const { ctx, page } = await adminPage(browser);
  const report: Record<string, unknown> = {};
  for (const [name, url] of [
    ["dashboard", `/t/${slug}/dashboard`],
    ["topup-index", `/t/${slug}/topup`],
    ["orders", `/t/${slug}/topup/orders`],
    ["orders-verify", `/t/${slug}/topup/orders?tab=verify`],
    ["wallets", `/t/${slug}/topup/wallets`],
    ["games", `/t/${slug}/topup/games`],
    ["games-new", `/t/${slug}/topup/games/new`],
    ["suppliers", `/t/${slug}/topup/suppliers`],
    ["blacklist", `/t/${slug}/topup/blacklist`],
    ["payments", `/t/${slug}/payments`],
  ] as Array<[string, string]>) {
    const res = await stableGoto(page, `${ADMIN}${url}`);
    const main = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const empty = main.match(/ยังไม่มี[^.]{0,60}|ไม่มี[^.]{0,40}|เริ่ม[^.]{0,60}|เพิ่ม(เกม|supplier)[^.]{0,40}/g)?.slice(0, 3) ?? [];
    report[name] = { status: res?.status(), url: page.url(), len: main.length, empty, snippet: main.slice(0, 160), errors: page.__errors.slice(0, 2), bad: page.__bad.slice(0, 2) };
    out(`fresh ${name}`, report[name]);
    page.__errors.length = 0;
    page.__bad.length = 0;
  }
  await shot(page, "fresh-orders", false);
  await stableGoto(page, `${ADMIN}/t/${slug}/topup/games`);
  await shot(page, "fresh-games", false);
  // storefront of the fresh tenant
  const sres = await page.goto(`http://${slug}.localhost:3000/games`, { waitUntil: "networkidle", timeout: 120_000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }) as any);
  const stext = (await page.locator("main").innerText().catch(async () => (await page.content()).slice(0, 300))).replace(/\s+/g, " ").slice(0, 200);
  const home = await page.goto(`http://${slug}.localhost:3000/`, { waitUntil: "networkidle", timeout: 120_000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }) as any);
  const htext = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  report["storefront-games"] = { status: sres?.status(), text: stext };
  report["storefront-home"] = { status: home?.status(), text: htext, errors: page.__errors.slice(0, 3) };
  out("fresh storefront", { games: report["storefront-games"], home: report["storefront-home"] });
  await shot(page, "fresh-storefront-home", false);
  await ctx.close();
  writeFileSync(path.join(here, "topup_admin-fresh.json"), JSON.stringify({ slug, tenantId: t?.id, counts: counts[0], report }, null, 2));
  const f = fx();
  (f as any).fresh = { slug, tenantId: t?.id };
  saveFx(f);
  tick("p9 fresh topup tenant empty states");
}

/* ───────────────────────────── p10 roles ───────────────────────────── */
async function p10(browser: Browser) {
  const f = fx();
  // reuse the throwaway QA staff login created by admin_modules-users.ts (test values only)
  const credsFile = path.join(here, "admin_modules-creds.json");
  if (!existsSync(credsFile)) throw new Error("admin_modules-creds.json missing — run qa/bughunt/admin_modules-users.ts first");
  const creds = JSON.parse(readFileSync(credsFile, "utf8")) as Record<string, { email: string; password: string }>;
  const { email, password } = creds.staff!;
  const [u] = await q<{ id: string }>(sql`select id from "user" where lower(email) = ${email.toLowerCase()}`);
  if (!u) throw new Error(`staff user ${email} not in DB`);
  await adminDb()
    .insert(tenantMembers)
    .values({ tenantId: TENANT, userId: u.id, role: "staff" })
    .onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role: "staff" } });
  f.staff = { email, userId: u.id };
  saveFx(f);
  const state = await stateFor(browser, "staff", email, password, true);
  const ctx = await newCtx(browser, { storageState: state });
  const page = await newPage(ctx);
  const o = f.orders.O4!;
  await stableGoto(page, `${ADMIN}/t/${SLUG}/topup/orders/${o.id}`);
  const ui = {
    fulfillBtn: await page.getByRole("button", { name: "เติมสำเร็จ" }).count(),
    noteComposer: await page.getByRole("button", { name: "เพิ่มโน้ต" }).count(),
    navTopup: await page.locator('a[href*="/topup/"]').count(),
    deliveredCodeShown: await page.getByText("โค้ด", { exact: false }).count(),
  };
  out("staff UI on order page", ui);
  const fulfill = await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "fulfillOrderAction", "topup/orders/actions.ts", [SLUG, o.id, { deliveredCode: null, proofImage: null, note: "staff attempt" }]);
  const after = await orderRow(o.id);
  await page.goto(`${ADMIN}/t/${SLUG}/topup/wallets/${f.walletId}`, { waitUntil: "domcontentloaded" });
  const adjust = await act(page, `/t/${SLUG}/topup/wallets/${f.walletId}`, "adjustWalletAction", "topup/wallets/actions.ts", [SLUG, f.walletId, { type: "credit", amount: "5", reason: "staff attempt" }, `staff-${f.run}`]);
  await page.goto(`${ADMIN}/t/${SLUG}/topup/orders/${o.id}`, { waitUntil: "domcontentloaded" });
  const [w] = await q<{ balance: number }>(sql`select balance from wallets where id = ${f.walletId}`);
  const note = await act(page, `/t/${SLUG}/topup/orders/${o.id}`, "addNoteAction", "topup/orders/actions.ts", [SLUG, o.id, "staff note ok"]);
  const gn = await page.goto(`${ADMIN}/t/${SLUG}/topup/games/new`, { waitUntil: "domcontentloaded" });
  const stockPage = await page.goto(`${ADMIN}/t/${SLUG}/topup/games/${f.steam!.gameId}?tab=stock&stock=${f.steam!.stockPkgId}`, { waitUntil: "domcontentloaded" });
  const stockUi = { status: stockPage?.status(), importBtn: await page.getByRole("button", { name: /นำเข้าโค้ด/ }).count(), voidBtn: await page.getByRole("button", { name: /ยกเลิกโค้ด|void/i }).count(), maskedRows: await page.locator("main").innerText().then((t) => (t.match(/••••/g) ?? []).length) };
  const wal = await page.goto(`${ADMIN}/t/${SLUG}/topup/wallets/${f.walletId}`, { waitUntil: "domcontentloaded" });
  const walUi = { status: wal?.status(), adjustBtn: await page.getByRole("button", { name: /ปรับยอด/ }).count(), freezeBtn: await page.getByRole("button", { name: /ระงับ/ }).count() };
  out("staff results", { fulfill: fulfill.value, orderAfter: after?.status, adjust: adjust.value, balance: w?.balance, note: note.value, gamesNew: { status: gn?.status(), url: page.url() }, stockUi, walUi });
  await ctx.close();
  const leaked = fulfill.value?.ok || adjust.value?.ok || after?.status === "fulfilled";
  if (leaked) {
    upsert({ id: "ADMIN-11", severity: "critical", confidence: "confirmed", area: "admin", title: "Staff role can run manager-only top-up actions server-side", where: "apps/admin/src/app/t/[slug]/topup/**/actions.ts assertRole", steps: "Sign in as a staff member; POST fulfillOrderAction / adjustWalletAction", expected: "Refused", actual: JSON.stringify({ fulfill: fulfill.value, adjust: adjust.value, orderAfter: after?.status, balance: w?.balance }), evidence: "topup_admin-probes.ts p10" });
  }
  writeFileSync(path.join(here, "topup_admin-roles.json"), JSON.stringify({ ui, fulfill: fulfill.value, fulfillRaw: fulfill.text.slice(0, 300), adjust: adjust.value, note: note.value, orderAfter: after?.status, balance: w?.balance, gamesNew: page.url(), stockUi, walUi }, null, 2));
  tick("p10 roles (staff) server-side");
}

async function main() {
  const browser = await launch();
  const steps: Array<[string, (b: Browser) => Promise<unknown>]> = [
    ["setup", setup],
    ["p1", p1],
    ["p2", p2],
    ["p3", p3],
    ["p4", p4],
    ["p5", p5],
    ["p6", p6],
    ["p7", p7],
    ["p8", p8],
    ["p9", p9],
    ["p10", p10],
  ];
  let failed = 0;
  for (const [k, fn] of steps) {
    if (!want(k)) continue;
    const t0 = Date.now();
    try {
      await fn(browser);
      console.log(`PASS ${k} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${k}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      if (!existsSync(FIX) && k !== "setup") break;
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
