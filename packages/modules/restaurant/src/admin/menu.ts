import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { menuCategories, menuItemModifierGroups, menuItems, menus, modifierGroups, modifiers, type Tx } from "@rentweb/db";
import { fail, ok, type Result } from "@rentweb/core";

/* ────────────── menus ────────────── */

export interface MenuRow {
  id: string;
  name: string;
  active: boolean;
  sort: number;
  schedule: Array<{ weekdays: number[]; start: string; end: string }>;
  categories: number;
  items: number;
}

export async function listMenusAdmin(tx: Tx, tenantId: string): Promise<MenuRow[]> {
  const rows = await tx.select().from(menus).where(eq(menus.tenantId, tenantId)).orderBy(asc(menus.sort), asc(menus.createdAt));
  if (!rows.length) return [];
  const cats = await tx.select({ id: menuCategories.id, menuId: menuCategories.menuId }).from(menuCategories).where(eq(menuCategories.tenantId, tenantId));
  const catIds = cats.map((c) => c.id);
  const itemCounts = catIds.length
    ? await tx.select({ categoryId: menuItems.categoryId, n: count() }).from(menuItems).where(and(eq(menuItems.tenantId, tenantId), inArray(menuItems.categoryId, catIds))).groupBy(menuItems.categoryId)
    : [];
  const itemsByCat = new Map(itemCounts.map((r) => [r.categoryId, Number(r.n)]));
  return rows.map((m) => {
    const myCats = cats.filter((c) => c.menuId === m.id);
    return { id: m.id, name: m.name, active: m.active, sort: m.sort, schedule: m.schedule ?? [], categories: myCats.length, items: myCats.reduce((s, c) => s + (itemsByCat.get(c.id) ?? 0), 0) };
  });
}

export async function saveMenu(tx: Tx, tenantId: string, input: { id?: string | null; name: string; active: boolean; sort?: number }): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อเมนู", "name_required");
  if (input.id) {
    const [row] = await tx.update(menus).set({ name, active: input.active, ...(input.sort !== undefined ? { sort: input.sort } : {}) }).where(and(eq(menus.tenantId, tenantId), eq(menus.id, input.id))).returning({ id: menus.id });
    if (!row) return fail("ไม่พบเมนู", "not_found");
    return ok(row);
  }
  const [max] = await tx.select({ m: sql<number>`coalesce(max(${menus.sort}), -1)` }).from(menus).where(eq(menus.tenantId, tenantId));
  const [row] = await tx.insert(menus).values({ tenantId, name, active: input.active, sort: input.sort ?? Number(max?.m ?? -1) + 1 }).returning({ id: menus.id });
  return ok(row!);
}

export async function deleteMenu(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [n] = await tx.select({ c: count() }).from(menus).where(eq(menus.tenantId, tenantId));
  if (Number(n?.c ?? 0) <= 1) return fail("ต้องมีเมนูอย่างน้อย 1 รายการ", "last_menu");
  const [row] = await tx.delete(menus).where(and(eq(menus.tenantId, tenantId), eq(menus.id, id))).returning({ id: menus.id });
  if (!row) return fail("ไม่พบเมนู", "not_found");
  return ok(row);
}

/* ────────────── categories ────────────── */

export interface CategoryRow {
  id: string;
  menuId: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  image: string | null;
  sort: number;
  itemCount: number;
}

export async function listCategoriesAdmin(tx: Tx, tenantId: string, menuId: string): Promise<CategoryRow[]> {
  const cats = await tx.select().from(menuCategories).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.menuId, menuId))).orderBy(asc(menuCategories.sort), asc(menuCategories.name));
  if (!cats.length) return [];
  const counts = await tx
    .select({ categoryId: menuItems.categoryId, n: count() })
    .from(menuItems)
    .where(and(eq(menuItems.tenantId, tenantId), inArray(menuItems.categoryId, cats.map((c) => c.id))))
    .groupBy(menuItems.categoryId);
  const byCat = new Map(counts.map((r) => [r.categoryId, Number(r.n)]));
  return cats.map((c) => ({ id: c.id, menuId: c.menuId, name: c.name, nameEn: c.nameEn, description: c.description, image: c.image, sort: c.sort, itemCount: byCat.get(c.id) ?? 0 }));
}

