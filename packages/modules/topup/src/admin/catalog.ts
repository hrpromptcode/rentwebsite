import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { codeStock, gamePackages, games, topupOrders, topupSuppliers, type GameField, type Tx } from "@rentweb/db";
import { audit, decryptFromString, emitEvent, encryptToString, fail, ok, type Result } from "@rentweb/core";
import { maskCode } from "../components/format";
import type { Actor } from "./orders";
import { qualified } from "./sql";
import type { GameValues, PackageValues } from "./schemas";

export type Game = typeof games.$inferSelect;
export type GamePackage = typeof gamePackages.$inferSelect;

export interface AdminGameRow {
  id: string;
  name: string;
  slug: string;
  publisher: string | null;
  image: string | null;
  category: string;
  featured: boolean;
  active: boolean;
  sort: number;
  packageCount: number;
  activePackageCount: number;
  minPrice: number | null;
  /** available codes across the game's stock packages (null when it has none) */
  stockAvailable: number | null;
}

export async function listAdminGames(tx: Tx, tenantId: string, opts: { q?: string | null } = {}): Promise<AdminGameRow[]> {
  const conds = [eq(games.tenantId, tenantId)];
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    conds.push(or(ilike(games.name, like), ilike(games.publisher, like), ilike(games.slug, like))!);
  }
  const rows = await tx
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      publisher: games.publisher,
      image: games.image,
      category: games.category,
      featured: games.featured,
      active: games.active,
      sort: games.sort,
      packageCount: sql<number>`count(${gamePackages.id})::int`,
      activePackageCount: sql<number>`count(${gamePackages.id}) filter (where ${gamePackages.active})::int`,
      minPrice: sql<number | null>`min(case when ${gamePackages.active} then ${gamePackages.price} end)`,
      stockPackages: sql<number>`count(${gamePackages.id}) filter (where ${gamePackages.fulfillment} = 'stock')::int`,
    })
    .from(games)
    .leftJoin(gamePackages, and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.gameId, games.id)))
    .where(and(...conds))
    .groupBy(games.id)
    .orderBy(asc(games.sort), asc(games.name));
  const stockGameIds = rows.filter((r) => Number(r.stockPackages) > 0).map((r) => r.id);
  const stockMap = new Map<string, number>();
  if (stockGameIds.length) {
    const st = await tx
      .select({ gameId: gamePackages.gameId, n: sql<number>`count(${codeStock.id})::int` })
      .from(gamePackages)
      .leftJoin(codeStock, and(eq(codeStock.tenantId, tenantId), eq(codeStock.packageId, gamePackages.id), eq(codeStock.status, "available"), or(sql`${codeStock.expiresAt} is null`, sql`${codeStock.expiresAt} > now()`)!))
      .where(and(eq(gamePackages.tenantId, tenantId), inArray(gamePackages.gameId, stockGameIds), eq(gamePackages.fulfillment, "stock")))
      .groupBy(gamePackages.gameId);
    for (const r of st) stockMap.set(r.gameId, Number(r.n));
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    publisher: r.publisher,
    image: r.image,
    category: r.category,
    featured: r.featured,
    active: r.active,
    sort: r.sort,
    packageCount: Number(r.packageCount ?? 0),
    activePackageCount: Number(r.activePackageCount ?? 0),
    minPrice: r.minPrice === null || r.minPrice === undefined ? null : Number(r.minPrice),
    stockAvailable: Number(r.stockPackages) > 0 ? (stockMap.get(r.id) ?? 0) : null,
  }));
}

export interface AdminPackageRow extends GamePackage {
  available: number | null;
  sold: number | null;
  orderCount: number;
}

export interface AdminGameDetail {
  game: Game;
  packages: AdminPackageRow[];
  suppliers: Array<{ id: string; name: string; provider: string; active: boolean }>;
}

export async function listSupplierOptions(tx: Tx, tenantId: string) {
  return tx.select({ id: topupSuppliers.id, name: topupSuppliers.name, provider: topupSuppliers.provider, active: topupSuppliers.active }).from(topupSuppliers).where(eq(topupSuppliers.tenantId, tenantId)).orderBy(asc(topupSuppliers.name));
}

