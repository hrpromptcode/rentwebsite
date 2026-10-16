import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { gamePackages, topupBlacklist, topupSuppliers, type Tx } from "@rentweb/db";
import { audit, fail, ok, type Result } from "@rentweb/core";
import { addToBlacklist, type BlacklistKind } from "../services/blacklist";
import type { Actor } from "./orders";

export type Supplier = typeof topupSuppliers.$inferSelect;
export type BlacklistEntry = typeof topupBlacklist.$inferSelect;

export interface AdminSupplierRow extends Supplier {
  packageCount: number;
}

export async function listAdminSuppliers(tx: Tx, tenantId: string): Promise<AdminSupplierRow[]> {
  const rows = await tx
    .select({ s: topupSuppliers, packageCount: sql<number>`count(${gamePackages.id})::int` })
    .from(topupSuppliers)
    .leftJoin(gamePackages, and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.supplierId, topupSuppliers.id)))
    .where(eq(topupSuppliers.tenantId, tenantId))
    .groupBy(topupSuppliers.id)
    .orderBy(desc(topupSuppliers.active), asc(topupSuppliers.name));
  return rows.map(({ s, packageCount }) => ({ ...s, packageCount: Number(packageCount ?? 0) }));
}

export async function upsertSupplier(tx: Tx, tenantId: string, v: { id?: string | null; name: string; provider: string; config: Record<string, unknown>; active: boolean }, actor: Actor): Promise<Result<Supplier>> {
  const data = { name: v.name, provider: v.provider, config: v.config, active: v.active };
  if (v.id) {
    const [row] = await tx
      .update(topupSuppliers)
      .set(data)
      .where(and(eq(topupSuppliers.tenantId, tenantId), eq(topupSuppliers.id, v.id)))
      .returning();
    if (!row) return fail("ไม่พบ supplier", "not_found");
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.supplier.update", targetType: "topup_supplier", targetId: row.id, diff: { name: v.name, provider: v.provider, active: v.active } });
    return ok(row);
  }
  const [row] = await tx
    .insert(topupSuppliers)
    .values({ tenantId, ...data })
    .returning();
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.supplier.create", targetType: "topup_supplier", targetId: row!.id, diff: { name: v.name, provider: v.provider } });
  return ok(row!);
}

export async function deleteSupplier(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null>> {
  const [c] = await tx.select({ c: count() }).from(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.supplierId, id)));
  if (Number(c?.c ?? 0) > 0) return fail(`ยังมีแพ็กเกจ ${c!.c} รายการที่ใช้ supplier นี้ — เปลี่ยน supplier ของแพ็กเกจก่อน หรือปิดใช้งานแทน`, "in_use");
  const r = await tx.delete(topupSuppliers).where(and(eq(topupSuppliers.tenantId, tenantId), eq(topupSuppliers.id, id))).returning({ id: topupSuppliers.id });
  if (!r.length) return fail("ไม่พบ supplier", "not_found");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.supplier.delete", targetType: "topup_supplier", targetId: id });
  return ok(null);
}

export async function listBlacklist(tx: Tx, tenantId: string, f: { q?: string | null; kind?: string | null; page?: number; perPage?: number } = {}): Promise<{ rows: BlacklistEntry[]; total: number; page: number; pages: number }> {
  const perPage = Math.min(100, Math.max(1, f.perPage ?? 25));
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(topupBlacklist.tenantId, tenantId)];
  if (f.kind) conds.push(eq(topupBlacklist.kind, f.kind));
  if (f.q?.trim()) conds.push(or(ilike(topupBlacklist.value, `%${f.q.trim()}%`), ilike(topupBlacklist.reason, `%${f.q.trim()}%`))!);
  const where = and(...conds);
  const [rows, [c]] = await Promise.all([
    tx
      .select()
      .from(topupBlacklist)
      .where(where)
      .orderBy(desc(topupBlacklist.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    tx.select({ c: count() }).from(topupBlacklist).where(where),
  ]);
  const total = Number(c?.c ?? 0);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function addBlacklistEntry(tx: Tx, tenantId: string, v: { kind: BlacklistKind; value: string; reason?: string | null }, actor: Actor): Promise<Result<BlacklistEntry>> {
  const row = await addToBlacklist(tx, tenantId, { kind: v.kind, value: v.value, reason: v.reason ?? null, createdBy: actor.userId });
  if (!row) return fail("ค่านี้อยู่ในบัญชีดำอยู่แล้ว", "duplicate");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.blacklist.add", targetType: "topup_blacklist", targetId: row.id, diff: { kind: v.kind, value: row.value, reason: v.reason ?? null } });
  return ok(row);
}

export async function removeBlacklistEntry(tx: Tx, tenantId: string, id: string, actor: Actor): Promise<Result<null>> {
  const r = await tx.delete(topupBlacklist).where(and(eq(topupBlacklist.tenantId, tenantId), eq(topupBlacklist.id, id))).returning({ id: topupBlacklist.id, kind: topupBlacklist.kind, value: topupBlacklist.value });
  if (!r.length) return fail("ไม่พบรายการ", "not_found");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.blacklist.remove", targetType: "topup_blacklist", targetId: id, diff: { kind: r[0]!.kind, value: r[0]!.value } });
  return ok(null);
}
