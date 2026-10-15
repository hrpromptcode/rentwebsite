import { and, asc, eq, inArray } from "drizzle-orm";
import { menuCategories, menuItemModifierGroups, menuItems, menus, modifierGroups, modifiers, type Tx } from "@rentweb/db";
import { isMenuOpen, type MenuSchedule } from "./time";

export interface ModifierData {
  id: string;
  name: string;
  priceDelta: number;
  available: boolean;
}

export interface ModifierGroupData {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  modifiers: ModifierData[];
}

export interface MenuItemData {
  id: string;
  categoryId: string;
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
  modifierGroups: ModifierGroupData[];
}

export interface MenuCategoryData {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  image: string | null;
  items: MenuItemData[];
}

export interface MenuData {
  id: string;
  name: string;
  categories: MenuCategoryData[];
  featured: MenuItemData[];
}

/** Loads modifier groups (+ available modifiers) for a set of item ids, keyed by item id. */
export async function loadModifierGroupsFor(tx: Tx, tenantId: string, itemIds: string[]): Promise<Map<string, ModifierGroupData[]>> {
  const out = new Map<string, ModifierGroupData[]>();
  if (!itemIds.length) return out;
  const links = await tx
    .select()
    .from(menuItemModifierGroups)
    .where(and(eq(menuItemModifierGroups.tenantId, tenantId), inArray(menuItemModifierGroups.itemId, itemIds)))
    .orderBy(asc(menuItemModifierGroups.sort));
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  if (!groupIds.length) return out;
  const groups = await tx.select().from(modifierGroups).where(and(eq(modifierGroups.tenantId, tenantId), inArray(modifierGroups.id, groupIds))).orderBy(asc(modifierGroups.sort));
  const mods = await tx
    .select()
    .from(modifiers)
    .where(and(eq(modifiers.tenantId, tenantId), inArray(modifiers.groupId, groupIds), eq(modifiers.available, true)))
    .orderBy(asc(modifiers.sort));
  const byGroup = new Map<string, ModifierGroupData>();
  for (const g of groups) {
    byGroup.set(g.id, {
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      required: g.required,
      modifiers: mods.filter((m) => m.groupId === g.id).map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta, available: m.available })),
    });
  }
  for (const l of links) {
    const g = byGroup.get(l.groupId);
    if (!g) continue;
    const list = out.get(l.itemId) ?? [];
    list.push(g);
    out.set(l.itemId, list);
  }
  return out;
}

function toItemData(row: typeof menuItems.$inferSelect, groups: ModifierGroupData[]): MenuItemData {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    nameEn: row.nameEn,
    description: row.description,
    image: row.image,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    tags: row.tags ?? [],
    allergens: row.allergens ?? [],
    spicyLevel: row.spicyLevel,
    prepMinutes: row.prepMinutes,
    station: row.station,
    available: row.available,
    soldOut: row.soldOut,
    featured: row.featured,
    modifierGroups: groups,
  };
}

/** Picks the menu that is on right now (schedule in Asia/Bangkok); falls back to the first active menu. */
export async function getActiveMenuRow(tx: Tx, tenantId: string, now = new Date()) {
  const rows = await tx.select().from(menus).where(and(eq(menus.tenantId, tenantId), eq(menus.active, true))).orderBy(asc(menus.sort));
  if (!rows.length) return null;
  return rows.find((m) => isMenuOpen((m.schedule ?? []) as MenuSchedule, now)) ?? rows[0]!;
}

/** Active menu with categories, available items (sold-out items included but flagged) and modifier groups. */
export async function getActiveMenu(tx: Tx, tenantId: string, now = new Date()): Promise<MenuData | null> {
  const menu = await getActiveMenuRow(tx, tenantId, now);
  if (!menu) return null;
  const cats = await tx.select().from(menuCategories).where(and(eq(menuCategories.tenantId, tenantId), eq(menuCategories.menuId, menu.id))).orderBy(asc(menuCategories.sort));
  const catIds = cats.map((c) => c.id);
  const items = catIds.length
    ? await tx
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.tenantId, tenantId), inArray(menuItems.categoryId, catIds), eq(menuItems.available, true)))
        .orderBy(asc(menuItems.sort))
    : [];
  const groups = await loadModifierGroupsFor(
    tx,
    tenantId,
    items.map((i) => i.id),
  );
  const data = items.map((i) => toItemData(i, groups.get(i.id) ?? []));
  const categories: MenuCategoryData[] = cats
    .map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, description: c.description, image: c.image, items: data.filter((i) => i.categoryId === c.id) }))
    .filter((c) => c.items.length > 0);
  return { id: menu.id, name: menu.name, categories, featured: data.filter((i) => i.featured && !i.soldOut) };
}

/** Single item with its modifier groups (any menu). */
export async function getMenuItem(tx: Tx, tenantId: string, itemId: string): Promise<MenuItemData | null> {
  const [row] = await tx.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, itemId))).limit(1);
  if (!row) return null;
  const groups = await loadModifierGroupsFor(tx, tenantId, [row.id]);
  return toItemData(row, groups.get(row.id) ?? []);
}

/** Featured (recommended) items of the active menu, for the menu-highlight section. */
export async function listFeaturedItems(tx: Tx, tenantId: string, limit = 6, now = new Date()): Promise<MenuItemData[]> {
  const menu = await getActiveMenu(tx, tenantId, now);
  if (!menu) return [];
  const all = menu.categories.flatMap((c) => c.items);
  const featured = all.filter((i) => i.featured && !i.soldOut);
  const list = featured.length ? featured : all.filter((i) => !i.soldOut);
  return list.slice(0, limit);
}