export async function getAdminGame(tx: Tx, tenantId: string, gameId: string): Promise<AdminGameDetail | null> {
  const [game] = await tx.select().from(games).where(and(eq(games.tenantId, tenantId), eq(games.id, gameId))).limit(1);
  if (!game) return null;
  const [pkgs, suppliers] = await Promise.all([
    tx
      .select({ p: gamePackages, orderCount: sql<number>`(select count(*) from topup_orders o where o.tenant_id = ${tenantId} and o.package_id = ${qualified(gamePackages.id)})::int` })
      .from(gamePackages)
      .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.gameId, game.id)))
      .orderBy(asc(gamePackages.sort), asc(gamePackages.price)),
    listSupplierOptions(tx, tenantId),
  ]);
  const stockIds = pkgs.filter((r) => r.p.fulfillment === "stock").map((r) => r.p.id);
  const counts = new Map<string, { available: number; sold: number }>();
  if (stockIds.length) {
    const rows = await tx
      .select({
        packageId: codeStock.packageId,
        available: sql<number>`count(*) filter (where ${codeStock.status} = 'available' and (${codeStock.expiresAt} is null or ${codeStock.expiresAt} > now()))::int`,
        sold: sql<number>`count(*) filter (where ${codeStock.status} = 'sold')::int`,
      })
      .from(codeStock)
      .where(and(eq(codeStock.tenantId, tenantId), inArray(codeStock.packageId, stockIds)))
      .groupBy(codeStock.packageId);
    for (const r of rows) counts.set(r.packageId, { available: Number(r.available), sold: Number(r.sold) });
  }
  return {
    game,
    packages: pkgs.map(({ p, orderCount }) => ({
      ...p,
      available: p.fulfillment === "stock" ? (counts.get(p.id)?.available ?? 0) : null,
      sold: p.fulfillment === "stock" ? (counts.get(p.id)?.sold ?? 0) : null,
      orderCount: Number(orderCount ?? 0),
    })),
    suppliers,
  };
}

function gameRow(v: GameValues) {
  const fields: GameField[] = v.fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    ...(f.type === "select" && f.options?.length ? { options: f.options } : {}),
    ...(f.helpImage ? { helpImage: f.helpImage } : {}),
  }));
  return {
    name: v.name,
    slug: v.slug,
    publisher: v.publisher || null,
    description: v.description || null,
    image: v.image || null,
    banner: v.banner || null,
    category: v.category,
    fields,
    instructions: v.instructions || null,
    featured: v.featured,
    active: v.active,
    sort: v.sort,
  };
}

async function slugTaken(tx: Tx, tenantId: string, slug: string, exceptId?: string): Promise<boolean> {
  const conds = [eq(games.tenantId, tenantId), eq(games.slug, slug)];
  if (exceptId) conds.push(ne(games.id, exceptId));
  const [row] = await tx.select({ id: games.id }).from(games).where(and(...conds)).limit(1);
  return !!row;
}

export async function createGame(tx: Tx, tenantId: string, v: GameValues, actor: Actor): Promise<Result<Game>> {
  if (await slugTaken(tx, tenantId, v.slug)) return fail("slug นี้ถูกใช้แล้ว", "slug");
  const [row] = await tx
    .insert(games)
    .values({ tenantId, ...gameRow(v) })
    .returning();
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.game.create", targetType: "game", targetId: row!.id, diff: { name: v.name, slug: v.slug } });
  return ok(row!);
}

export async function updateGame(tx: Tx, tenantId: string, gameId: string, v: GameValues, actor: Actor): Promise<Result<Game>> {
  if (await slugTaken(tx, tenantId, v.slug, gameId)) return fail("slug นี้ถูกใช้แล้ว", "slug");
  const [row] = await tx
    .update(games)
    .set(gameRow(v))
    .where(and(eq(games.tenantId, tenantId), eq(games.id, gameId)))
    .returning();
  if (!row) return fail("ไม่พบเกม", "not_found");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.game.update", targetType: "game", targetId: gameId, diff: { name: v.name, slug: v.slug, active: v.active } });
  return ok(row);
}

export async function setGameActive(tx: Tx, tenantId: string, gameId: string, active: boolean): Promise<boolean> {
  const r = await tx
    .update(games)
    .set({ active })
    .where(and(eq(games.tenantId, tenantId), eq(games.id, gameId)))
    .returning({ id: games.id });
  return r.length > 0;
}

