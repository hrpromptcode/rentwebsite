import { and, asc, desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import { codeStock, gamePackages, games, type GameField, type Tx } from "@rentweb/db";
import type { Fulfillment } from "./_shared";

export type Game = typeof games.$inferSelect;
export type GamePackage = typeof gamePackages.$inferSelect;

export interface GameListItem {
  id: string;
  name: string;
  slug: string;
  publisher: string | null;
  image: string | null;
  category: string;
  featured: boolean;
  /** cheapest active package (satang) – null when the game has no packages */
  minPrice: number | null;
  packageCount: number;
}

export interface ListGamesOptions {
  category?: string | null;
  search?: string | null;
  limit?: number;
  /** include inactive games (admin) */
  includeInactive?: boolean;
}

/** Active games, featured first, with the cheapest package price for "เริ่มต้น ฿xx". */
export async function listGames(tx: Tx, tenantId: string, opts: ListGamesOptions = {}): Promise<GameListItem[]> {
  const conds = [eq(games.tenantId, tenantId)];
  if (!opts.includeInactive) conds.push(eq(games.active, true));
  if (opts.category) conds.push(eq(games.category, opts.category));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(ilike(games.name, q), ilike(games.publisher, q), ilike(games.slug, q))!);
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
      minPrice: sql<number | null>`min(case when ${gamePackages.active} then ${gamePackages.price} end)`,
      packageCount: sql<number>`count(case when ${gamePackages.active} then 1 end)`,
    })
    .from(games)
    .leftJoin(gamePackages, and(eq(gamePackages.gameId, games.id), eq(gamePackages.tenantId, tenantId)))
    .where(and(...conds))
    .groupBy(games.id)
    .orderBy(desc(games.featured), asc(games.sort), asc(games.name))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({
    ...r,
    minPrice: r.minPrice === null || r.minPrice === undefined ? null : Number(r.minPrice),
    packageCount: Number(r.packageCount ?? 0),
  }));
}

export interface PackageWithStock extends GamePackage {
  /** available codes for stock packages, null for api/manual */
  available: number | null;
}

export interface GameDetail {
  game: Game;
  packages: PackageWithStock[];
}

/** One game with its active packages (ordered) and live stock counts for stock-fulfilled packages. */
export async function getGameBySlug(tx: Tx, tenantId: string, slug: string): Promise<GameDetail | null> {
  const [game] = await tx
    .select()
    .from(games)
    .where(and(eq(games.tenantId, tenantId), eq(games.slug, slug), eq(games.active, true)))
    .limit(1);
  if (!game) return null;
  const pkgs = await tx
    .select()
    .from(gamePackages)
    .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.gameId, game.id), eq(gamePackages.active, true)))
    .orderBy(asc(gamePackages.sort), asc(gamePackages.price));
  const stockIds = pkgs.filter((p) => p.fulfillment === "stock").map((p) => p.id);
  const counts = new Map<string, number>();
  if (stockIds.length) {
    const rows = await tx
      .select({ packageId: codeStock.packageId, n: sql<number>`count(*)` })
      .from(codeStock)
      .where(and(eq(codeStock.tenantId, tenantId), inArray(codeStock.packageId, stockIds), eq(codeStock.status, "available"), or(sql`${codeStock.expiresAt} is null`, sql`${codeStock.expiresAt} > now()`)!))
      .groupBy(codeStock.packageId);
    for (const r of rows) counts.set(r.packageId, Number(r.n));
  }
  return {
    game,
    packages: pkgs.map((p) => ({ ...p, available: p.fulfillment === "stock" ? (counts.get(p.id) ?? 0) : null })),
  };
}

export async function getPackage(tx: Tx, tenantId: string, packageId: string): Promise<GamePackage | null> {
  const [row] = await tx
    .select()
    .from(gamePackages)
    .where(and(eq(gamePackages.tenantId, tenantId), eq(gamePackages.id, packageId)))
    .limit(1);
  return row ?? null;
}

/** Number of sellable codes for a stock package. */
export async function countAvailableStock(tx: Tx, tenantId: string, packageId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(codeStock)
    .where(and(eq(codeStock.tenantId, tenantId), eq(codeStock.packageId, packageId), eq(codeStock.status, "available"), or(sql`${codeStock.expiresAt} is null`, sql`${codeStock.expiresAt} > now()`)!));
  return Number(row?.n ?? 0);
}

/** Price for a customer tier: tier override when defined, else the list price. Guests pay the member price. */
export function priceFor(pkg: { price: number; tierPrices?: Record<string, number> | null }, tier: string | null | undefined): number {
  const t = tier?.trim();
  if (t && pkg.tierPrices && typeof pkg.tierPrices[t] === "number" && pkg.tierPrices[t]! > 0) return pkg.tierPrices[t]!;
  return pkg.price;
}

/** Cheapest tier price shown as a hint ("สมาชิก VIP ฿xx"). */
export function bestTierPrice(pkg: { price: number; tierPrices?: Record<string, number> | null }): { tier: string; price: number } | null {
  const entries = Object.entries(pkg.tierPrices ?? {}).filter(([, v]) => typeof v === "number" && v > 0 && v < pkg.price);
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [tier, price] = entries[0]!;
  return { tier, price };
}

/** Validates player fields against the game's field definitions. Returns the cleaned record or an error. */
export function validatePlayerFields(fields: GameField[], input: Record<string, unknown>): { ok: true; value: Record<string, string> } | { ok: false; code: "missing_field" | "invalid_field"; key: string } {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = input[f.key];
    const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!v) {
      if (f.required) return { ok: false, code: "missing_field", key: f.key };
      continue;
    }
    if (v.length > 120) return { ok: false, code: "invalid_field", key: f.key };
    if (f.type === "number" && !/^\d+$/.test(v)) return { ok: false, code: "invalid_field", key: f.key };
    if (f.type === "select" && f.options?.length && !f.options.includes(v)) return { ok: false, code: "invalid_field", key: f.key };
    out[f.key] = v;
  }
  return { ok: true, value: out };
}

export type { GameField, Fulfillment };
