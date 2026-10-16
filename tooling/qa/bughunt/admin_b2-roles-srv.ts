import { readFileSync } from "node:fs";
import { and, desc, eq, customers, navigation, orders, pages, payments, products, diningTables, restaurantOrders, services, bookings } from "@rentweb/db";
import { ADMIN, done, launch, newCtx, out, readCreds, tenantIdOf, tt } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t]));
const ids = readFileSync("qa/bughunt/admin_b2-actionids.txt", "utf8").trim().split("\n").map((l) => l.split(" "));
const idOf = (name: string, file: string) => ids.find(([, n, f]) => n === name && (f ?? "").includes(file))?.[0];
async function main() {
  const shopId = await tenantIdOf(T.shop.slug), restId = await tenantIdOf(T.restaurant.slug), salonId = await tenantIdOf(T.salon.slug);
  const [ord] = await tt(shopId, (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.tenantId, shopId)).orderBy(desc(orders.createdAt)).limit(1));
  const [pay] = await tt(shopId, (tx) => tx.select({ id: payments.id }).from(payments).where(and(eq(payments.tenantId, shopId), eq(payments.refId, ord!.id))).limit(1));
  const [prod] = await tt(shopId, (tx) => tx.select({ id: products.id, status: products.status }).from(products).where(eq(products.tenantId, shopId)).limit(1));
  const [cust] = await tt(shopId, (tx) => tx.select({ id: customers.id }).from(customers).where(eq(customers.tenantId, shopId)).limit(1));
  const [about] = await tt(shopId, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, shopId), eq(pages.kind, "page"))).limit(1));
  const [home] = await tt(shopId, (tx) => tx.select({ id: pages.id }).from(pages).where(and(eq(pages.tenantId, shopId), eq(pages.kind, "home"))).limit(1));
  const [table] = await tt(restId, (tx) => tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.tenantId, restId)).limit(1));
  const [svc] = await tt(salonId, (tx) => tx.select({ id: services.id }).from(services).where(eq(services.tenantId, salonId)).limit(1));
  const [bk] = await tt(salonId, (tx) => tx.select({ id: bookings.id, answers: bookings.answers }).from(bookings).where(eq(bookings.tenantId, salonId)).limit(1));
  const tests: Array<[string, string, string, string, string, unknown[]]> = [
    ["staff", T.shop.slug, "/orders", "confirmOrderAction", "orders/actions", [T.shop.slug, ord!.id]],
    ["staff", T.shop.slug, "/orders", "verifyPaymentAction", "orders/actions", [T.shop.slug, ord!.id, pay?.id ?? ord!.id]],
    ["staff", T.shop.slug, "/products", "archiveProductAction", "products/actions", [T.shop.slug, prod!.id]],
    ["staff", T.shop.slug, "/customers", "toggleCustomerBlock", "customers/actions", [T.shop.slug, cust!.id, true]],
    ["staff", T.shop.slug, "/pages", "publishPage", "pages/actions", [T.shop.slug, home!.id]],
    ["staff", T.shop.slug, "/navigation", "saveNavigation", "pages/actions", [T.shop.slug, { header: [], footer: [] }]],
    ["manager", T.shop.slug, "/pages", "deletePage", "pages/actions", [T.shop.slug, about!.id]],
    ["manager", T.shop.slug, "/settings", "saveGeneral", "settings/actions", [T.shop.slug, { name: "HACKED", contact: {} }]],
    ["manager", T.shop.slug, "/settings/payments", "savePayments", "settings/actions", [T.shop.slug, { promptpayId: "0811111111", bankAccounts: [], enabled: { promptpay: true } }]],
    ["manager", T.shop.slug, "/settings/team", "inviteMember", "settings/actions", [T.shop.slug, { email: "x@example.com", role: "viewer" }]],
    ["manager", T.shop.slug, "/settings/danger", "suspendOwnTenant", "settings/actions", [T.shop.slug]],
    ["manager", T.shop.slug, "/design", "saveTheme", "design/actions", [T.shop.slug, {}]],
    ["staff", T.restaurant.slug, "/restaurant/tables", "deleteTableAction", "restaurant/tables", [T.restaurant.slug, table!.id]],
    ["staff", T.restaurant.slug, "/restaurant/menu", "saveItemAction", "restaurant/menu", [T.restaurant.slug, { name: "x" }]],
    ["staff", T.restaurant.slug, "/restaurant/orders", "settleSessionAction", "restaurant/orders", [T.restaurant.slug, table!.id, "cash"]],
    ["staff", T.salon.slug, "/services", "saveServiceAction", "services/actions", [T.salon.slug, svc!.id, { name: "x" }]],
    ["staff", T.salon.slug, "/bookings", "approveDepositAction", "bookings/actions", [T.salon.slug, bk!.id, (bk!.answers as any)?.paymentId ?? bk!.id]],
    ["staff", T.clinic.slug, "/clinic/packages", "savePackageAction", "clinic/actions", [T.clinic.slug, null, { name: "x" }]],
  ];
  const browser = await launch();
  const pagesBy: Record<string, any> = {};
  for (const [role, slug, pg, action, file, args] of tests) {
    if (!pagesBy[role]) { const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(`qa/bughunt/admin_b2-state-${role}.json`, "utf8")) }); pagesBy[role] = await ctx.newPage(); await pagesBy[role].goto(`${ADMIN}/t/${slug}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120_000 }); }
    const id = idOf(action, file);
    if (!id) { out(`${role} ${action}`, "no action id"); continue; }
    const res = await pagesBy[role].evaluate(async ({ url, id, body }: any) => {
      const r = await fetch(url, { method: "POST", headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body });
      return { status: r.status, text: (await r.text()).slice(0, 1500) };
    }, { url: `/t/${slug}${pg}`, id, body: JSON.stringify(args) });
    const t = res.text.replace(/\s+/g, " ");
    const refused = /คุณไม่มีสิทธิ์ดำเนินการนี้/.test(t);
    out(`${role.padEnd(7)} ${action}`, `${res.status} ${refused ? "REFUSED" : "NOT-REFUSED " + (t.match(/"(?:error|message)":"([^"]{0,80})"/)?.[0] ?? t.slice(0, 120))}`);
  }
  // state checks after the attempts
  const [about2] = await tt(shopId, (tx) => tx.select({ id: pages.id }).from(pages).where(eq(pages.id, about!.id)));
  const nav = await tt(shopId, (tx) => tx.select({ loc: navigation.location, items: navigation.items }).from(navigation).where(eq(navigation.tenantId, shopId)));
  const [prod2] = await tt(shopId, (tx) => tx.select({ status: products.status }).from(products).where(eq(products.id, prod!.id)));
  const [t2] = await tt(restId, (tx) => tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.id, table!.id)));
  out("state after", { aboutPageExists: !!about2, navItems: nav.map((n) => `${n.loc}:${(n.items as any[]).length}`), productStatus: `${prod!.status} -> ${prod2?.status}`, tableExists: !!t2 });
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
