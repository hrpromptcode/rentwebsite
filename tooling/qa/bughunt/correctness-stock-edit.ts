/**
 * correctness bughunt – admin edits a product (e.g. price) while orders come in: the form's stale stock value
 * overwrites the live stock (lost update, no inventory movement).
 */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, count, products, tenants, inventoryMovements } from "@rentweb/db";
import { addCartItem, createOrderFromCart, getOrCreateCart } from "../../../packages/modules/commerce/src/services/index";
import { getAdminProduct, saveProduct } from "../../../packages/modules/commerce/src/admin/products";
import { productSchema } from "../../../packages/modules/commerce/src/admin/schemas";
import { toFormValues } from "../../../apps/admin/src/app/t/[slug]/products/form-values";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const settings = await tt(t, async (tx) => (await tx.select({ s: tenants.settings }).from(tenants).where(eq(tenants.id, t)))[0]!.s);
  const tag = Date.now().toString(36).slice(-5);
  const [p] = await tt(t, (tx) => tx.insert(products).values({ tenantId: t, name: `QA correctness edit ${tag}`, slug: `qa-cor-edit-${tag}`, status: "active", price: 20000, stock: 10, trackInventory: true, weightGrams: 100 }).returning({ id: products.id }));
  // 1) admin opens the edit form (stock 10)
  const loaded = (await tt(t, (tx) => getAdminProduct(tx, t, p!.id)))!;
  const form = toFormValues(loaded.product as any, loaded.variants as any, "");
  // 2) a customer buys 3 meanwhile
  const r = await tt(t, async (tx) => {
    const { cart } = await getOrCreateCart(tx, t, null);
    await addCartItem(tx, t, cart.id, { productId: p!.id, quantity: 3 });
    return createOrderFromCart(tx, t, { cartToken: cart.token, customer: null, contact: { name: "QA edit", phone: "0899800001" }, address: { name: "QA", phone: "0899800001", line1: "1", subdistrict: "a", district: "b", province: "เชียงใหม่", postalCode: "50200", country: "TH" }, shippingMethodId: "01a14029-0a1d-76dc-8672-49f55d69cea6", paymentMethod: "promptpay_qr", settings });
  });
  const mid = (await tt(t, (tx) => tx.select({ s: products.stock }).from(products).where(eq(products.id, p!.id))))[0]!.s;
  // 3) admin only changes the price and saves
  const parsed = productSchema.parse({ ...form, price: "199" });
  const s = await tt(t, (tx) => saveProduct(tx, t, p!.id, parsed, { userId: "00000000-0000-0000-0000-000000000000", actorType: "user" }));
  const end = (await tt(t, (tx) => tx.select({ s: products.stock, price: products.price }).from(products).where(eq(products.id, p!.id))))[0]!;
  const [mv] = await tt(t, (tx) => tx.select({ n: count() }).from(inventoryMovements).where(and(eq(inventoryMovements.tenantId, t), eq(inventoryMovements.productId, p!.id))));
  console.log(`form loaded with stock 10; order ${r.ok ? r.value.number : r.error} took 3 → stock ${mid}; admin saved price only (${s.ok}) → stock ${end.s}, price ${end.price}; inventory movements for product: ${mv!.n}`);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
