/** correctness bughunt – storefront checkout accepts payment methods the tenant disabled (demo-shop: card=false, cash=false). */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { eq, tenants } from "@rentweb/db";
import { enabledMethods } from "@rentweb/core/payments";
import { addCartItem, createOrderFromCart, getOrCreateCart } from "../../../packages/modules/commerce/src/services/index";
import { cancelOrderAdmin } from "../../../packages/modules/commerce/src/admin/orders";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  console.log("enabledMethods(demo-shop) =", enabledMethods(settings));
  for (const pm of ["card", "cash"] as const) {
    const r = await tt(t, async (tx) => {
      const { cart } = await getOrCreateCart(tx, t, null);
      await addCartItem(tx, t, cart.id, { productId: "01a14029-0996-762b-99c5-f1ccda07f220", quantity: 1 });
      return createOrderFromCart(tx, t, { cartToken: cart.token, customer: null, contact: { name: "QA method", phone: "0899400001" }, address: { name: "QA", phone: "0899400001", line1: "1", subdistrict: "a", district: "b", province: "เชียงใหม่", postalCode: "50200", country: "TH" }, shippingMethodId: "01a14029-0a1d-76dc-8672-49f55d69cea6", paymentMethod: pm, settings });
    });
    console.log("checkout with", pm, "→", r.ok ? `ok ${r.value.number} payment ${r.value.paymentId}` : `fail ${r.code}`);
    if (r.ok) {
      const c = await tt(t, (tx) => cancelOrderAdmin(tx, t, r.value.orderId, "QA cleanup", { userId: "00000000-0000-0000-0000-000000000000", actorType: "user" }));
      console.log("  cleanup cancel", c.ok);
    }
  }
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
