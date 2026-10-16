// Verifies SEC-009 / SEC-008 / SEC-010 / SS-11 / COR-01 / COR-02 / SEC-006(keys) against the running storefront.
//   node tooling/qa/bughunt/fixes/SEC-009-verify.mjs
// Creates throwaway guest orders on tenant sec-u1shop (DEV_AUTO_APPROVE_SLIPS=true in .env) and prints PASS/FAIL.
import { WEB, db, actionId, callWebAction } from "../security-http.mjs";

const sql = db();
const host = "sec-u1shop.localhost:3000";
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
const [p] = await sql`select id from products where tenant_id=${t.id} and status='active' and has_variants=false and (track_inventory=false or stock > 5) order by created_at limit 1`;
const [m] = await sql`select id from shipping_methods where tenant_id=${t.id} and active=true order by type='pickup' desc limit 1`;

async function newOrder() {
  const add = await fetch(`${WEB}/api/cart`, { method: "POST", headers: { "x-forwarded-host": host, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
  const cartCookie = (add.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
  const form = { name: "Verify", phone: "0890001111", email: "", shippingMethodId: m.id, paymentMethod: "slip", note: "", line1: "x", subdistrict: "x", district: "x", province: "กรุงเทพมหานคร", postalCode: "10110" };
  const o = await callWebAction(host, cartCookie, actionId("placeOrderAction", "checkout"), [t.id, {}, "$K1"], "/checkout", form);
  const orderId = o.location?.match(/\/orders\/([0-9a-f-]{36})/)?.[1];
  const [order] = await sql`select id, metadata from orders where id=${orderId}`;
  const [pay] = await sql`select id, status from payments where tenant_id=${t.id} and ref_id=${orderId} order by created_at desc limit 1`;
  return { orderId, accessKey: order.metadata.accessKey, paymentId: pay.id };
}

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f3e0000000049454e44ae426082", "hex");
const html = "<html><body><script>document.title='SEC-XSS '+document.domain</script></body></html>";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="x"</script></svg>';

async function upload(paymentId, { body = png, type = "image/png", name = "s.png", referer, k } = {}) {
  const fd = new FormData();
  fd.append("slip", new Blob([body], { type }), name);
  if (k) fd.append("k", k);
  const headers = { "x-forwarded-host": host };
  if (referer) headers.referer = referer;
  const r = await fetch(`${WEB}/api/payments/${paymentId}/slip`, { method: "POST", headers, body: fd });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function status(paymentId, referer) {
  const headers = { "x-forwarded-host": host };
  if (referer) headers.referer = referer;
  const r = await fetch(`${WEB}/api/payments/${paymentId}`, { headers });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// --- A: access control (SEC-009, SEC-010, SS-11) ---------------------------------------------------------
const a = await newOrder();
const page = `http://${host}/orders/${a.orderId}?k=${a.accessKey}`;
check("SS-11 GET /api/payments/not-a-uuid -> 404", (await status("not-a-uuid")).status === 404);
check("SS-11 POST /api/payments/not-a-uuid/slip -> 404", (await upload("not-a-uuid")).status === 404);
check("SEC-010 anonymous status -> 404", (await status(a.paymentId)).status === 404);
check("SEC-009 anonymous slip -> 403", (await upload(a.paymentId)).status === 403);
check("SEC-009 wrong access key -> 403", (await upload(a.paymentId, { referer: `http://${host}/orders/${a.orderId}?k=WRONGKEY` })).status === 403);
check("SEC-009 cross-origin referer ignored -> 403", (await upload(a.paymentId, { referer: `http://evil.localhost:3000/orders/${a.orderId}?k=${a.accessKey}` })).status === 403);
const st = await status(a.paymentId, page);
check("SEC-010 payer status (referer ?k=) -> 200 without refId", st.status === 200 && st.json.status === "pending" && !("refId" in st.json), JSON.stringify(st.json));
// --- B: content sniffing (SEC-008) ---------------------------------------------------------------------
const h = await upload(a.paymentId, { body: html, type: "image/png", name: "slip.html", referer: page });
check("SEC-008 HTML disguised as image/png -> 400", h.status === 400, JSON.stringify(h.json));
const s = await upload(a.paymentId, { body: svg, type: "image/svg+xml", name: "slip.svg", referer: page });
check("SEC-008 SVG -> 400", s.status === 400, JSON.stringify(s.json));
const [still] = await sql`select status, slip_url from payments where id=${a.paymentId}`;
check("SEC-008 rejected uploads leave payment untouched", still.status === "pending" && !still.slip_url);
// --- C: payer upload works (form field k) -----------------------------------------------------------------
const ok = await upload(a.paymentId, { name: "evil.html", k: a.accessKey });
check("SEC-009 payer upload (form k) -> 200 paid (dev auto-approve)", ok.status === 200 && ok.json.status === "paid", JSON.stringify(ok.json));
check("SEC-008 stored extension from sniffed type (.png, not .html)", /\.png$/.test(ok.json.slipUrl ?? ""), ok.json.slipUrl);
check("SEC-006 object key random part is 16 base64url chars (96-bit crypto)", /\/\d{13}-[A-Za-z0-9_-]{16}\.png$/.test(ok.json.slipUrl ?? ""), ok.json.slipUrl);
const again = await upload(a.paymentId, { referer: page });
check("idempotent: second slip on a paid payment -> 200 paid", again.status === 200 && again.json.status === "paid");
// --- D: closed payments (COR-01 / COR-02) ---------------------------------------------------------------
const c = await newOrder();
await sql`update orders set status='cancelled' where id=${c.orderId}`;
await sql`update payments set status='cancelled' where id=${c.paymentId}`;
const cr = await upload(c.paymentId, { k: c.accessKey });
const [cRow] = await sql`select p.status ps, o.status os, o.payment_status ops from payments p join orders o on o.id=p.ref_id where p.id=${c.paymentId}`;
check("COR-01 slip on cancelled payment -> 409, nothing changes", cr.status === 409 && cRow.ps === "cancelled" && cRow.os === "cancelled" && cRow.ops === "unpaid", `${cr.status} ${JSON.stringify(cRow)}`);
const d = await newOrder();
const paid = await upload(d.paymentId, { k: d.accessKey });
await sql`update payments set status='refunded', refunded_amount=amount where id=${d.paymentId}`;
await sql`update orders set status='refunded', payment_status='refunded' where id=${d.orderId}`;
const [sold0] = await sql`select sold_count from products where id=${p.id}`;
const dr = await upload(d.paymentId, { k: d.accessKey });
const [dRow] = await sql`select p.status ps, o.payment_status ops from payments p join orders o on o.id=p.ref_id where p.id=${d.paymentId}`;
const [sold1] = await sql`select sold_count from products where id=${p.id}`;
check("COR-02 slip after full refund -> 409, stays refunded, paid handler not re-run", paid.json.status === "paid" && dr.status === 409 && dRow.ps === "refunded" && dRow.ops === "refunded" && sold0.sold_count === sold1.sold_count, `${dr.status} ${JSON.stringify(dRow)}`);

const failed = results.filter((x) => !x).length;
console.log(failed ? `FAIL (${failed} of ${results.length})` : `PASS (${results.length} checks)`);
await sql.end?.();
process.exit(failed ? 1 : 0);
