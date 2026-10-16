/** Dashboard "สลิปรอตรวจ" KPI counts orders.payment_status='pending_verification', which no code path ever sets. */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, count, eq, orders, payments, tenants } from "@rentweb/db";
import { attachSlip } from "@rentweb/core/payments";
import { addCartItem, createOrderFromCart, getOrCreateCart } from "../../../packages/modules/commerce/src/services/index";
import { cancelOrderAdmin } from "../../../packages/modules/commerce/src/admin/orders";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const o = await tt(t, async (tx) => {
    const { cart } = await getOrCreateCart(tx, t, null);
    await addCartItem(tx, t, cart.id, { productId: "01a14029-0996-762b-99c5-f1ccda07f220", quantity: 1 });
    const r = await createOrderFromCart(tx, t, { cartToken: cart.token, customer: null, contact: { name: "QA slip kpi", phone: "0899700001" }, address: { name: "QA", phone: "0899700001", line1: "1", subdistrict: "a", district: "b", province: "เชียงใหม่", postalCode: "50200", country: "TH" }, shippingMethodId: "01a14029-0a1d-76dc-8672-49f55d69cea6", paymentMethod: "slip", settings });
    if (!r.ok) throw new Error(r.error);
    await attachSlip(tx, t, r.value.paymentId, { url: "/uploads/qa/_qa-slip.png" }, { autoApprove: false });
    return r.value;
  });
  const [kpi] = await tt(t, (tx) => tx.select({ c: count() }).from(orders).where(and(eq(orders.tenantId, t), eq(orders.paymentStatus, "pending_verification"))));
  const [queue] = await tt(t, (tx) => tx.select({ c: count() }).from(payments).where(and(eq(payments.tenantId, t), eq(payments.refType, "order"), eq(payments.status, "pending_verification"))));
  const [ord] = await tt(t, (tx) => tx.select({ ps: orders.paymentStatus }).from(orders).where(eq(orders.id, o.orderId)));
  console.log(`order ${o.number} slip attached → order.paymentStatus=${ord!.ps}; dashboard KPI query (orders.payment_status='pending_verification') = ${kpi!.c}; payments awaiting verification = ${queue!.c}`);
  const c = await tt(t, (tx) => cancelOrderAdmin(tx, t, o.orderId, "QA cleanup", { userId: "00000000-0000-0000-0000-000000000000", actorType: "user" }));
  console.log("cleanup cancel", c.ok);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
