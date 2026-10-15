import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { categories, discounts, productVariants, products, shippingMethods, tenants, withTenant, type Tx } from "@rentweb/db";

export const SETTINGS = {
  payments: {
    promptpayId: "0812345678",
    promptpayName: "Test Shop",
    bankAccounts: [{ bank: "กสิกรไทย", name: "Test Shop จำกัด", number: "123-4-56789-0" }],
    enabled: { promptpay: true, bankTransfer: true, cod: true },
    autoApproveSlips: true,
  },
};

export interface Fixture {
  db: TestDb;
  tenantId: string;
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  ids: {
    apparel: string;
    home: string;
    simple: string; // ฿500, stock 5, 500 g
    variant: string; // hasVariants, S stock 2 / M stock 0
    variantS: string;
    variantM: string;
    service: string; // ฿300, not tracked
    soldOut: string; // stock 0
    shipFlat: string;
    shipWeight: string;
    shipFreeOver: string;
    shipCod: string;
    shipPickup: string;
  };
}

/** Fresh PGlite db with one tenant and a small catalog. */
export async function setupFixture(): Promise<Fixture> {
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: "shop-test", name: "Shop Test", siteType: "shop", status: "active", settings: SETTINGS }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

  const ids = await run(async (tx) => {
    const [apparel, home] = await tx
      .insert(categories)
      .values([
        { tenantId, name: "เสื้อผ้า", slug: "apparel", sort: 1 },
        { tenantId, name: "ของแต่งบ้าน", slug: "home", sort: 2 },
      ])
      .returning({ id: categories.id });

    const [simple, variant, service, soldOut] = await tx
      .insert(products)
      .values([
        { tenantId, name: "เสื้อยืด", slug: "tee", price: 50000, stock: 5, weightGrams: 500, status: "active", categoryId: apparel!.id, images: [{ url: "https://img/tee.jpg" }], publishedAt: new Date() },
        { tenantId, name: "เดรส", slug: "dress", price: 100000, hasVariants: true, options: [{ name: "ไซซ์", values: ["S", "M"] }], stock: 0, weightGrams: 300, status: "active", categoryId: home!.id, publishedAt: new Date() },
        { tenantId, name: "บริการห่อของขวัญ", slug: "gift-wrap", price: 30000, type: "service", trackInventory: false, stock: 0, weightGrams: 0, status: "active", publishedAt: new Date() },
        { tenantId, name: "ผ้าพันคอ", slug: "scarf", price: 20000, stock: 0, weightGrams: 100, status: "active", categoryId: apparel!.id, publishedAt: new Date() },
      ])
      .returning({ id: products.id });

    const [vs, vm] = await tx
      .insert(productVariants)
      .values([
        { tenantId, productId: variant!.id, title: "S", optionValues: { ไซซ์: "S" }, sku: "DRESS-S", price: 100000, stock: 2, position: 0 },
        { tenantId, productId: variant!.id, title: "M", optionValues: { ไซซ์: "M" }, sku: "DRESS-M", price: 110000, stock: 0, position: 1 },
      ])
      .returning({ id: productVariants.id });

    const [flat, weight, freeOver, cod, pickup] = await tx
      .insert(shippingMethods)
      .values([
        { tenantId, name: "Kerry", type: "flat", config: { amount: 6000 }, sort: 1 },
        { tenantId, name: "ไปรษณีย์ (ตามน้ำหนัก)", type: "weight", config: { tiers: [{ maxGrams: 1000, amount: 4000 }, { maxGrams: 3000, amount: 8000 }] }, sort: 2 },
        { tenantId, name: "Flash", type: "free_over", config: { amount: 5000, threshold: 99000 }, sort: 3 },
        { tenantId, name: "COD", type: "cod", config: { amount: 6000, fee: 3000 }, sort: 4 },
        { tenantId, name: "รับที่ร้าน", type: "pickup", config: { amount: 0 }, sort: 5 },
      ])
      .returning({ id: shippingMethods.id });

    await tx.insert(discounts).values([
      { tenantId, code: "WELCOME10", name: "ลด 10%", type: "percent", value: 10, minSubtotal: 50000, maxDiscount: 30000, perCustomerLimit: 1 },
      { tenantId, code: "FIXED50", type: "fixed", value: 5000 },
      { tenantId, code: "FREESHIP", type: "free_shipping", value: 0, minSubtotal: 59000 },
      { tenantId, code: "EXPIRED", type: "percent", value: 50, endsAt: new Date(Date.now() - 86_400_000) },
      { tenantId, code: "MAXED", type: "percent", value: 50, maxUses: 1, usedCount: 1 },
      { tenantId, code: "OFF", type: "percent", value: 50, active: false },
      { tenantId, code: "APPAREL20", type: "percent", value: 20, appliesTo: { categoryIds: [apparel!.id] } },
    ]);

    return {
      apparel: apparel!.id,
      home: home!.id,
      simple: simple!.id,
      variant: variant!.id,
      variantS: vs!.id,
      variantM: vm!.id,
      service: service!.id,
      soldOut: soldOut!.id,
      shipFlat: flat!.id,
      shipWeight: weight!.id,
      shipFreeOver: freeOver!.id,
      shipCod: cod!.id,
      shipPickup: pickup!.id,
    };
  });

  return { db, tenantId, run, ids };
}
