import { and, asc, eq } from "drizzle-orm";
import { shippingMethods, type Tx } from "@rentweb/db";
import { audit } from "@rentweb/core";
import type { ShippingMethodRow } from "../services/shipping";
import type { Actor } from "./orders";
import { shippingConfigFrom, type shippingMethodSchema } from "./schemas";
import type { z } from "zod";

export async function listAdminShippingMethods(tx: Tx, tenantId: string): Promise<ShippingMethodRow[]> {
  return tx.select().from(shippingMethods).where(eq(shippingMethods.tenantId, tenantId)).orderBy(asc(shippingMethods.sort), asc(shippingMethods.name));
}

export async function getAdminShippingMethod(tx: Tx, tenantId: string, id: string): Promise<ShippingMethodRow | null> {
  const [row] = await tx.select().from(shippingMethods).where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.id, id))).limit(1);
  return row ?? null;
}

export async function saveShippingMethod(tx: Tx, tenantId: string, id: string | null, v: z.output<typeof shippingMethodSchema>, actor: Actor): Promise<{ id: string }> {
  const data = { name: v.name, description: v.description, type: v.type, config: shippingConfigFrom(v), estimatedDays: v.estimatedDays, active: v.active, sort: v.sort };
  let methodId = id;
  if (methodId) await tx.update(shippingMethods).set(data).where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.id, methodId)));
  else {
    const [row] = await tx.insert(shippingMethods).values({ tenantId, ...data }).returning({ id: shippingMethods.id });
    methodId = row!.id;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: id ? "shipping.update" : "shipping.create", targetType: "shipping_method", targetId: methodId, diff: { name: v.name, type: v.type, config: data.config } });
  return { id: methodId };
}

export async function setShippingMethodActive(tx: Tx, tenantId: string, id: string, active: boolean): Promise<boolean> {
  const r = await tx.update(shippingMethods).set({ active }).where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.id, id))).returning({ id: shippingMethods.id });
  return r.length > 0;
}

export async function deleteShippingMethod(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const r = await tx.delete(shippingMethods).where(and(eq(shippingMethods.tenantId, tenantId), eq(shippingMethods.id, id))).returning({ name: shippingMethods.name });
  if (r.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "shipping.delete", targetType: "shipping_method", targetId: id, diff: { name: r[0]!.name } });
  return r.length > 0;
}

/** Form values from a stored row (inverse of shippingConfigFrom). */
export interface ShippingFormSource {
  name: string;
  description: string | null;
  type: "flat" | "weight" | "free_over" | "cod" | "pickup";
  amount: number | null;
  threshold: number | null;
  fee: number | null;
  tiers: Array<{ maxGrams: number; amount: number }>;
  estimatedDays: string | null;
  active: boolean;
  sort: number;
}

export function shippingFormValues(m: ShippingMethodRow): ShippingFormSource {
  const cfg = (m.config ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    name: m.name,
    description: m.description,
    type: m.type as "flat" | "weight" | "free_over" | "cod" | "pickup",
    amount: num(cfg.amount),
    threshold: num(cfg.threshold),
    fee: num(cfg.fee),
    tiers: Array.isArray(cfg.tiers) ? (cfg.tiers as Array<{ maxGrams: unknown; amount: unknown }>).map((t) => ({ maxGrams: num(t.maxGrams) ?? 0, amount: num(t.amount) ?? 0 })) : [],
    estimatedDays: m.estimatedDays,
    active: m.active,
    sort: m.sort,
  };
}
