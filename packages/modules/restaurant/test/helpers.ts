import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { withTenant } from "@rentweb/db";
import { diningTables, menuCategories, menuItemModifierGroups, menuItems, menus, modifierGroups, modifiers, tenants, type Tx } from "@rentweb/db";

export interface Fixture {
  db: TestDb;
  tenantId: string;
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  ids: {
    menuId: string;
    satay: string; // extras only (optional, max 3)
    curry: string; // spicy (required) + extras
    tea: string; // sweetness (required)
    soldOut: string;
    spicyGroup: string;
    extraGroup: string;
    sweetGroup: string;
    spicyMild: string;
    spicyHot: string;
    extraEgg: string; // +15.00
    extraRice: string; // +20.00
    extraMeat: string; // +50.00
    sweetNormal: string;
    tables: Array<{ id: string; name: string; zone: string; qrToken: string }>;
  };
}

/** Fresh PGlite db with one tenant and a small menu (3 items, 3 modifier groups, 4 tables in 2 zones). */
export async function makeFixture(): Promise<Fixture> {
  const { db } = await createTestDb();
  const [t] = await db.insert(tenants).values({ slug: `rest-${Math.random().toString(36).slice(2, 8)}`, name: "Test Restaurant", siteType: "restaurant" }).returning({ id: tenants.id });
  const tenantId = t!.id;
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(db, tenantId, fn);

  const ids = await tx(async (tx) => {
    const [menu] = await tx.insert(menus).values({ tenantId, name: "เมนูหลัก", sort: 0 }).returning({ id: menus.id });
    const [starters, curries, drinks] = await tx
      .insert(menuCategories)
      .values([
        { tenantId, menuId: menu!.id, name: "ของทานเล่น", sort: 0 },
        { tenantId, menuId: menu!.id, name: "แกง", sort: 1 },
        { tenantId, menuId: menu!.id, name: "เครื่องดื่ม", sort: 2 },
      ])
      .returning({ id: menuCategories.id });
    const [spicy, extra, sweet] = await tx
      .insert(modifierGroups)
      .values([
        { tenantId, name: "ระดับความเผ็ด", minSelect: 1, maxSelect: 1, required: true, sort: 0 },
        { tenantId, name: "เพิ่มพิเศษ", minSelect: 0, maxSelect: 3, sort: 1 },
        { tenantId, name: "ระดับความหวาน", minSelect: 1, maxSelect: 1, required: true, sort: 2 },
      ])
      .returning({ id: modifierGroups.id });
    const mods = await tx
      .insert(modifiers)
      .values([
        { tenantId, groupId: spicy!.id, name: "เผ็ดน้อย", priceDelta: 0, sort: 0 },
        { tenantId, groupId: spicy!.id, name: "เผ็ดมาก", priceDelta: 0, sort: 1 },
        { tenantId, groupId: extra!.id, name: "ไข่ดาว", priceDelta: 1500, sort: 0 },
        { tenantId, groupId: extra!.id, name: "ข้าวสวย", priceDelta: 2000, sort: 1 },
        { tenantId, groupId: extra!.id, name: "เพิ่มเนื้อ", priceDelta: 5000, sort: 2 },
        { tenantId, groupId: sweet!.id, name: "หวานปกติ", priceDelta: 0, sort: 0 },
      ])
      .returning({ id: modifiers.id, name: modifiers.name });
    const mod = (n: string) => mods.find((m) => m.name === n)!.id;

    const [satay, curry, tea, soldOut] = await tx
      .insert(menuItems)
      .values([
        { tenantId, categoryId: starters!.id, name: "หมูสะเต๊ะ", nameEn: "Satay", price: 16000, featured: true, sort: 0, station: "kitchen" },
        { tenantId, categoryId: curries!.id, name: "แกงเขียวหวาน", nameEn: "Green Curry", price: 22000, featured: true, spicyLevel: 2, tags: ["แนะนำ", "เผ็ด"], sort: 1, station: "kitchen" },
        { tenantId, categoryId: drinks!.id, name: "ชาไทย", nameEn: "Thai Tea", price: 7000, sort: 2, station: "bar" },
        { tenantId, categoryId: starters!.id, name: "ของหมด", price: 9900, soldOut: true, sort: 3, station: "kitchen" },
      ])
      .returning({ id: menuItems.id });
    await tx.insert(menuItemModifierGroups).values([
      { tenantId, itemId: satay!.id, groupId: extra!.id, sort: 0 },
      { tenantId, itemId: curry!.id, groupId: spicy!.id, sort: 0 },
      { tenantId, itemId: curry!.id, groupId: extra!.id, sort: 1 },
      { tenantId, itemId: tea!.id, groupId: sweet!.id, sort: 0 },
    ]);
    const tables = await tx
      .insert(diningTables)
      .values([
        { tenantId, name: "A1", zone: "ในบ้าน", seats: 4, qrToken: "qr-a1", sort: 0 },
        { tenantId, name: "A2", zone: "ในบ้าน", seats: 4, qrToken: "qr-a2", sort: 1 },
        { tenantId, name: "G1", zone: "สวน", seats: 6, qrToken: "qr-g1", sort: 2 },
        { tenantId, name: "G2", zone: "สวน", seats: 6, qrToken: "qr-g2", sort: 3 },
      ])
      .returning({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, qrToken: diningTables.qrToken });
    return {
      menuId: menu!.id,
      satay: satay!.id,
      curry: curry!.id,
      tea: tea!.id,
      soldOut: soldOut!.id,
      spicyGroup: spicy!.id,
      extraGroup: extra!.id,
      sweetGroup: sweet!.id,
      spicyMild: mod("เผ็ดน้อย"),
      spicyHot: mod("เผ็ดมาก"),
      extraEgg: mod("ไข่ดาว"),
      extraRice: mod("ข้าวสวย"),
      extraMeat: mod("เพิ่มเนื้อ"),
      sweetNormal: mod("หวานปกติ"),
      tables: tables.map((t) => ({ id: t.id, name: t.name, zone: t.zone ?? "", qrToken: t.qrToken })),
    };
  });
  return { db, tenantId, tx, ids };
}

/** Unwraps a Result or throws with its error, for readable test failures. */
export function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${String(r.error)}`);
  return r.value;
}
