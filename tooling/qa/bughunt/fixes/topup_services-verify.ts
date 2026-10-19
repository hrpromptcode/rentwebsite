/**
 * Live verification of the top-up SERVICES fixes (packet tooling/qa/bughunt/fixes/topup_services.md) against the real
 * database (demo-topup) with the module registrations the web app / worker load (apps/web/src/modules.ts).
 * Every DB scenario runs inside a transaction that is rolled back; HTTP checks hit the running web dev server (:3000).
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_services-verify.ts [phase]
 * Prints one PASS/FAIL line per check; exit code 1 when any check fails.
 */
import "../../../load-env";
import "../../../../apps/web/src/modules";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql, customers, gamePackages, games, getDb, payments, topupOrders, walletTopups, withTenant, type Tx } from "@rentweb/db";
import { cancelPayment, expirePayment, markPaid, paymentHookSummary } from "../../../../packages/core/src/payments";
import { HANDLERS } from "../../../../packages/integrations/src/events/handlers";
import { createTopupOrder, createWalletTopup, getOrCreateWallet, topupConfig, topupFailureField } from "../../../../packages/modules/topup/src/services";

const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579"; // demo-topup
const PKG_API = "01a1401c-bc33-708f-abac-122aa25de837"; // rov 40 coupons (api)
const SEEDED_PHONE = "0812345678"; // seeded customer "ทดสอบ เติมเกม"
const SETTINGS = { payments: { promptpayId: "0899998888", promptpayName: "QA", bankAccounts: [{ bank: "KTB", name: "QA", number: "111-2-33333-4" }], enabled: { promptpay: true, bankTransfer: true, wallet: true } } };
const CFG = topupConfig({ walletEnabled: true, otpRequiredFirstOrder: false, maxOrdersPerHour: 50 });
const db = getDb();
const phase = process.argv[2] ?? "all";
const want = (p: string) => phase === "all" || phase === p;

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
const rows = <R>(r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as R[];
const events = async (tx: Tx, type: string, refKey: string, refVal: string) =>
  rows<{ id: string; type: string; payload: Record<string, unknown>; tenant_id: string; created_at: Date }>(
    await tx.execute(sql`select * from events_outbox where tenant_id = ${T} and type = ${type} and payload->>${refKey} = ${refVal} order by created_at`),
  );

function get(host: string, p: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path: p, method: "GET", headers: { host: `${host}:3000` }, timeout: 120_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${p}`)));
    req.end();
  });
}

/** The field definitions the topup template seeds for a game slug (parsed from packages/templates/src/topup.ts). */
function templateFields(slug: string): unknown[] {
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/templates/src/topup.ts"), "utf8");
  const at = src.indexOf(`slug: "${slug}"`);
  const start = src.indexOf("fields: [", at) + "fields: ".length;
  let depth = 0;
  let end = start;
  for (; end < src.length; end++) {
    if (src[end] === "[") depth++;
    else if (src[end] === "]" && --depth === 0) break;
  }
  return Function(`"use strict"; return (${src.slice(start, end + 1)});`)() as unknown[];
}

async function order(tx: Tx, over: Partial<Parameters<typeof createTopupOrder>[2]> = {}) {
  const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: { uid: "123456789" }, paymentMethod: "promptpay_qr", contact: "0868111001", customer: null, ip: null, settings: SETTINGS, config: CFG, ...over });
  if (!r.ok) throw new Error(`create failed ${r.code} ${r.error}`);
  return r.value;
}

async function main() {
  if (want("hooks")) {
    const s = paymentHookSummary();
    check("SERVICES-01", "closed hooks registered for topup + wallet_topup", s.closed.includes("topup") && s.closed.includes("wallet_topup"), { closed: s.closed });
    check("SERVICES-05", "target check registered for topup", s.target.includes("topup"), { target: s.target });
    check("SERVICES-01", "access checks registered for topup + wallet_topup", s.access.includes("topup") && s.access.includes("wallet_topup"), { access: s.access });
  }

  if (want("expiry")) {
    await rb(async (tx) => {
      const a = await order(tx);
      await tx.update(payments).set({ expiresAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(payments.id, a.payment!.id));
      const exp = await expirePayment(tx, T, a.payment!.id, { now: new Date() });
      const [o] = await tx.select().from(topupOrders).where(eq(topupOrders.id, a.order.id));
      const ev = await events(tx, "topup.cancelled", "orderId", a.order.id);
      check("STOREFRONT-08", "expired QR payment → order cancelled + topup.cancelled", exp?.status === "expired" && o!.status === "cancelled" && ev.length === 1 && ev[0]!.payload.expired === true, { payment: exp?.status, order: o!.status, failureReason: o!.failureReason, events: ev.length });

      const b = await order(tx, { contact: "0868111002" });
      await cancelPayment(tx, T, b.payment!.id, "qa cancel");
      const [ob] = await tx.select().from(topupOrders).where(eq(topupOrders.id, b.order.id));
      check("STOREFRONT-08", "cancelPayment → order cancelled with the reason", ob!.status === "cancelled" && ob!.failureReason === "qa cancel", { order: ob!.status, reason: ob!.failureReason });

      const [cust] = await tx.select().from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, SEEDED_PHONE))).limit(1);
      const w = await getOrCreateWallet(tx, T, cust!.id);
      const wt = await createWalletTopup(tx, T, { customerId: cust!.id, amount: 5000, method: "promptpay_qr", settings: SETTINGS });
      if (!wt.ok) throw new Error(`wallet topup ${wt.code}`);
      await tx.update(payments).set({ expiresAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(payments.id, wt.value.payment.id));
      await expirePayment(tx, T, wt.value.payment.id, { now: new Date() });
      const wt2 = await createWalletTopup(tx, T, { customerId: cust!.id, amount: 5000, method: "promptpay_qr", settings: SETTINGS });
      if (!wt2.ok) throw new Error(`wallet topup ${wt2.code}`);
      await cancelPayment(tx, T, wt2.value.payment.id, "qa cancel");
      const st = await tx.select({ id: walletTopups.id, status: walletTopups.status }).from(walletTopups).where(eq(walletTopups.walletId, w.id));
      const s1 = st.find((r) => r.id === wt.value.topup.id)?.status;
      const s2 = st.find((r) => r.id === wt2.value.topup.id)?.status;
      check("ADMIN-01", "wallet top-up: expired payment → expired, cancelled payment → cancelled", s1 === "expired" && s2 === "cancelled", { expired: s1, cancelled: s2 });
    });
  }

  if (want("guest")) {
    await rb(async (tx) => {
      const before = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, "0868111003")));
      const a = await order(tx, { contact: "081-234-5678" }); // the seeded customer's phone typed by an anonymous visitor
      const b = await order(tx, { contact: "0868111003" }); // a brand-new phone
      const after = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, T), eq(customers.phone, "0868111003")));
      check("STOREFRONT-05", "guest order with an existing customer's phone is not attached to that account", a.order.customerId === null && a.order.contact === SEEDED_PHONE, { customerId: a.order.customerId, contact: a.order.contact });
      check("STOREFRONT-05", "guest order writes no customers row", b.order.customerId === null && before.length === 0 && after.length === 0, { before: before.length, after: after.length });
    });
  }

  if (want("rate")) {
    await rb(async (tx) => {
      const cfg = topupConfig({ walletEnabled: true, otpRequiredFirstOrder: false, maxOrdersPerHour: 2 });
      const res: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: { uid: "123456789" }, paymentMethod: "promptpay_qr", contact: "0868111004", customer: null, ip: null, settings: SETTINGS, config: cfg });
        res.push(r.ok ? "ok" : (r.code ?? r.error));
      }
      check("SERVICES-10", "guest without IP is limited per contact", res.join(",") === "ok,ok,rate_limited", res);
      const noContact = await createTopupOrder(tx, T, { gameSlug: "rov", packageId: PKG_API, playerFields: { uid: "123456789" }, paymentMethod: "promptpay_qr", contact: null, customer: null, ip: null, settings: SETTINGS, config: cfg });
      check("SERVICES-10", "guest without IP and contact is refused (never unlimited)", !noContact.ok && noContact.code === "contact_required", noContact.ok ? "ok" : noContact.code);
    });
  }

  if (want("notify")) {
    await rb(async (tx) => {
      // manual package → topup.paid carries fulfillment + names → the owner queue notification fires
      const [manual] = await tx
        .select({ id: gamePackages.id, slug: games.slug, fields: games.fields })
        .from(gamePackages)
        .innerJoin(games, eq(games.id, gamePackages.gameId))
        .where(and(eq(gamePackages.tenantId, T), eq(gamePackages.fulfillment, "manual"), eq(gamePackages.active, true), eq(games.active, true)))
        .limit(1);
      if (manual) {
        const pf: Record<string, string> = {};
        for (const f of (manual.fields ?? []) as Array<{ key: string; type: string; options?: string[] }>) pf[f.key] = f.type === "select" ? (f.options?.[0] ?? "x") : f.key === "contact" ? "qa_line_id" : "123456789";
        const m = await order(tx, { gameSlug: manual.slug, packageId: manual.id, playerFields: pf, paymentMethod: "slip", contact: "0868111005" });
        await markPaid(tx, T, m.payment!.id, { verifiedBy: "qa" });
        const [ev] = await events(tx, "topup.paid", "orderId", m.order.id);
        const p = ev?.payload ?? {};
        check("SERVICES-02", "topup.paid payload has fulfillment / names / amount / contact / accessKey", p.fulfillment === "manual" && !!p.gameName && !!p.packageName && p.amount === m.order.price && p.contact === "0868111005" && p.accessKey === m.accessKey, { fulfillment: p.fulfillment, gameName: p.gameName, packageName: p.packageName, amount: p.amount, contact: p.contact, accessKey: p.accessKey ? "set" : null });
        await HANDLERS["topup.paid"]!(tx, { id: ev!.id, tenantId: T, type: "topup.paid", payload: p, createdAt: new Date() } as never);
        const n = rows<{ payload: { title: string; text: string } }>(await tx.execute(sql`select payload from notifications where tenant_id = ${T} and template = 'topup.manual' and payload->>'title' like ${`%${m.order.number}`}`));
        check("SERVICES-02", "owner gets 'คิวเติมมือใหม่' with game · package", n.length > 0 && n[0]!.payload.text.includes(String(p.gameName)) && n[0]!.payload.text.includes(String(p.packageName)), n.map((r) => r.payload));
      } else check("SERVICES-02", "manual package available", false, "no active manual package in demo-topup");

      // api package paid by slip → fulfilled → customer notified at the typed phone with a ?k= link and real names
      const a = await order(tx, { paymentMethod: "slip", contact: "0868111006" });
      await markPaid(tx, T, a.payment!.id, { verifiedBy: "qa" });
      const [fe] = await events(tx, "topup.fulfilled", "orderId", a.order.id);
      check("SERVICES-03", "topup.fulfilled payload has names, contact and accessKey", !!fe && fe.payload.gameName === a.order.gameName && fe.payload.contact === "0868111006" && fe.payload.accessKey === a.accessKey, fe ? { gameName: fe.payload.gameName, packageName: fe.payload.packageName, contact: fe.payload.contact, accessKey: fe.payload.accessKey ? "set" : null } : "no event");
      if (fe) {
        await HANDLERS["topup.fulfilled"]!(tx, { id: fe.id, tenantId: T, type: "topup.fulfilled", payload: fe.payload, createdAt: new Date() } as never);
        const n = rows<{ recipient: string; channel: string; payload: { title: string; text: string; link?: string } }>(await tx.execute(sql`select recipient, channel, payload from notifications where tenant_id = ${T} and template = 'topup.fulfilled' and payload->>'orderId' = ${a.order.id}`));
        const r0 = n[0];
        check("SERVICES-03", "guest notified at the typed phone; text names game · package; link carries ?k=", !!r0 && r0.recipient === "0868111006" && r0.payload.text.startsWith(`${a.order.gameName} · ${a.order.packageName}`) && String(r0.payload.link).includes(`?k=${encodeURIComponent(a.accessKey)}`), r0 ? { channel: r0.channel, recipient: r0.recipient, text: r0.payload.text, link: r0.payload.link?.replace(a.accessKey, "<key>") } : "no notification");
      }
    });
  }

  if (want("fields")) {
    await rb(async (tx) => {
      const gen = templateFields("genshin");
      const val = templateFields("valorant");
      await tx.update(games).set({ fields: gen as never }).where(and(eq(games.tenantId, T), eq(games.slug, "genshin")));
      await tx.update(games).set({ fields: val as never }).where(and(eq(games.tenantId, T), eq(games.slug, "valorant")));
      const pk = async (slug: string) => (await tx.select({ id: gamePackages.id }).from(gamePackages).innerJoin(games, eq(games.id, gamePackages.gameId)).where(and(eq(gamePackages.tenantId, T), eq(games.slug, slug), eq(gamePackages.active, true))).limit(1))[0]!.id;
      const base = { paymentMethod: "promptpay_qr" as const, contact: "0868111007", customer: null, ip: null, settings: SETTINGS, config: CFG };
      const bad = await createTopupOrder(tx, T, { ...base, gameSlug: "genshin", packageId: await pk("genshin"), playerFields: { uid: "  ทดสอบ🙂 ", server: "Asia" } });
      check("STOREFRONT-12", "Genshin UID 'ทดสอบ🙂' refused with Thai field message + field key", !bad.ok && bad.code === "invalid_field" && topupFailureField(bad) === "uid", bad.ok ? "accepted" : { code: bad.code, error: bad.error, field: topupFailureField(bad) });
      const good = await createTopupOrder(tx, T, { ...base, gameSlug: "genshin", packageId: await pk("genshin"), playerFields: { uid: "812345678", server: "Asia" } });
      check("STOREFRONT-12", "Genshin UID 812345678 accepted", good.ok, good.ok ? good.value.order.number : good.code);
      const riot = await createTopupOrder(tx, T, { ...base, gameSlug: "valorant", packageId: await pk("valorant"), playerFields: { riotid: "NoTagHere" } });
      check("STOREFRONT-12", "Riot ID without #TAG refused", !riot.ok && riot.code === "invalid_field", riot.ok ? "accepted" : { code: riot.code, error: riot.error });
      const riotOk = await createTopupOrder(tx, T, { ...base, gameSlug: "valorant", packageId: await pk("valorant"), playerFields: { riotid: "ผู้เล่น#TH1" } });
      check("STOREFRONT-12", "Riot ID 'ผู้เล่น#TH1' accepted", riotOk.ok, riotOk.ok ? riotOk.value.order.number : riotOk.code);
    });
  }

  if (want("tiers")) {
    // STOREFRONT-11: the template computes whole-baht tier prices; live demo rows that still carry satang come from an
    // older seed (fixed by the demo reset). priceFor charges exactly the stored tier price the tile shows.
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/templates/src/topup.ts"), "utf8");
    const formula = src.includes("tierPrices: { vip: Math.round((price * 0.98) / 100) * 100, agent: Math.round((price * 0.95) / 100) * 100 }");
    const prices = [...src.matchAll(/\["[^"]+", (\d+), \d+\]/g)].map((m) => Number(m[1]));
    const odd = prices.filter((pr) => Math.round((pr * 0.98) / 100) * 100 % 100 !== 0 || Math.round((pr * 0.95) / 100) * 100 % 100 !== 0);
    check("STOREFRONT-11", "template seeds whole-baht vip / agent prices for every package", formula && prices.length > 20 && odd.length === 0, { formula, packages: prices.length, satang: odd.length });
    const live = await withTenant(db, T, async (tx) => rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from game_packages where tenant_id = ${T} and ((tier_prices->>'vip')::int % 100 <> 0 or (tier_prices->>'agent')::int % 100 <> 0)`))[0]!.n);
    console.log(`INFO STOREFRONT-11 live demo-topup packages with satang tier prices (pre-fix seed data, re-seeded by the demo reset): ${live}`);
  }

  if (want("neutral")) {
    // ADMIN-17: what a new (non-demo) topup shop gets on its pages
    const { topup } = await import("../../../../packages/templates/src/topup");
    const { neutralTemplatePages } = await import("../../../../packages/core/src/tenant/provision");
    const pages = neutralTemplatePages(topup.pages, { tenantName: "ร้านทดสอบ", sampleBrand: topup.sampleBrand, neutralText: topup.neutralText });
    const home = pages.find((p) => p.slug === "" || p.slug === "home" || p.slug === "/") ?? pages[0]!;
    const visible = JSON.stringify(home.sections.filter((s) => !(s as { hidden?: boolean }).hidden));
    const claims = ["40+", "1.2M", "\"value\":48", " เกม\",\"label\":\"รองรับ", "99.8", "4.9/5", "GameHub", "RoV · Free Fire"].filter((c) => visible.includes(c));
    check("ADMIN-17", "neutral topup home claims no game list / counts / volumes / sample brand", claims.length === 0, { claims, hero: (home.sections[0] as { props?: { subheading?: string } }).props?.subheading });
    const demo = JSON.stringify(topup.pages.find((p) => p === topup.pages[0])!.sections);
    check("ADMIN-17", "demo home no longer says '40+ เกม'", !demo.includes("40+"), demo.includes("40+") ? "still 40+" : "ok");
  }

  if (want("http")) {
    const pub = await get("demo-topup.localhost", "/api/topup/orders/TP-1052");
    const j = pub.status === 200 ? (JSON.parse(pub.body) as Record<string, unknown>) : {};
    check("SERVICES-13", "no-proof lookup: no failureReason / paymentMethod, number lookup still works", pub.status === 200 && j.number === "TP-1052" && j.failureReason === null && !("paymentMethod" in j) && j.authorised === false, { status: pub.status, keys: Object.keys(j), failureReason: j.failureReason });
    const feed = await get("demo-shop.localhost", "/api/topup/feed");
    check("SERVICES-13", "feed 404 on a tenant without the module", feed.status === 404, { status: feed.status });
    for (const host of ["demo-shop.localhost", "nope-tenant.localhost"]) {
      const r = await get(host, "/topup/TP-1040");
      const echo = (r.body.match(/TP-1040/g) ?? []).length;
      check("STOREFRONT-01", `${host} /topup/TP-1040 → 404 with no order data`, r.status === 404 && !/STEAM-|qa-steam@example\.com/.test(r.body), { status: r.status, numberEchoes: echo, leaks: /STEAM-|qa-steam@example\.com/.test(r.body) });
    }
  }

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