export async function saveCategory(tx: Tx, tenantId: string, input: { id?: string | null; menuId: string; name: string; nameEn?: string | null; description?: string | null; image?: string | null; sort?: number }): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อหมวด", "name_required");
  const patch = { name, nameEn: input.nameEn?.trim() || null, description: input.description?.trim() || null, image: input.image?.trim() || null };
  if (input.id) {
    const [row] = await tx
      .update(menuCategories)
      .set({ ...patch, ...(input.sort !== undefined ? { sort: input.sort } : {}) })
      .where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.id, input.id)))
      .returning({ id: menuCategories.id });
    if (!row) return fail("ไม่พบหมวด", "not_found");
    return ok(row);
  }
  const [menu] = await tx.select({ id: menus.id }).from(menus).where(and(eq(menus.tenantId, tenantId), eq(menus.id, input.menuId))).limit(1);
  if (!menu) return fail("ไม่พบเมนู", "menu_not_found");
  const [max] = await tx.select({ m: sql<number>`coalesce(max(${menuCategories.sort}), -1)` }).from(menuCategories).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.menuId, input.menuId)));
  const [row] = await tx.insert(menuCategories).values({ tenantId, menuId: input.menuId, ...patch, sort: input.sort ?? Number(max?.m ?? -1) + 1 }).returning({ id: menuCategories.id });
  return ok(row!);
}

export async function deleteCategory(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [n] = await tx.select({ c: count() }).from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.categoryId, id)));
  if (Number(n?.c ?? 0) > 0) return fail(`หมวดนี้มี ${n!.c} รายการ กรุณาย้ายหรือลบรายการก่อน`, "has_items");
  const [row] = await tx.delete(menuCategories).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.id, id))).returning({ id: menuCategories.id });
  if (!row) return fail("ไม่พบหมวด", "not_found");
  return ok(row);
}

/** Persist a new order of categories (array of ids in display order). */
export async function reorderCategories(tx: Tx, tenantId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await tx.update(menuCategories).set({ sort: i }).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.id, ids[i]!)));
  }
}

/* ────────────── items ────────────── */

export interface ItemRow {
  id: string;
  categoryId: string;
  categoryName: string;
  menuId: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  tags: string[];
  allergens: string[];
  spicyLevel: number;
  prepMinutes: number | null;
  station: string;
  available: boolean;
  soldOut: boolean;
  featured: boolean;
  sort: number;
  modifierGroupIds: string[];
  modifierGroupNames: string[];
  updatedAt: string;
}

export interface ItemFilter {
  menuId?: string | null;
  categoryId?: string | null;
  q?: string | null;
  station?: string | null;
  flag?: "soldOut" | "hidden" | "featured" | null;
}

