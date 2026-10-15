import { z } from "zod";

/**
 * Pure cart codec shared by the client (cookie) and the server (validation).
 * No database imports here so client components can bundle it.
 */

/** Cookie holding the stateless client cart (JSON, URL-encoded). */
export const CART_COOKIE = "rw_rcart";
export const CART_MAX_LINES = 40;

export const cartItemSchema = z.object({
  menuItemId: z.uuid(),
  qty: z.number().int().min(1).max(50),
  modifierIds: z.array(z.uuid()).max(20).default([]),
  note: z.string().trim().max(200).optional(),
});
export const cartSchema = z.array(cartItemSchema).max(CART_MAX_LINES);

export type CartItem = z.infer<typeof cartItemSchema>;

/** Tolerant parse of the cookie / form value: invalid input -> empty cart. */
export function parseCart(raw: string | null | undefined): CartItem[] {
  if (!raw) return [];
  try {
    const decoded = raw.startsWith("[") ? raw : decodeURIComponent(raw);
    const r = cartSchema.safeParse(JSON.parse(decoded));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

export function serializeCart(items: CartItem[]): string {
  return encodeURIComponent(JSON.stringify(items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, modifierIds: [...i.modifierIds].sort(), ...(i.note ? { note: i.note } : {}) }))));
}

/** Stable key for merging identical lines (same item + same modifiers + same note). */
export function cartLineKey(item: Pick<CartItem, "menuItemId" | "modifierIds" | "note">): string {
  return `${item.menuItemId}|${[...item.modifierIds].sort().join(",")}|${item.note?.trim() ?? ""}`;
}

/** Merge duplicates and drop zero quantities. */
export function normalizeCart(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of items) {
    if (it.qty <= 0) continue;
    const key = cartLineKey(it);
    const cur = map.get(key);
    if (cur) cur.qty = Math.min(50, cur.qty + it.qty);
    else map.set(key, { ...it, modifierIds: [...it.modifierIds].sort(), note: it.note?.trim() || undefined });
  }
  return [...map.values()];
}
