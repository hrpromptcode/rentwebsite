// SEC-008 repro: can a non-image "slip" (HTML disguised as image/png, SVG with script) be stored and served from /uploads?
// reverify-repro 2026-10-17: the original probe re-used security-order.json (that payment is long closed, so the route
// now answers 200 "paid" / 409 before it ever looks at the file) and sent no payer proof (SEC-009: anonymous -> 403).
// It now places a fresh guest order on sec-u1shop and uploads with the order's access key (form field k), which is
// exactly what the payer's page does, so the content check itself is exercised.
import { WEB, db, actionId, callWebAction } from "./security-http.mjs";
const sql = db();
const host = "sec-u1shop.localhost:3000";
const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
const [p] = await sql`select id from products where tenant_id=${t.id} and status='active' and has_variants=false and (track_inventory=false or stock > 2) order by created_at limit 1`;
const [m] = await sql`select id from shipping_methods where tenant_id=${t.id} and active=true order by type='pickup' desc limit 1`;
const add = await fetch(`${WEB}/api/cart`, { method: "POST", headers: { "x-forwarded-host": host, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
const cartCookie = (add.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
const form = { name: "SEC slip2", phone: "0890001112", email: "", shippingMethodId: m.id, paymentMethod: "slip", note: "", line1: "x", subdistrict: "x", district: "x", province: "กรุงเทพมหานคร", postalCode: "10110" };
const o = await callWebAction(host, cartCookie, actionId("placeOrderAction", "checkout"), [t.id, {}, "$K1"], "/checkout", form);
const orderId = o.location?.match(/\/orders\/([0-9a-f-]{36})/)?.[1];
const [order] = await sql`select metadata from orders where id=${orderId}`;
const [pay] = await sql`select id from payments where tenant_id=${t.id} and ref_id=${orderId} order by created_at desc limit 1`;
const html = "<html><body><h1>SEC-PROBE</h1><script>document.title='SEC-XSS '+document.domain</script></body></html>";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="SEC-XSS-SVG"</script></svg>';
let bad = 0;
for (const [name, type, body] of [["slip.html", "image/png", html], ["slip.svg", "image/svg+xml", svg], ["slip.png.html", "text/html", html]]) {
  const fd = new FormData();
  fd.append("slip", new Blob([body], { type }), name);
  fd.append("k", order.metadata.accessKey);
  const r = await fetch(`${WEB}/api/payments/${pay.id}/slip`, { method: "POST", headers: { "x-forwarded-host": host }, body: fd });
  const j = await r.json();
  console.log("upload", name, type, "->", r.status, JSON.stringify(j));
  if (j.slipUrl) {
    bad++;
    const g = await fetch(`${WEB}${j.slipUrl}`, { headers: { "x-forwarded-host": host } });
    console.log("  served", j.slipUrl, g.status, "content-type:", g.headers.get("content-type"));
  }
}
const [row] = await sql`select status, verified_by, slip_url from payments where id=${pay.id}`;
console.log("db payment:", row);
console.log(!bad && row.status === "pending" && !row.slip_url ? "PASS SEC-008 non-image slips refused (400), nothing stored" : "FAIL SEC-008 bug reproduces");
// leave nothing open: cancel the probe order's payment
await sql`update payments set status='cancelled' where id=${pay.id} and status='pending'`;
await sql`update orders set status='cancelled' where id=${orderId} and status='pending'`;
process.exit(0);