/** Deletes a game that has never been ordered (orders reference games with ON DELETE RESTRICT). */
export async function deleteGame(tx: Tx, tenantId: string, gameId: string, actor: Actor): Promise<Result<null>> {
  const [c] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.gameId, gameId)));
  if (Number(c?.c ?? 0) > 0) return fail("เกมนี้มีประวัติรายการเติมแล้ว ลบไม่ได้ — ปิดใช้งานแทน", "has_orders");
  await tx.delete(games).where(and(eq(games.tenantId, tenantId), eq(games.id, gameId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.game.delete", targetType: "game", targetId: gameId });
  return ok(null);
}

function packageRow(v: PackageValues) {
  const tierPrices: Record<string, number> = {};
  if (v.tierVip && v.tierVip > 0) tierPrices.vip = v.tierVip;
  if (v.tierAgent && v.tierAgent > 0) tierPrices.agent = v.tierAgent;
  return {
    name: v.name,
    description: v.description || null,
    price: v.price!,
    costPrice: v.costPrice ?? null,
    tierPrices,
    fulfillment: v.fulfillment,
    supplierId: v.fulfillment === "api" ? (v.supplierId ?? null) : null,
    supplierProductCode: v.fulfillment === "api" ? v.supplierProductCode || null : null,
    estimatedMinutes: v.estimatedMinutes,
    badge: v.badge || null,
    active: v.active,
    sort: v.sort,
  };
}

export async function upsertPackage(tx: Tx, tenantId: string, gameId: string, v: PackageValues, actor: Actor): Promise<Result<GamePackage>> {
  if (v.price === null || v.price === undefined) return fail("กรุณากรอกราคาขาย", "price");
  if (v.supplierId) {
    const [s] = await tx.select({ id: topupSuppliers.id }).from(topupSuppliers).where(and(eq(topupSuppliers.tenantId, tenantId), eq(topupSuppliers.id, v.supplierId))).limit(1);
    if (!s) return fail("ไม่พบ supplier ที่เลือก", "supplier");
  }
  if (v.id) {
    const [row] = await tx
      .update(gamePackages)
      .set(packageRow(v))
      .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, v.id), eq(gamePackages.gameId, gameId)))
      .returning();
    if (!row) return fail("ไม่พบแพ็กเกจ", "not_found");
    await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.package.update", targetType: "game_package", targetId: row.id, diff: { name: v.name, price: v.price, costPrice: v.costPrice ?? null, fulfillment: v.fulfillment } });
    return ok(row);
  }
  const [row] = await tx
    .insert(gamePackages)
    .values({ tenantId, gameId, ...packageRow(v) })
    .returning();
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.package.create", targetType: "game_package", targetId: row!.id, diff: { name: v.name, price: v.price, fulfillment: v.fulfillment } });
  return ok(row!);
}

export async function setPackageActive(tx: Tx, tenantId: string, packageId: string, active: boolean): Promise<boolean> {
  const r = await tx
    .update(gamePackages)
    .set({ active })
    .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId)))
    .returning({ id: gamePackages.id });
  return r.length > 0;
}

export async function deletePackage(tx: Tx, tenantId: string, packageId: string, actor: Actor): Promise<Result<null>> {
  const [c] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.packageId, packageId)));
  if (Number(c?.c ?? 0) > 0) return fail("แพ็กเกจนี้มีประวัติรายการเติมแล้ว ลบไม่ได้ — ปิดขายแทน", "has_orders");
  await tx.delete(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.package.delete", targetType: "game_package", targetId: packageId });
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Code stock                                                          */
/* ------------------------------------------------------------------ */

export interface StockSummary {
  available: number;
  reserved: number;
  sold: number;
  void: number;
  expired: number;
}

export async function stockSummary(tx: Tx, tenantId: string, packageId: string): Promise<StockSummary> {
  const [r] = await tx
    .select({
      available: sql<number>`count(*) filter (where ${codeStock.status} = 'available' and (${codeStock.expiresAt} is null or ${codeStock.expiresAt} > now()))::int`,
      expired: sql<number>`count(*) filter (where ${codeStock.status} = 'available' and ${codeStock.expiresAt} is not null and ${codeStock.expiresAt} <= now())::int`,
      reserved: sql<number>`count(*) filter (where ${codeStock.status} = 'reserved')::int`,
      sold: sql<number>`count(*) filter (where ${codeStock.status} = 'sold')::int`,
      void: sql<number>`count(*) filter (where ${codeStock.status} = 'void')::int`,
    })
    .from(codeStock)
    .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.packageId, packageId)));
  return { available: Number(r?.available ?? 0), expired: Number(r?.expired ?? 0), reserved: Number(r?.reserved ?? 0), sold: Number(r?.sold ?? 0), void: Number(r?.void ?? 0) };
}