export async function listItemsAdmin(tx: Tx, tenantId: string, f: ItemFilter = {}): Promise<ItemRow[]> {
  const conds = [eq(menuItems.tenantId, tenantId)];
  if (f.menuId) conds.push(eq(menuCategories.menuId, f.menuId));
  if (f.categoryId) conds.push(eq(menuItems.categoryId, f.categoryId));
  if (f.station) conds.push(eq(menuItems.station, f.station));
  if (f.flag === "soldOut") conds.push(eq(menuItems.soldOut, true));
  if (f.flag === "hidden") conds.push(eq(menuItems.available, false));
  if (f.flag === "featured") conds.push(eq(menuItems.featured, true));
  const q = f.q?.trim();
  if (q) conds.push(or(ilike(menuItems.name, `%${q}%`), ilike(menuItems.nameEn, `%${q}%`), ilike(menuItems.description, `%${q}%`))!);
  const rows = await tx
    .select({ i: menuItems, categoryName: menuCategories.name, menuId: menuCategories.menuId, catSort: menuCategories.sort })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(and(...conds))
    .orderBy(asc(menuCategories.sort), asc(menuItems.sort), asc(menuItems.name));
  if (!rows.length) return [];
  const links = await tx
    .select({ itemId: menuItemModifierGroups.itemId, groupId: menuItemModifierGroups.groupId, name: modifierGroups.name, sort: menuItemModifierGroups.sort })
    .from(menuItemModifierGroups)
    .innerJoin(modifierGroups, eq(modifierGroups.id, menuItemModifierGroups.groupId))
    .where(and(eq(menuItemModifierGroups.tenantId, tenantId), inArray(menuItemModifierGroups.itemId, rows.map((r) => r.i.id))))
    .orderBy(asc(menuItemModifierGroups.sort));
  return rows.map(({ i, categoryName, menuId }) => {
    const mine = links.filter((l) => l.itemId === i.id);
    return {
      id: i.id,
      categoryId: i.categoryId,
      categoryName,
      menuId,
      name: i.name,
      nameEn: i.nameEn,
      description: i.description,
      image: i.image,
      price: i.price,
      compareAtPrice: i.compareAtPrice,
      tags: i.tags ?? [],
      allergens: i.allergens ?? [],
      spicyLevel: i.spicyLevel,
      prepMinutes: i.prepMinutes,
      station: i.station,
      available: i.available,
      soldOut: i.soldOut,
      featured: i.featured,
      sort: i.sort,
      modifierGroupIds: mine.map((l) => l.groupId),
      modifierGroupNames: mine.map((l) => l.name),
      updatedAt: i.updatedAt.toISOString(),
    };
  });
}

