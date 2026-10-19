import { createHash, createHmac } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
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
    // STOREFRONT-12 format rules (validated by services validatePlayerFields; select fields use their options)
    ...(f.type !== "select" && f.pattern ? { pattern: f.pattern } : {}),
    ...(f.type !== "select" && f.minLength ? { minLength: f.minLength } : {}),
    ...(f.type !== "select" && f.maxLength ? { maxLength: f.maxLength } : {}),
    ...(f.type !== "select" && f.inputMode ? { inputMode: f.inputMode } : {}),
    ...(f.hint ? { hint: f.hint } : {}),
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

/** Code rows of some packages by status group (ADMIN-07): unsold = available / reserved (expired included), sold, void. */
async function stockCounts(tx: Tx, tenantId: string, packageIds: string[]): Promise<{ unsold: number; sold: number; void: number }> {
  if (!packageIds.length) return { unsold: 0, sold: 0, void: 0 };
  const [r] = await tx
    .select({
      unsold: sql<number>`count(*) filter (where ${codeStock.status} in ('available','reserved'))::int`,
      sold: sql<number>`count(*) filter (where ${codeStock.status} = 'sold')::int`,
      void: sql<number>`count(*) filter (where ${codeStock.status} = 'void')::int`,
    })
    .from(codeStock)
    .where(and(eq(codeStock.tenantId, tenantId), inArray(codeStock.packageId, packageIds)));
  return { unsold: Number(r?.unsold ?? 0), sold: Number(r?.sold ?? 0), void: Number(r?.void ?? 0) };
}

const HAS_STOCK = (n: number, what: string) => `${what}นี้ยังมีโค้ดที่ยังไม่ได้ขาย ${n.toLocaleString("th-TH")} โค้ด ลบไม่ได้ — ยกเลิก (void) โค้ดในแท็บสต็อกโค้ดก่อน หรือปิดขายแทน`;

/**
 * Deletes a game that has never been ordered (orders reference games with ON DELETE RESTRICT). ADMIN-07: refused while
 * any of its packages still holds unsold codes (code_stock.package_id is ON DELETE RESTRICT since 0010); voided codes
 * are removed with it (audited with their count).
 */
export async function deleteGame(tx: Tx, tenantId: string, gameId: string, actor: Actor): Promise<Result<null>> {
  const [c] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.gameId, gameId)));
  if (Number(c?.c ?? 0) > 0) return fail("เกมนี้มีประวัติรายการเติมแล้ว ลบไม่ได้ — ปิดใช้งานแทน", "has_orders");
  const pkgIds = (await tx.select({ id: gamePackages.id }).from(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.gameId, gameId)))).map((r) => r.id);
  const stock = await stockCounts(tx, tenantId, pkgIds);
  if (stock.unsold > 0) return fail(HAS_STOCK(stock.unsold, "เกม"), "has_stock");
  if (stock.sold > 0) return fail("เกมนี้มีโค้ดที่ขายไปแล้ว ลบไม่ได้ — ปิดใช้งานแทน", "has_orders");
  if (stock.void > 0) await tx.delete(codeStock).where(and(eq(codeStock.tenantId, tenantId), inArray(codeStock.packageId, pkgIds), eq(codeStock.status, "void")));
  await tx.delete(games).where(and(eq(games.tenantId, tenantId), eq(games.id, gameId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.game.delete", targetType: "game", targetId: gameId, diff: { packages: pkgIds.length, voidCodesRemoved: stock.void } });
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

/** Deletes a never-ordered package. ADMIN-07: refused while it holds unsold codes; voided codes are removed with it. */
export async function deletePackage(tx: Tx, tenantId: string, packageId: string, actor: Actor): Promise<Result<null>> {
  const [c] = await tx.select({ c: count() }).from(topupOrders).where(and(eq(topupOrders.tenantId, tenantId), eq(topupOrders.packageId, packageId)));
  if (Number(c?.c ?? 0) > 0) return fail("แพ็กเกจนี้มีประวัติรายการเติมแล้ว ลบไม่ได้ — ปิดขายแทน", "has_orders");
  const stock = await stockCounts(tx, tenantId, [packageId]);
  if (stock.unsold > 0) return fail(HAS_STOCK(stock.unsold, "แพ็กเกจ"), "has_stock");
  if (stock.sold > 0) return fail("แพ็กเกจนี้มีโค้ดที่ขายไปแล้ว ลบไม่ได้ — ปิดขายแทน", "has_orders");
  if (stock.void > 0) await tx.delete(codeStock).where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.packageId, packageId), eq(codeStock.status, "void")));
  await tx.delete(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId)));
  await audit(tx, { tenantId, actorType: actor.actorType, actorId: actor.userId, action: "topup.package.delete", targetType: "game_package", targetId: packageId, diff: { voidCodesRemoved: stock.void } });
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

