/** correctness bughunt – malformed ids / params on storefront API routes → expect 4xx, not 500. */
import { done, hreq, multipart } from "./correctness-lib";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
async function main() {
  const m = multipart("slip", "slip.png", "image/png", PNG);
  const cases: Array<[string, string, string, any?]> = [
    ["demo-shop.localhost:3000", "GET", "/api/payments/not-a-uuid"],
    ["demo-shop.localhost:3000", "POST", "/api/payments/not-a-uuid/slip", { headers: { "content-type": m.contentType, "content-length": String(m.body.length) }, body: m.body }],
    ["demo-shop.localhost:3000", "POST", "/api/payments/00000000-0000-7000-8000-000000000000/slip", { headers: { "content-type": m.contentType, "content-length": String(m.body.length) }, body: m.body }],
    ["demo-restaurant.localhost:3000", "GET", "/api/restaurant/orders/R-99999?phone=0812345678"],
    ["demo-restaurant.localhost:3000", "GET", "/api/restaurant/orders/%27%22%3E?phone=x"],
    ["demo-restaurant.localhost:3000", "GET", "/api/restaurant/session/%00%00"],
    ["demo-restaurant.localhost:3000", "POST", "/api/restaurant/session/ZZZZZZ/call", { headers: { "content-type": "application/json" }, body: "{}" }],
    ["demo-restaurant.localhost:3000", "GET", "/api/restaurant/reservations/availability?date=2026-13-45&time=99:99&party=abc"],
    ["demo-restaurant.localhost:3000", "POST", "/api/restaurant/cart/price", { headers: { "content-type": "application/json" }, body: "{\"items\":\"x\"}" }],
    ["demo-salon.localhost:3000", "GET", "/api/booking/days?month=2026-99&service=01a1401b-ad12-7546-8f7f-c6218eab803b"],
    ["demo-salon.localhost:3000", "GET", "/api/booking/slots?date=2026-02-30&service=01a1401b-ad12-7546-8f7f-c6218eab803b"],
    ["demo-shop.localhost:3000", "GET", "/api/commerce/products/search?q=%25%27"],
    ["demo-shop.localhost:3000", "POST", "/api/cart", { headers: { "content-type": "application/json" }, body: "{\"coupon\":\"   \"}" }],
    ["demo-shop.localhost:3000", "PATCH", "/api/cart", { headers: { "content-type": "application/json" }, body: "{\"itemId\":\"x\",\"quantity\":1e9}" }],
    ["demo-shop.localhost:3000", "GET", "/orders/not-a-uuid"],
    ["demo-shop.localhost:3000", "GET", "/products/%E0%B8"],
    ["demo-salon.localhost:3000", "GET", "/bookings/not-a-uuid"],
  ];
  for (const [host, method, path, o] of cases) {
    try {
      const r = await hreq(host, path, { method, ...(o ?? {}) });
      console.log(String(r.status).padEnd(4), method.padEnd(5), host.split(".")[0], path, "→", r.body.replace(/\s+/g, " ").slice(0, 90));
    } catch (e: any) {
      console.log("ERR", method, path, e.message);
    }
  }
  await done();
}
main();