export async function getItemAdmin(tx: Tx, tenantId: string, id: string): Promise<ItemRow | null> {
  const [row] = await tx
    .select({ i: menuItems, categoryName: menuCategories.name, menuId: menuCategories.menuId })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)))
    .limit(1);
  if (!row) return null;
  const links = await tx
    .select({ groupId: menuItemModifierGroups.groupId, name: modifierGroups.name })
    .from(menuItemModifierGroups)
    .innerJoin(modifierGroups, eq(modifierGroups.id, menuItemModifierGroups.groupId))
    .where(and(eq(menuItemModifierGroups.tenantId, tenantId), eq(menuItemModifierGroups.itemId, id)))
    .orderBy(asc(menuItemModifierGroups.sort));
  const { i } = row;
  return {
    id: i.id,
    categoryId: i.categoryId,
    categoryName: row.categoryName,
    menuId: row.menuId,
    name: i.name,
    nameEn: i.nameEn,
    description: i.description,
    image: i.image,
    price: i.price,
    compareAtPrice: i.compareAtPrice,
    tags: i.tags ?? [],
    allergens: i.allergens ?? [],
    spicyLevel: i.spicyLevel,
    prepMinutes: i.prepMinutes,
    station: i.station,
    available: i.available,
    soldOut: i.soldOut,
    featured: i.featured,
    sort: i.sort,
    modifierGroupIds: links.map((l) => l.groupId),
    modifierGroupNames: links.map((l) => l.name),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export interface SaveItemInput {
  id?: string | null;
  categoryId: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  image?: string | null;
  price: number;
  compareAtPrice?: number | null;
  tags: string[];
  allergens: string[];
  spicyLevel: number;
  prepMinutes?: number | null;
  station: string;
  available: boolean;
  soldOut: boolean;
  featured: boolean;
  sort?: number;
  modifierGroupIds: string[];
}

export async function saveItem(tx: Tx, tenantId: string, input: SaveItemInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อเมนู", "name_required");
  if (!Number.isInteger(input.price) || input.price < 0) return fail("ราคาไม่ถูกต้อง", "invalid_price");
  const [cat] = await tx.select({ id: menuCategories.id }).from(menuCategories).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.id, input.categoryId))).limit(1);
  if (!cat) return fail("ไม่พบหมวด", "category_not_found");
  const groupIds = [...new Set(input.modifierGroupIds)];
  if (groupIds.length) {
    const found = await tx.select({ id: modifierGroups.id }).from(modifierGroups).where(and(eq(modifierGroups.tenantId, tenantId), inArray(modifierGroups.id, groupIds)));
    if (found.length !== groupIds.length) return fail("กลุ่มตัวเลือกบางรายการไม่ถูกต้อง", "group_not_found");
    // discount options must never push the dish below ฿0 (COR-25)
    const worst = await worstDiscount(tx, tenantId, groupIds);
    if (input.price + worst < 0) return fail(`ราคาเมนูต้องไม่น้อยกว่าส่วนลดของตัวเลือก (${thbText(-worst)})`, "negative_total");
  }
  const values = {
    categoryId: input.categoryId,
    name,
    nameEn: input.nameEn?.trim() || null,
    description: input.description?.trim() || null,
    image: input.image?.trim() || null,
    price: input.price,
    compareAtPrice: input.compareAtPrice && input.compareAtPrice > 0 ? input.compareAtPrice : null,
    tags: [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    allergens: [...new Set(input.allergens.map((t) => t.trim()).filter(Boolean))],
    spicyLevel: Math.max(0, Math.min(5, Math.round(input.spicyLevel))),
    prepMinutes: input.prepMinutes && input.prepMinutes > 0 ? Math.round(input.prepMinutes) : null,
    station: input.station,
    available: input.available,
    soldOut: input.soldOut,
    featured: input.featured,
  };
  let id = input.id ?? null;
  if (id) {
    const [row] = await tx
      .update(menuItems)
      .set({ ...values, ...(input.sort !== undefined ? { sort: input.sort } : {}) })
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)))
      .returning({ id: menuItems.id });
    if (!row) return fail("ไม่พบเมนู", "not_found");
    await tx.delete(menuItemModifierGroups).where(and(eq(menuItemModifierGroups.tenantId, tenantId), eq(menuItemModifierGroups.itemId, id)));
  } else {
    const [max] = await tx.select({ m: sql<number>`coalesce(max(${menuItems.sort}), -1)` }).from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.categoryId, input.categoryId)));
    const [row] = await tx.insert(menuItems).values({ tenantId, ...values, sort: input.sort ?? Number(max?.m ?? -1) + 1 }).returning({ id: menuItems.id });
    id = row!.id;
  }
  if (groupIds.length) await tx.insert(menuItemModifierGroups).values(groupIds.map((groupId, i) => ({ tenantId, itemId: id!, groupId, sort: i })));
  return ok({ id });
}

export async function deleteItem(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [row] = await tx.delete(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id))).returning({ id: menuItems.id });
  if (!row) return fail("ไม่พบเมนู", "not_found");
  return ok(row);
}

export type ItemFlag = "available" | "soldOut" | "featured";

export async function setItemFlag(tx: Tx, tenantId: string, id: string, flag: ItemFlag, value: boolean): Promise<Result<{ id: string; flag: ItemFlag; value: boolean }>> {
  const [row] = await tx.update(menuItems).set({ [flag]: value }).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id))).returning({ id: menuItems.id });
  if (!row) return fail("ไม่พบเมนู", "not_found");
  return ok({ id, flag, value });
}

export async function reorderItems(tx: Tx, tenantId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await tx.update(menuItems).set({ sort: i }).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, ids[i]!)));
  }
}

/* ────────────── modifier groups ────────────── */

export interface ModifierRowAdmin {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  available: boolean;
  sort: number;
}

export interface ModifierGroupRow {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  sort: number;
  modifiers: ModifierRowAdmin[];
  usedBy: number;
}

