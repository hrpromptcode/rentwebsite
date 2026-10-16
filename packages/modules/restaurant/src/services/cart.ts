import { and, eq, inArray } from "drizzle-orm";
import { menuItems, type Tx } from "@rentweb/db";
import { fail, ok, percentOf, type Result } from "@rentweb/core";
import { loadModifierGroupsFor, type ModifierGroupData } from "./menu";

export { CART_COOKIE, CART_MAX_LINES, cartItemSchema, cartSchema, parseCart, serializeCart, cartLineKey, normalizeCart, type CartItem } from "./cart-codec";
import { normalizeCart, cartLineKey, type CartItem } from "./cart-codec";

export interface PricedModifier {
  id: string;
  group: string;
  name: string;
  priceDelta: number;
}

export interface PricedLine {
  key: string;
  menuItemId: string;
  name: string;
  nameEn: string | null;
  image: string | null;
  station: string;
  qty: number;
  /** base price + modifier deltas (satang) */
  unitPrice: number;
  basePrice: number;
  modifiers: PricedModifier[];
  note: string | null;
  lineTotal: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  serviceChargePercent: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
}

export interface PriceCartOptions {
  serviceChargePercent?: number;
  deliveryFee?: number;
}

/** Validates a modifier selection against the item's groups. Returns an error message or null. */
export function validateSelection(groups: ModifierGroupData[], modifierIds: string[]): { error: string; code: string } | null {
  const known = new Map<string, { group: ModifierGroupData; mod: ModifierGroupData["modifiers"][number] }>();
  for (const g of groups) for (const m of g.modifiers) known.set(m.id, { group: g, mod: m });
  const seen = new Set<string>();
  for (const id of modifierIds) {
    const hit = known.get(id);
    if (!hit || !hit.mod.available) return { error: "ตัวเลือกไม่ถูกต้องหรือหมดชั่วคราว", code: "invalid_modifier" };
    if (seen.has(id)) return { error: "เลือกตัวเลือกซ้ำ", code: "duplicate_modifier" };
    seen.add(id);
  }
  for (const g of groups) {
    const count = g.modifiers.filter((m) => seen.has(m.id)).length;
    const min = Math.max(g.minSelect, g.required ? 1 : 0);
    if (count < min) return { error: `กรุณาเลือก${g.name}`, code: "modifier_required" };
    if (g.maxSelect > 0 && count > g.maxSelect) return { error: `เลือก${g.name}ได้สูงสุด ${g.maxSelect} อย่าง`, code: "modifier_max" };
  }
  return null;
}

/**
 * Server-side pricing of a client cart. Every price comes from the database, never from the client.
 * Fails (Result) on unknown / sold-out items or invalid modifier selections.
 */
export async function priceCart(tx: Tx, tenantId: string, items: CartItem[], opts: PriceCartOptions = {}): Promise<Result<PricedCart>> {
  const normalized = normalizeCart(items);
  if (!normalized.length) return fail("ยังไม่มีรายการในออเดอร์", "empty");
  const ids = [...new Set(normalized.map((i) => i.menuItemId))];
  const rows = await tx.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), inArray(menuItems.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groupsByItem = await loadModifierGroupsFor(tx, tenantId, ids);

  const lines: PricedLine[] = [];
  for (const it of normalized) {
    const row = byId.get(it.menuItemId);
    if (!row || !row.available) return fail("มีเมนูที่ไม่พร้อมให้บริการแล้ว กรุณาลบออกจากออเดอร์", "unavailable");
    if (row.soldOut) return fail(`${row.name} หมดชั่วคราว`, "sold_out");
    const groups = groupsByItem.get(row.id) ?? [];
    const problem = validateSelection(groups, it.modifierIds);
    if (problem) return fail(`${row.name}: ${problem.error}`, problem.code);
    const mods: PricedModifier[] = [];
    for (const g of groups) for (const m of g.modifiers) if (it.modifierIds.includes(m.id)) mods.push({ id: m.id, group: g.name, name: m.name, priceDelta: m.priceDelta });
    // a discount modifier ("ไม่เอาข้าว -10") can never make a line negative (COR-25)
    const unitPrice = Math.max(0, row.price + mods.reduce((s, m) => s + m.priceDelta, 0));
    lines.push({
      key: cartLineKey(it),
      menuItemId: row.id,
      name: row.name,
      nameEn: row.nameEn,
      image: row.image,
      station: row.station,
      qty: it.qty,
      unitPrice,
      basePrice: row.price,
      modifiers: mods,
      note: it.note?.trim() || null,
      lineTotal: unitPrice * it.qty,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const serviceChargePercent = Math.max(0, opts.serviceChargePercent ?? 0);
  const serviceCharge = percentOf(subtotal, serviceChargePercent);
  const deliveryFee = Math.max(0, opts.deliveryFee ?? 0);
  return ok({ lines, subtotal, serviceChargePercent, serviceCharge, deliveryFee, total: Math.max(0, subtotal + serviceCharge + deliveryFee) });
}
