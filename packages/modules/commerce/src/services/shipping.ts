import { and, asc, eq } from "drizzle-orm";
import { shippingMethods, type Tx } from "@rentweb/db";

export type ShippingMethodRow = typeof shippingMethods.$inferSelect;

export interface ShippingQuoteInput {
  /** satang, after item discounts */
  subtotal: number;
  /** total parcel weight (weightGrams × qty) */
  weightGrams: number;
  /** a free_shipping coupon is applied */
  freeShipping?: boolean;
}

export interface ShippingQuote {
  id: string;
  name: string;
  description: string | null;
  type: string;
  estimatedDays: string | null;
  /** shipping fee in satang (0 when free) */
  amount: number;
  /** extra COD handling fee (cod type only) */
  codFee: number;
  /** amount + codFee */
  total: number;
  /** cod method forces the "cod" payment method */
  requiresCod: boolean;
  isPickup: boolean;
}

type Tier = { maxGrams: number; amount: number };

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/**
 * Pure quote for one method. Returns null when the method cannot ship this cart
 * (e.g. heavier than every weight tier).
 */
export function quoteMethod(m: Pick<ShippingMethodRow, "type" | "config">, input: ShippingQuoteInput): { amount: number; codFee: number } | null {
  const cfg = (m.config ?? {}) as Record<string, unknown>;
  let amount: number;
  let codFee = 0;
  switch (m.type) {
    case "pickup":
      amount = 0;
      break;
    case "flat":
      amount = num(cfg.amount);
      break;
    case "weight": {
      const tiers = (Array.isArray(cfg.tiers) ? (cfg.tiers as Tier[]) : [])
        .map((t) => ({ maxGrams: num(t.maxGrams), amount: num(t.amount) }))
        .sort((a, b) => a.maxGrams - b.maxGrams);
      const tier = tiers.find((t) => input.weightGrams <= t.maxGrams);
      if (!tier) return null;
      amount = tier.amount;
      break;
    }
    case "free_over": {
      const threshold = num(cfg.threshold);
      amount = input.subtotal >= threshold ? 0 : num(cfg.amount);
      break;
    }
    case "cod":
      amount = num(cfg.amount);
      codFee = num(cfg.fee);
      break;
    default:
      amount = num(cfg.amount);
  }
  if (input.freeShipping) amount = 0;
  return { amount: Math.max(0, amount), codFee: Math.max(0, codFee) };
}

export function toQuote(m: ShippingMethodRow, input: ShippingQuoteInput): ShippingQuote | null {
  const q = quoteMethod(m, input);
  if (!q) return null;
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    type: m.type,
    estimatedDays: m.estimatedDays,
    amount: q.amount,
    codFee: q.codFee,
    total: q.amount + q.codFee,
    requiresCod: m.type === "cod",
    isPickup: m.type === "pickup",
  };
}

/** Quotes every active shipping method for the cart (unavailable ones are omitted). */
export async function quoteShipping(tx: Tx, tenantId: string, input: ShippingQuoteInput): Promise<ShippingQuote[]> {
  const rows = await tx
    .select()
    .from(shippingMethods)
    .where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.active, true)))
    .orderBy(asc(shippingMethods.sort), asc(shippingMethods.name));
  return rows.map((m) => toQuote(m, input)).filter((q): q is ShippingQuote => q !== null);
}

export async function getShippingMethod(tx: Tx, tenantId: string, id: string): Promise<ShippingMethodRow | null> {
  const [row] = await tx
    .select()
    .from(shippingMethods)
    .where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.id, id), eq(shippingMethods.active, true)))
    .limit(1);
  return row ?? null;
}