export async function listModifierGroupsAdmin(tx: Tx, tenantId: string): Promise<ModifierGroupRow[]> {
  const groups = await tx.select().from(modifierGroups).where(eq(modifierGroups.tenantId, tenantId)).orderBy(asc(modifierGroups.sort), asc(modifierGroups.name));
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);
  const mods = await tx.select().from(modifiers).where(and(eq(modifiers.tenantId, tenantId), inArray(modifiers.groupId, ids))).orderBy(asc(modifiers.sort), asc(modifiers.name));
  const usage = await tx.select({ groupId: menuItemModifierGroups.groupId, n: count() }).from(menuItemModifierGroups).where(and(eq(menuItemModifierGroups.tenantId, tenantId), inArray(menuItemModifierGroups.groupId, ids))).groupBy(menuItemModifierGroups.groupId);
  const used = new Map(usage.map((u) => [u.groupId, Number(u.n)]));
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    required: g.required,
    sort: g.sort,
    modifiers: mods.filter((m) => m.groupId === g.id).map((m) => ({ id: m.id, groupId: m.groupId, name: m.name, priceDelta: m.priceDelta, available: m.available, sort: m.sort })),
    usedBy: used.get(g.id) ?? 0,
  }));
}

export async function saveModifierGroup(tx: Tx, tenantId: string, input: { id?: string | null; name: string; minSelect: number; maxSelect: number; required: boolean; sort?: number }): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อกลุ่มตัวเลือก", "name_required");
  const minSelect = Math.max(0, Math.round(input.minSelect));
  const maxSelect = Math.max(1, Math.round(input.maxSelect));
  if (minSelect > maxSelect) return fail("จำนวนขั้นต่ำต้องไม่เกินจำนวนสูงสุด", "min_gt_max");
  const required = input.required || minSelect > 0;
  const patch = { name, minSelect: required ? Math.max(1, minSelect) : minSelect, maxSelect, required };
  if (input.id) {
    const [row] = await tx.update(modifierGroups).set({ ...patch, ...(input.sort !== undefined ? { sort: input.sort } : {}) }).where(and(eq(modifierGroups.tenantId, tenantId), eq(modifierGroups.id, input.id))).returning({ id: modifierGroups.id });
    if (!row) return fail("ไม่พบกลุ่มตัวเลือก", "not_found");
    return ok(row);
  }
  const [max] = await tx.select({ m: sql<number>`coalesce(max(${modifierGroups.sort}), -1)` }).from(modifierGroups).where(eq(modifierGroups.tenantId, tenantId));
  const [row] = await tx.insert(modifierGroups).values({ tenantId, ...patch, sort: input.sort ?? Number(max?.m ?? -1) + 1 }).returning({ id: modifierGroups.id });
  return ok(row!);
}

export async function deleteModifierGroup(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [row] = await tx.delete(modifierGroups).where(and(eq(modifierGroups.tenantId, tenantId), eq(modifierGroups.id, id))).returning({ id: modifierGroups.id });
  if (!row) return fail("ไม่พบกลุ่มตัวเลือก", "not_found");
  return ok(row);
}

const thbText = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
/** largest possible discount (≤ 0, satang) the groups' negative options can add to one dish: per group the `maxSelect` most negative deltas */
async function worstDiscount(tx: Tx, tenantId: string, groupIds: string[], override?: { id?: string | null; groupId: string; priceDelta: number }): Promise<number> {
  if (!groupIds.length) return 0;
  const groups = await tx.select({ id: modifierGroups.id, maxSelect: modifierGroups.maxSelect }).from(modifierGroups).where(and(eq(modifierGroups.tenantId, tenantId), inArray(modifierGroups.id, groupIds)));
  const mods = await tx.select({ id: modifiers.id, groupId: modifiers.groupId, priceDelta: modifiers.priceDelta }).from(modifiers).where(and(eq(modifiers.tenantId, tenantId), inArray(modifiers.groupId, groupIds)));
  const list = override ? [...mods.filter((m) => m.id !== override.id), { id: override.id ?? "new", groupId: override.groupId, priceDelta: override.priceDelta }] : mods;
  let worst = 0;
  for (const g of groups) {
    const neg = list.filter((m) => m.groupId === g.id && m.priceDelta < 0).map((m) => m.priceDelta).sort((a, b) => a - b);
    worst += neg.slice(0, Math.max(1, g.maxSelect)).reduce((s, d) => s + d, 0);
  }
  return worst;
}

