import { ADMIN, actionId, callAction, creds, db } from "./security-http.mjs";
const c = creds(); const sql = db();
const [demoOrder] = await sql`select o.id, o.number, t.slug from orders o join tenants t on t.id=o.tenant_id where t.slug='demo-shop' order by o.created_at desc limit 1`;
console.log("target: demo-shop order", demoOrder?.id, demoOrder?.number);
// u1 is owner of sec-u1shop; call confirmOrderAction(slug=sec-u1shop, orderId=<demo-shop order>)
const r = await callAction(ADMIN, c.u1.cookie, actionId("confirmOrderAction", "orders/actions"), ["sec-u1shop", demoOrder.id], "/t/sec-u1shop/orders/" + demoOrder.id);
console.log("u1 confirmOrder(sec-u1shop, demoOrderId):", r.status, r.text.match(/"ok":(true|false)[^}]*\}?/)?.[0] ?? r.text.slice(0,160).replace(/\n/g," | "));
// confirm demo order status unchanged
console.log("demo order status after:", (await sql`select status from orders where id=${demoOrder.id}`)[0]);
// also try passing slug=demo-shop directly (u1 is not a member) -> should 404
const r2 = await callAction(ADMIN, c.u1.cookie, actionId("confirmOrderAction", "orders/actions"), ["demo-shop", demoOrder.id], "/t/demo-shop/orders/" + demoOrder.id);
console.log("u1 confirmOrder(demo-shop,...):", r2.status, r2.text.match(/NEXT_HTTP_ERROR_FALLBACK;404/)?.[0] ?? r2.text.slice(0,120).replace(/\n/g," | "));
process.exit(0);