/* ------------------------------------------------------------------ */
/* Code de-duplication (ADMIN-06)                                       */
/* ------------------------------------------------------------------ */

/** Comparison form of a code: NFKC, upper case, without spaces / dashes ("abcd-efgh 12" ≡ "ABCDEFGH12"). */
export function normalizeStockCode(code: string): string {
  return code.normalize("NFKC").replace(/[\s\-‐-―]+/g, "").toUpperCase();
}

let hashKey: Buffer | null = null;
/** Keyed hash of a code, unique per tenant (code_stock.code_hash). Keyed from SECRETS_ENCRYPTION_KEY so the DB alone never reveals a code. */
export function stockCodeHash(tenantId: string, code: string): string {
  hashKey ??= createHash("sha256").update(`rentweb:code_stock_hash:${process.env.SECRETS_ENCRYPTION_KEY ?? "rentweb-dev-only-key"}`).digest();
  return createHmac("sha256", hashKey).update(`${tenantId}:${normalizeStockCode(code)}`).digest("hex");
}

/**
 * Gives every code of the tenant a code_hash (rows written before migration 0010, template seeds, tests). A row whose
 * code already exists under another row (the old import bug) gets a "dup:<id>" marker instead, and an unsold duplicate
 * is voided so the same code is never handed to two customers; unreadable rows get "unreadable:<id>".
 * Call under the tenant's stock lock (importStockCodes).
 */
export async function backfillStockCodeHashes(tx: Tx, tenantId: string, actor?: Actor): Promise<{ hashed: number; voidedDuplicates: number; unreadable: number }> {
  const pending = await tx
    .select({ id: codeStock.id, codeEncrypted: codeStock.codeEncrypted, status: codeStock.status, packageId: codeStock.packageId })
    .from(codeStock)
    .where(and(eq(codeStock.tenantId, tenantId), isNull(codeStock.codeHash)))
    .orderBy(sql`case ${codeStock.status} when 'sold' then 0 when 'reserved' then 1 when 'available' then 2 else 3 end`, asc(codeStock.createdAt));
  const out = { hashed: 0, voidedDuplicates: 0, unreadable: 0 };
  if (!pending.length) return out;
  const known = new Set(
    (await tx.select({ h: codeStock.codeHash }).from(codeStock).where(and(eq(codeStock.tenantId, tenantId), sql`${codeStock.codeHash} is not null`))).map((r) => r.h!),
  );
  const voided: Array<{ id: string; packageId: string }> = [];
  for (const row of pending) {
    let h: string;
    try {
      h = stockCodeHash(tenantId, decryptFromString(row.codeEncrypted));
    } catch {
      out.unreadable += 1;
      await tx.update(codeStock).set({ codeHash: `unreadable:${row.id}` }).where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, row.id)));
      continue;
    }
    if (known.has(h)) {
      const unsold = row.status === "available" || row.status === "reserved";
      await tx
        .update(codeStock)
        .set({ codeHash: `dup:${row.id}`, ...(unsold ? { status: "void" } : {}) })
        .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, row.id)));
      if (unsold) voided.push({ id: row.id, packageId: row.packageId });
      continue;
    }
    known.add(h);
    await tx.update(codeStock).set({ codeHash: h }).where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.id, row.id)));
    out.hashed += 1;
  }
  out.voidedDuplicates = voided.length;
  if (voided.length) {
    await audit(tx, { tenantId, actorType: actor?.actorType ?? "system", actorId: actor?.userId ?? null, action: "topup.stock.void_duplicates", targetType: "code_stock", targetId: voided[0]!.id, diff: { voided: voided.map((v) => v.id), packages: [...new Set(voided.map((v) => v.packageId))] } });
  }
  return out;
}

export interface StockImportResult {
  imported: number;
  /** every line that was not imported because the code already exists (in the paste or in the shop) */
  duplicates: number;
  /** repeated inside the pasted list */
  inPaste: number;
  /** already in the shop: still in stock (any package), already sold, or voided */
  existing: { inStock: number; sold: number; void: number };
  /** unsold duplicates found among older rows and voided by the backfill (data written before the fix) */
  voidedDuplicates: number;
  available: number;
}

/**
 * Imports plaintext codes (one per line, optional "serial<TAB>code"). ADMIN-06: a code is imported once per shop –
 * repeated lines, codes already in stock (in any package), already sold or voided are skipped and reported. The check
 * is the unique (tenant_id, code_hash) index, so two concurrent imports cannot both insert the same code either.
 */
