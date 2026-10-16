// SEC-009 in a real browser: PaymentPanel uploads with a plain same-origin fetch(`/api/payments/<id>/slip`) from the
// page it is rendered on. From the guest's order page (/orders/<id>?k=<key>) the proof travels in the Referer -> 200;
// from a same-origin page without the key -> 403. (The script issues the panel's exact request from the page; the HMR socket is stubbed so dev reloads
// triggered by other agents' edits cannot interrupt it.)
// Run from tooling/:  npx tsx qa/bughunt/fixes/SEC-009-browser.ts
import { chromium } from "@playwright/test";
// @ts-expect-error plain .mjs helper
import { WEB, db, actionId, callWebAction } from "../security-http.mjs";

const host = "sec-u1shop.localhost:3000";
const sql = db();
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABVKJPPgAAAABJRU5ErkJggg==";

async function newOrder() {
  const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
  const [p] = await sql`select id from products where tenant_id=${t.id} and status='active' and has_variants=false and (track_inventory=false or stock > 5) order by created_at limit 1`;
  const [m] = await sql`select id from shipping_methods where tenant_id=${t.id} and active=true order by type='pickup' desc limit 1`;
  const add = await fetch(`${WEB}/api/cart`, { method: "POST", headers: { "x-forwarded-host": host, "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, quantity: 1 }) });
  const cartCookie = (add.headers.getSetCookie() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  const form = { name: "Browser", phone: "0890002222", email: "", shippingMethodId: m.id, paymentMethod: "slip", note: "", line1: "x", subdistrict: "x", district: "x", province: "กรุงเทพมหานคร", postalCode: "10110" };
  const o = await callWebAction(host, cartCookie, actionId("placeOrderAction", "checkout"), [t.id, {}, "$K1"], "/checkout", form);
  const orderId = o.location?.match(/\/orders\/([0-9a-f-]{36})/)?.[1] as string;
  const [order] = await sql`select metadata from orders where id=${orderId}`;
  const [pay] = await sql`select id from payments where ref_id=${orderId} order by created_at desc limit 1`;
  return { orderId, key: order.metadata.accessKey as string, paymentId: pay.id as string };
}

const browser = await chromium.launch();
const page = await browser.newPage();
// keep the dev server's HMR socket closed: other agents' edits would otherwise reload the page mid-request
if (process.env.DEBUG_NET) {
  const t0 = Date.now();
  page.on("framenavigated", (f) => f === page.mainFrame() && console.log(Date.now() - t0, "nav", f.url()));
  page.on("request", (q) => q.url().includes("/api/") && console.log(Date.now() - t0, "req", q.method(), q.url()));
  page.on("requestfailed", (q) => console.log(Date.now() - t0, "failed", q.url(), q.failure()?.errorText));
  page.on("websocket", (w) => console.log(Date.now() - t0, "ws", w.url()));
  page.on("console", (m) => console.log(Date.now() - t0, "console", m.text().slice(0, 120)));
}
await page.routeWebSocket(/\/_next\/(webpack-)?hmr/, () => {});

// The panel's status poll redirects to successHref as soon as the payment is paid, which can tear down the page
// before evaluate() returns — so the slip response status is captured from the network instead.
async function postFrom(pageUrl: string, paymentId: string): Promise<number> {
  let status = -1;
  const onResponse = (r: { url(): string; status(): number }) => {
    if (r.url().includes(`/api/payments/${paymentId}/slip`)) status = r.status();
  };
  page.on("response", onResponse);
  try {
    await page.goto(pageUrl, { waitUntil: "load", timeout: 90_000 });
    await page
      .evaluate(
        async ({ id, b64 }) => {
          const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const fd = new FormData();
          fd.append("slip", new Blob([png], { type: "image/png" }), "slip.png");
          return (await fetch(`/api/payments/${id}/slip`, { method: "POST", body: fd })).status;
        },
        { id: paymentId, b64: PNG_B64 },
      )
      .then((s) => (status = s))
      .catch((e: Error) => console.log(`evaluate: ${e.message.split(/\r?\n/)[0]}`));
    for (let i = 0; i < 40 && status === -1; i++) await new Promise((r) => setTimeout(r, 250));
  } finally {
    page.off("response", onResponse);
  }
  return status;
}

const o = await newOrder();
const status1 = await postFrom(`http://${host}/orders/${o.orderId}?k=${o.key}`, o.paymentId);
const [after] = await sql`select status from payments where id=${o.paymentId}`;
const ok1 = status1 === 200 && after.status === "paid";
console.log(`${ok1 ? "PASS" : "FAIL"} fetch from the guest order page (?k= via Referer) -> ${status1}, payment ${after.status}`);

const o2 = await newOrder();
const status2 = await postFrom(`http://${host}/orders/${o2.orderId}`, o2.paymentId);
const [after2] = await sql`select status from payments where id=${o2.paymentId}`;
const ok2 = status2 === 403 && after2.status === "pending";
console.log(`${ok2 ? "PASS" : "FAIL"} same request from the order page without ?k= -> ${status2}, payment ${after2.status}`);

await browser.close();
await sql.end();
process.exit(ok1 && ok2 ? 0 : 1);
