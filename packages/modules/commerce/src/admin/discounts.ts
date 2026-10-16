import { and, asc, desc, eq, ne } from "drizzle-orm";
import { discounts, type Tx } from "@rentweb/db";
import { audit, fail, ok, type Result } from "@rentweb/core";
import type { Actor } from "./orders";
import type { discountSchema } from "./schemas";
import type { z } from "zod";

export type DiscountRow = typeof discounts.$inferSelect;

export async function listDiscounts(tx: Tx, tenantId: string): Promise<DiscountRow[]> {
  return tx.select().from(discounts).where(eq(discounts.tenantId, tenantId)).orderBy(desc(discounts.active), asc(discounts.code));
}

export async function getDiscount(tx: Tx, tenantId: string, id: string): Promise<DiscountRow | null> {
  const [row] = await tx.select().from(discounts).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).limit(1);
  return row ?? null;
}

export function discountState(d: Pick<DiscountRow, "active" | "startsAt" | "endsAt" | "maxUses" | "usedCount">, now = new Date()): "active" | "scheduled" | "expired" | "exhausted" | "inactive" {
  if (!d.active) return "inactive";
  if (d.startsAt && d.startsAt > now) return "scheduled";
  if (d.endsAt && d.endsAt < now) return "expired";
  if (d.maxUses != null && d.usedCount >= d.maxUses) return "exhausted";
  return "active";
}

export async function saveDiscount(tx: Tx, tenantId: string, id: string | null, v: z.output<typeof discountSchema>, actor: Actor): Promise<Result<{ id: string }, { field: string; message: string }>> {
  const conds = [eq(discounts.tenantId, tenantId), eq(discounts.code, v.code)];
  if (id) conds.push(ne(discounts.id, id));
  const [dup] = await tx.select({ id: discounts.id }).from(discounts).where(and(...conds)).limit(1);
  if (dup) return fail({ field: "code", message: "โค้ดนี้มีอยู่แล้ว" }, "code");
  // percent stored as 0-100, fixed stored as satang
  const value = v.type === "percent" ? Math.round(v.value) : v.type === "fixed" ? Math.round(v.value * 100) : 0;
  const data = {
    code: v.code,
    name: v.name,
    type: v.type,
    value,
    minSubtotal: v.minSubtotal,
    maxDiscount: v.type === "percent" ? v.maxDiscount : null,
    maxUses: v.maxUses,
    perCustomerLimit: v.perCustomerLimit,
    startsAt: v.startsAt,
    endsAt: v.endsAt,
    active: v.active,
  };
  let discountId = id;
  if (discountId) await tx.update(discounts).set(data).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, discountId)));
  else {
    const [row] = await tx.insert(discounts).values({ tenantId, ...data }).returning({ id: discounts.id });
    discountId = row!.id;
  }
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: id ? "discount.update" : "discount.create", targetType: "discount", targetId: discountId, diff: { code: v.code, type: v.type, value } });
  return ok({ id: discountId });
}

export async function setDiscountActive(tx: Tx, tenantId: string, id: string, active: boolean): Promise<boolean> {
  const r = await tx.update(discounts).set({ active }).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).returning({ id: discounts.id });
  return r.length > 0;
}

export async function deleteDiscount(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<boolean> {
  const r = await tx.delete(discounts).where(and(eq(discounts.tenantId, tenantId), eq(discounts.id, id))).returning({ code: discounts.code });
  if (r.length) await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "discount.delete", targetType: "discount", targetId: id, diff: { code: r[0]!.code } });
  return r.length > 0;
}