export async function importStockCodes(tx: Tx, tenantId: string, packageId: string, lines: string[], opts: { expiresAt?: Date | null; actor: Actor }): Promise<Result<StockImportResult>> {
  const [pkg] = await tx.select({ id: gamePackages.id, fulfillment: gamePackages.fulfillment, name: gamePackages.name }).from(gamePackages).where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId))).limit(1);
  if (!pkg) return fail("ไม่พบแพ็กเกจ", "not_found");
  if (pkg.fulfillment !== "stock") return fail("นำเข้าโค้ดได้เฉพาะแพ็กเกจแบบสต็อกโค้ด", "not_stock");
  const parsed: Array<{ serial: string | null; code: string; hash: string }> = [];
  const seen = new Set<string>();
  let inPaste = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const [a, b] = line.includes("\t") ? line.split("\t", 2) : [null, line];
    const code = (b ?? a ?? "").trim();
    const serial = a && b ? a.trim() || null : null;
    if (!code || !normalizeStockCode(code)) continue;
    const hash = stockCodeHash(tenantId, code);
    if (seen.has(hash)) {
      inPaste += 1;
      continue;
    }
    seen.add(hash);
    parsed.push({ serial, code, hash });
  }
  if (!parsed.length && !inPaste) return fail("ไม่พบโค้ดที่นำเข้าได้", "empty");

  // one stock writer per tenant at a time: the backfill and the duplicate report stay consistent
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`code_stock:${tenantId}`}))`);
  const backfill = await backfillStockCodeHashes(tx, tenantId, opts.actor);

  const existing = { inStock: 0, sold: 0, void: 0 };
  const already = new Set<string>();
  for (let i = 0; i < parsed.length; i += 500) {
    const chunk = parsed.slice(i, i + 500).map((p) => p.hash);
    const rows = await tx.select({ h: codeStock.codeHash, status: codeStock.status }).from(codeStock).where(and(eq(codeStock.tenantId, tenantId), inArray(codeStock.codeHash, chunk)));
    for (const r of rows) {
      already.add(r.h!);
      if (r.status === "sold") existing.sold += 1;
      else if (r.status === "void") existing.void += 1;
      else existing.inStock += 1;
    }
  }
  const fresh = parsed.filter((p) => !already.has(p.hash));
  let imported = 0;
  if (fresh.length) {
    const rows = await tx
      .insert(codeStock)
      .values(fresh.map((v) => ({ tenantId, packageId, codeEncrypted: encryptToString(v.code), codeHash: v.hash, serial: v.serial, status: "available", expiresAt: opts.expiresAt ?? null, addedBy: opts.actor.userId })))
      .onConflictDoNothing({ target: [codeStock.tenantId, codeStock.codeHash] })
      .returning({ id: codeStock.id });
    imported = rows.length;
    existing.inStock += fresh.length - rows.length; // inserted concurrently (cannot happen under the lock; kept for safety)
  }
  const duplicates = inPaste + existing.inStock + existing.sold + existing.void;
  const summary = await stockSummary(tx, tenantId, packageId);
  await audit(tx, { tenantId, actorType: opts.actor.actorType, actorId: opts.actor.userId, action: "topup.stock.import", targetType: "game_package", targetId: packageId, diff: { imported, duplicates, inPaste, existing, voidedDuplicates: backfill.voidedDuplicates, available: summary.available, package: pkg.name } });
  if (imported) await emitEvent(tx, { tenantId, type: "topup.stock_imported", payload: { packageId, imported, available: summary.available } });
  return ok({ imported, duplicates, inPaste, existing, voidedDuplicates: backfill.voidedDuplicates, available: summary.available });
}

/** Thai summary of an import for the toast / dialog. */
export function stockImportMessage(r: StockImportResult): string {
  const parts: string[] = [];
  if (r.inPaste) parts.push(`ซ้ำในรายการที่วาง ${r.inPaste}`);
  if (r.existing.inStock) parts.push(`มีในสต็อกแล้ว ${r.existing.inStock}`);
  if (r.existing.sold) parts.push(`เคยขายไปแล้ว ${r.existing.sold}`);
  if (r.existing.void) parts.push(`เคยยกเลิกไปแล้ว ${r.existing.void}`);
  const head = r.imported ? `นำเข้า ${r.imported} โค้ด` : "ไม่ได้นำเข้าโค้ดใหม่";
  const dup = r.duplicates ? ` · ข้ามโค้ดซ้ำ ${r.duplicates} (${parts.join(" · ")})` : "";
  const fix = r.voidedDuplicates ? ` · ยกเลิกโค้ดซ้ำที่ค้างในสต็อกเดิม ${r.voidedDuplicates}` : "";
  return `${head}${dup}${fix} · พร้อมขาย ${r.available}`;
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
