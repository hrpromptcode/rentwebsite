/** correctness bughunt – guest checkout with a NEW phone but an e-mail that already belongs to another customer. */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { eq, tenants } from "@rentweb/db";
import { addCartItem, createOrderFromCart, getOrCreateCart } from "../../../packages/modules/commerce/src/services/index";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const email = `qa.cor.${Date.now().toString(36)}@example.com`;
  const place = (phone: string) =>
    tt(t, async (tx) => {
      const { cart } = await getOrCreateCart(tx, t, null);
      await addCartItem(tx, t, cart.id, { productId: "01a14029-0996-762b-99c5-f1ccda07f220", quantity: 1 });
      return createOrderFromCart(tx, t, { cartToken: cart.token, customer: null, contact: { name: "QA email reuse", phone, email }, address: { name: "QA", phone, line1: "1", subdistrict: "a", district: "b", province: "เชียงใหม่", postalCode: "50200", country: "TH" }, shippingMethodId: "01a14029-0a1d-76dc-8672-49f55d69cea6", paymentMethod: "promptpay_qr", settings });
    }).then((r) => (r.ok ? `ok ${r.value.number}` : `fail ${r.code}`), (e) => `THROW ${String(e.cause?.message ?? e.message).slice(0, 160)}`);
  const s = String(Date.now()).slice(-4);
  console.log("first order  phone 08996" + s + "1 + email:", await place(`08996${s}1`));
  console.log("second order phone 08996" + s + "2 + same email:", await place(`08996${s}2`));
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
