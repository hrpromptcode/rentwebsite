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

/** Longest player-field value accepted (also the cap for a field's maxLength). */
export const PLAYER_FIELD_MAX = 120;

/** Most length-variable quantifiers a shop pattern may use: k adjacent ones cost ~C(120 + k, k) steps (k = 4 → ~10M). */
const MAX_VARIABLE_QUANTIFIERS = 4;

/**
 * Structural ReDoS check for a shop-supplied pattern (review RV-11). Walks the source token by token (escapes and
 * character classes skipped as single atoms) and refuses: back-references; a quantified group that contains a
 * quantifier or an alternation at any depth — (a+)+, ((a+))+, (a|aa)+, (\w|\d)* (exponential backtracking); and more
 * than MAX_VARIABLE_QUANTIFIERS length-variable quantifiers (*, +, ?, {n,}, {n,m}) — \d*\d*\d*… (high-degree
 * polynomial). Exact repeats ({n}) are free. Unbalanced / odd syntax is refused here or by the RegExp compile.
 */
function fieldPatternIsSafe(s: string): boolean {
  type Frame = { quant: boolean; alt: boolean };
  const stack: Frame[] = [{ quant: false, alt: false }];
  let variable = 0;
  let last: "none" | "atom" | "group" = "none";
  let lastGroup: Frame | null = null;
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      const n = s[i + 1];
      if (n === undefined || /[1-9k]/.test(n)) return false; // dangling escape / back-reference
      if ((n === "p" || n === "P" || n === "u") && s[i + 2] === "{") {
        const end = s.indexOf("}", i + 2);
        if (end < 0) return false;
        i = end + 1;
      } else i += 2;
      last = "atom";
      lastGroup = null;
      continue;
    }
    if (c === "[") {
      let j = i + 1;
      if (s[j] === "^") j++;
      if (s[j] === "]") j++;
      while (j < s.length && s[j] !== "]") j += s[j] === "\\" ? 2 : 1;
      if (j >= s.length) return false;
      i = j + 1;
      last = "atom";
      lastGroup = null;
      continue;
    }
    if (c === "(") {
      let j = i + 1;
      if (s[j] === "?") {
        j++;
        if (s[j] === "<" && s[j + 1] !== "=" && s[j + 1] !== "!") {
          const end = s.indexOf(">", j);
          if (end < 0) return false;
          j = end + 1; // named group
        } else j += s[j] === "<" ? 2 : 1; // (?: (?= (?! (?<= (?<!
      }
      stack.push({ quant: false, alt: false });
      i = j;
      last = "none";
      lastGroup = null;
      continue;
    }
    if (c === ")") {
      const g = stack.pop();
      const parent = stack[stack.length - 1];
      if (!g || !parent) return false;
      parent.quant ||= g.quant;
      parent.alt ||= g.alt;
      last = "group";
      lastGroup = g;
      i++;
      continue;
    }
    if (c === "|") {
      stack[stack.length - 1]!.alt = true;
      last = "none";
      lastGroup = null;
      i++;
      continue;
    }
    let qLen = 0;
    let qVariable = false;
    if (c === "*" || c === "+" || c === "?") {
      qLen = 1;
      qVariable = true;
    } else if (c === "{") {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(s.slice(i));
      if (m) {
        qLen = m[0].length;
        qVariable = m[2] !== undefined && m[3] !== m[1];
      }
    }
    if (qLen) {
      if (last === "none") return false; // nothing to repeat / a quantifier on a quantifier
      if (s[i + qLen] === "?") qLen++; // lazy form
      if (last === "group" && lastGroup && (lastGroup.quant || lastGroup.alt)) return false; // (a+)+ (a|aa)+ ((a+)){2}
      if (qVariable) {
        variable++;
        stack[stack.length - 1]!.quant = true;
      }
      i += qLen;
      last = "none";
      lastGroup = null;
      continue;
    }
    last = c === "^" || c === "$" ? "none" : "atom";
    lastGroup = null;
    i++;
  }
  return stack.length === 1 && variable <= MAX_VARIABLE_QUANTIFIERS;
}

/**
 * Compiles a GameField.pattern into an anchored RegExp, or null when it is missing / invalid / unsafe. Patterns are
 * shop-supplied and run on customer input in the shared server process, so anything that could backtrack
 * catastrophically is refused (fieldPatternIsSafe, > 200 chars) — admin forms validate with this same helper.
 */
export function safeFieldPattern(src: string | null | undefined): RegExp | null {
  const s = (src ?? "").trim();
  if (!s || s.length > 200) return null;
  if (!fieldPatternIsSafe(s)) return null;
  try {
    return new RegExp(`^(?:${s})$`, "u");
  } catch {
    return null;
  }
}

export type PlayerFieldError = { ok: false; code: "missing_field" | "invalid_field"; key: string; label: string; message: string };

/**
 * Validates player fields against the game's field definitions (STOREFRONT-12): required, length (≤ 120, or the
 * field's minLength / maxLength), digits for type "number", the option list for "select" and the field's pattern.
 * Returns the cleaned record, or the first error with Thai copy naming the field (`message`, uses field.hint).
 */
export function validatePlayerFields(fields: GameField[], input: Record<string, unknown>): { ok: true; value: Record<string, string> } | PlayerFieldError {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = input[f.key];
    const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    const label = f.label || f.key;
    const bad = (code: PlayerFieldError["code"], message: string): PlayerFieldError => ({ ok: false, code, key: f.key, label, message });
    const formatMsg = f.hint ? `${label} ไม่ถูกต้อง (${f.hint})` : `${label} ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง`;
    if (!v) {
      if (f.required) return bad("missing_field", `กรุณากรอก${label}`);
      continue;
    }
    const max = Math.min(f.maxLength && f.maxLength > 0 ? f.maxLength : PLAYER_FIELD_MAX, PLAYER_FIELD_MAX);
    const len = [...v].length;
    if (len > max || (f.minLength && len < f.minLength)) return bad("invalid_field", f.hint ? formatMsg : `${label} ต้องยาว ${f.minLength ?? 1}–${max} ตัวอักษร`);
    if (/[\u0000-\u001f\u007f]/.test(v)) return bad("invalid_field", formatMsg); // control characters
    if (f.type === "number" && !/^\d+$/.test(v)) return bad("invalid_field", f.hint ? formatMsg : `${label} ต้องเป็นตัวเลขเท่านั้น`);
    if (f.type === "select" && f.options?.length && !f.options.includes(v)) return bad("invalid_field", `กรุณาเลือก${label}จากรายการ`);
    const re = f.type === "select" ? null : safeFieldPattern(f.pattern);
    if (re && !re.test(v)) return bad("invalid_field", formatMsg);
    out[f.key] = v;
  }
  return { ok: true, value: out };
}

export type { GameField, Fulfillment };
