import { ADMIN, actionId, callAction, creds, get } from "./security-http.mjs";
const c = creds();
const paths = ["/t/demo-shop/dashboard", "/t/demo-shop/orders", "/t/demo-shop/customers", "/t/demo-shop/settings/team", "/t/demo-restaurant/restaurant/kitchen/feed", "/t/demo-restaurant/restaurant/orders/feed", "/t/demo-clinic/clinic/patients", "/console", "/console/tenants"];
for (const p of paths) {
  const r = await get(`${ADMIN}${p}`, c.u1.cookie);
  console.log("u1", p, r.status, r.location ?? "", r.text.includes("demo") && r.status === 200 ? `len=${r.text.length}` : "");
}
for (const p of ["/t/demo-restaurant/restaurant/kitchen/feed", "/t/demo-restaurant/restaurant/orders/feed"]) {
  const r = await get(`${ADMIN}${p}`, "");
  console.log("anon", p, r.status, r.location ?? "", r.text.slice(0, 80));
}
// server action as non-member against demo-shop
const r = await callAction(ADMIN, c.u1.cookie, actionId("searchCustomersAction", "bookings"), ["demo-salon", "a"], "/t/demo-salon/bookings");
console.log("u1 searchCustomersAction(demo-salon)", r.status, r.text.slice(0, 300).replace(/\n/g, " | "));
const r2 = await callAction(ADMIN, c.u1.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: "01a144b9-cc49-7076-a12f-2bfff7539e9c", status: "suspended" }], "/console");
console.log("u1 updateTenantStatus", r2.status, r2.location, r2.text.slice(0, 200).replace(/\n/g, " | "));