export interface StockCodeRow {
  id: string;
  /** masked plaintext (STEAM-••••-••••-IJKL) so staff can spot duplicates without exposing the code */
  masked: string;
  serial: string | null;
  status: string;
  createdAt: Date;
  soldAt: Date | null;
  soldOrderNumber: string | null;
  soldOrderId: string | null;
  expiresAt: Date | null;
  addedBy: string | null;
}

export async function listStockCodes(tx: Tx, tenantId: string, packageId: string, opts: { status?: string | null; limit?: number } = {}): Promise<StockCodeRow[]> {
  const conds = [eq(codeStock.tenantId, tenantId), eq(codeStock.packageId, packageId)];
  if (opts.status) conds.push(eq(codeStock.status, opts.status));
  const rows = await tx
    .select({ c: codeStock, soldOrderNumber: topupOrders.number })
    .from(codeStock)
    .leftJoin(topupOrders, and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.id, codeStock.soldOrderId)))
    .where(and(...conds))
    .orderBy(sql`case ${codeStock.status} when 'available' then 0 when 'reserved' then 1 when 'sold' then 2 else 3 end`, desc(codeStock.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map(({ c, soldOrderNumber }) => {
    let masked = "••••";
    try {
      masked = maskCode(decryptFromString(c.codeEncrypted));
    } catch {
      /* unreadable (key rotated) */
    }
    return { id: c.id, masked, serial: c.serial, status: c.status, createdAt: c.createdAt, soldAt: c.soldAt, soldOrderNumber, soldOrderId: c.soldOrderId, expiresAt: c.expiresAt, addedBy: c.addedBy };
  });
}

/** Imports plaintext codes (one per line, optional "serial<TAB>code"); duplicates inside the batch are dropped. */
export async function importStockCodes(tx: Tx, tenantId: string, packageId: string, lines: string[], opts: { expiresAt?: Date | null; actor: Actor }): Promise<Result<{ imported: number; duplicates: number; available: number }>> {
  const [pkg] = await tx.select({ id: gamePackages.id, fulfillment: gamePackages.fulfillment, name: gamePackages.name }).from(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId))).limit(1);
  if (!pkg) return fail("ไม่พบแพ็กเกจ", "not_found");
  if (pkg.fulfillment !== "stock") return fail("นำเข้าโค้ดได้เฉพาะแพ็กเกจแบบสต็อกโค้ด", "not_stock");
  const seen = new Set<string>();
  const values: Array<{ serial: string | null; code: string }> = [];
  let duplicates = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const [a, b] = line.includes("\t") ? line.split("\t", 2) : [null, line];
    const code = (b ?? a ?? "").trim();
    const serial = a && b ? a.trim() || null : null;
    if (!code) continue;
    if (seen.has(code)) {
      duplicates += 1;
      continue;
    }
    seen.add(code);
    values.push({ serial, code });
  }
  if (!values.length) return fail("ไม่พบโค้ดที่นำเข้าได้", "empty");
  await tx.insert(codeStock).values(values.map((v) => ({ tenantId, packageId, codeEncrypted: encryptToString(v.code), serial: v.serial, status: "available", expiresAt: opts.expiresAt ?? null, addedBy: opts.actor.userId })));
  const summary = await stockSummary(tx, tenantId, packageId);
  await audit(tx, { tenantId, actorType: opts.actor.actorType, actorId: opts.actor.userId, action: "topup.stock.import", targetType: "game_package", targetId: packageId, diff: { imported: values.length, duplicates, available: summary.available, package: pkg.name } });
  await emitEvent(tx, { tenantId, type: "topup.stock_imported", payload: { packageId, imported: values.length, available: summary.available } });
  return ok({ imported: values.length, duplicates, available: summary.available });
}

export async function voidStockCode(tx: Tx, tenantId: string, codeId: string, actor: Actor): Promise<Result<null>> {
  const [row] = await tx
    .update(codeStock)
    .set({ status: "void" })
    .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, codeId), inArray(codeStock.status, ["available", "reserved"])))
    .returning({ id: codeStock.id, packageId: codeStock.packageId });
  if (!row) return fail("ยกเลิกได้เฉพาะโค้ดที่ยังไม่ถูกขาย", "bad_status");
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.stock.void", targetType: "game_package", targetId: row.packageId, diff: { codeId } });
  return ok(null);
}