export const MAX_PRICE_DELTA = 100_000_00; // ฿100,000 (same bound as the admin form)

export async function saveModifier(tx: Tx, tenantId: string, input: { id?: string | null; groupId: string; name: string; priceDelta: number; available: boolean; sort?: number }): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail("กรุณากรอกชื่อตัวเลือก", "name_required");
  if (!Number.isInteger(input.priceDelta) || Math.abs(input.priceDelta) > MAX_PRICE_DELTA) return fail("ราคาเพิ่มไม่ถูกต้อง", "invalid_price");
  const [group] = await tx.select({ id: modifierGroups.id }).from(modifierGroups).where(and(eq(modifierGroups.tenantId, tenantId), eq(modifierGroups.id, input.groupId))).limit(1);
  if (!group) return fail("ไม่พบกลุ่มตัวเลือก", "group_not_found");
  if (input.priceDelta < 0) {
    // a discount option may not exceed the price of any dish that uses the group (COR-25)
    const items = await tx
      .select({ name: menuItems.name, price: menuItems.price, groupId: menuItemModifierGroups.groupId, itemId: menuItems.id })
      .from(menuItemModifierGroups)
      .innerJoin(menuItems, and(eq(menuItems.tenantId, menuItemModifierGroups.tenantId), eq(menuItems.id, menuItemModifierGroups.itemId)))
      .where(and(eq(menuItemModifierGroups.tenantId, tenantId), eq(menuItemModifierGroups.groupId, input.groupId)));
    for (const it of items) {
      const links = await tx.select({ groupId: menuItemModifierGroups.groupId }).from(menuItemModifierGroups).where(and(eq(menuItemModifierGroups.tenantId, tenantId), eq(menuItemModifierGroups.itemId, it.itemId)));
      const worst = await worstDiscount(tx, tenantId, links.map((l) => l.groupId), { id: input.id, groupId: input.groupId, priceDelta: input.priceDelta });
      if (it.price + worst < 0) return fail(`ส่วนลดของตัวเลือกทำให้ "${it.name}" (${thbText(it.price)}) ติดลบ ลดได้ไม่เกินราคาเมนู`, "negative_total");
    }
  }
  const patch = { name, priceDelta: input.priceDelta, available: input.available };
  if (input.id) {
    const [row] = await tx.update(modifiers).set({ ...patch, ...(input.sort !== undefined ? { sort: input.sort } : {}) }).where(and(eq(modifiers.tenantId, tenantId), eq(modifiers.id, input.id), eq(modifiers.groupId, input.groupId))).returning({ id: modifiers.id });
    if (!row) return fail("ไม่พบตัวเลือก", "not_found");
    return ok(row);
  }
  const [max] = await tx.select({ m: sql<number>`coalesce(max(${modifiers.sort}), -1)` }).from(modifiers).where(and(eq(modifiers.tenantId, tenantId), eq(modifiers.groupId, input.groupId)));
  const [row] = await tx.insert(modifiers).values({ tenantId, groupId: input.groupId, ...patch, sort: input.sort ?? Number(max?.m ?? -1) + 1 }).returning({ id: modifiers.id });
  return ok(row!);
}

export async function deleteModifier(tx: Tx, tenantId: string, id: string): Promise<Result<{ id: string }>> {
  const [row] = await tx.delete(modifiers).where(and(eq(modifiers.tenantId, tenantId), eq(modifiers.id, id))).returning({ id: modifiers.id });
  if (!row) return fail("ไม่พบตัวเลือก", "not_found");
  return ok(row);
}

/** Most recently updated items (for a "recent changes" hint). */
export async function recentItemChanges(tx: Tx, tenantId: string, limit = 5) {
  return tx.select({ id: menuItems.id, name: menuItems.name, updatedAt: menuItems.updatedAt }).from(menuItems).where(eq(menuItems.tenantId, tenantId)).orderBy(desc(menuItems.updatedAt)).limit(limit);
}
